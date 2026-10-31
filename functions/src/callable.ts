import type { Briefing, DashboardSnapshot, MarketEvent } from "@finance-radar/shared";
import { BRIEFING_PROMPT_VERSION, generateBriefing } from "./ai/briefing.js";
import type { Firestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { HttpsError } from "firebase-functions/v2/https";
import { INDICATORS } from "./indicators/definitions.js";
import type { IndicatorDoc } from "./indicators/update.js";
import { marketContextFrom } from "./pipeline/context.js";
import { analyzeEvent } from "./pipeline/process.js";
import { pragueDate, recordUsage, spentToday } from "./pipeline/usage.js";
import { readPauseState } from "./runtime.js";

/** Denní strop pro AI celkem, včetně analýz na vyžádání (automatika má vlastní nižší limit $1). */
export const DAILY_TOTAL_LIMIT_USD = 3;
/** Jak dlouho platí „analýza se generuje“, než ji smí spustit někdo další (ochrana proti dvojímu placení). */
const LOCK_MS = 3 * 60_000;

export type AnalyzeStatus = "ready" | "generated" | "in_progress";

/** Volající musí být přihlášený a mít dokument v `admins` (stejně jako Firestore rules). */
export async function assertAdmin(db: Firestore, uid: string | undefined): Promise<void> {
  if (!uid) throw new HttpsError("unauthenticated", "Je potřeba se přihlásit.");
  const admin = await db.collection("admins").doc(uid).get();
  if (!admin.exists) throw new HttpsError("permission-denied", "Účet nemá přístup do aplikace.");
}

/** Pauza a denní strop – společné pro všechny funkce, které volají AI. */
async function assertCanSpend(db: Firestore, now: Date): Promise<void> {
  const pause = await readPauseState(db, now);
  if (pause.paused) throw new HttpsError("failed-precondition", `Aplikace je pozastavena do ${pause.until}.`);
  if ((await spentToday(db, now)) >= DAILY_TOTAL_LIMIT_USD) {
    throw new HttpsError("resource-exhausted", `Denní limit $${DAILY_TOTAL_LIMIT_USD} za AI je vyčerpán.`);
  }
}

/**
 * Analýza „pro poradce“ na vyžádání. Výsledek se uloží do události; klient ho dostane
 * přes živý odběr dokumentu. Stejná revize události se nikdy neanalyzuje dvakrát.
 */
export async function handleAnalyzeEvent(db: Firestore, uid: string | undefined, eventId: unknown, now = new Date()) {
  await assertAdmin(db, uid);
  if (typeof eventId !== "string" || !/^[\w-]{1,64}$/.test(eventId)) {
    throw new HttpsError("invalid-argument", "Neplatné ID události.");
  }
  await assertCanSpend(db, now);

  const ref = db.collection("events").doc(eventId);
  // Zámek v transakci: když analýzu právě generuje někdo jiný, nespouštět ji podruhé.
  const claim = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Událost neexistuje.");
    const e = snap.data() as MarketEvent & { analysisRequestedAt?: string };
    if (e.analysis?.revision === e.revision) return { status: "ready" as const };
    if (e.analysisRequestedAt && now.getTime() - new Date(e.analysisRequestedAt).getTime() < LOCK_MS) {
      return { status: "in_progress" as const };
    }
    tx.update(ref, { analysisRequestedAt: now.toISOString() });
    return { status: "claimed" as const, event: e };
  });
  if (claim.status !== "claimed") return { status: claim.status satisfies AnalyzeStatus };

  try {
    const indicatorDocs = (await db.getAll(...INDICATORS.map((d) => db.collection("indicators").doc(d.id)))).map(
      (s) => s.data() as IndicatorDoc | undefined,
    );
    const { value, cost } = await analyzeEvent(claim.event, marketContextFrom(indicatorDocs));
    await recordUsage(db, now, [cost]);
    await ref.update({ analysis: value, analysisRequestedAt: null });
    return { status: "generated" as AnalyzeStatus };
  } catch (e) {
    await ref.update({ analysisRequestedAt: null });
    if (e instanceof HttpsError) throw e;
    throw new HttpsError("internal", "Analýzu se nepodařilo vytvořit, zkus to prosím znovu.");
  }
}

// ---------------------------------------------------------------------------
// Briefing (fáze 6)

/** Briefing shrnuje období od předchozího briefingu, nejvýš týden. */
const BRIEFING_MAX_DAYS = 7;
const BRIEFING_MIN_SCORE = 40;
const BRIEFING_MAX_EVENTS = 12;

/** Popisek období pro model a UI: „posledních 24 h“ nebo „24. 10. – 31. 10. 2026 (7 dní)“. */
export function periodLabel(from: Date, to: Date): string {
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000);
  const d = (x: Date) => x.toLocaleDateString("cs-CZ", { timeZone: "Europe/Prague" });
  if (days <= 1) return `${d(to)} (posledních 24 h)`;
  return `${d(from)} – ${d(to)} (${days} ${days < 5 ? "dny" : "dní"})`;
}

/**
 * Briefing při prvním otevření aplikace v daný den. Když se v období nic důležitého
 * nestalo, vznikne „klidný“ briefing bez volání AI (zdarma).
 */
export async function handleGetBriefing(db: Firestore, uid: string | undefined, now = new Date()) {
  await assertAdmin(db, uid);
  const today = pragueDate(now);
  const ref = db.collection("briefings").doc(today);

  const existing = await ref.get();
  if (existing.exists && existing.data()?.generatedAt) return { status: "ready" as AnalyzeStatus, date: today };
  await assertCanSpend(db, now);

  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data();
    if (data?.generatedAt) return "ready" as const;
    if (data?.requestedAt && now.getTime() - new Date(data.requestedAt).getTime() < LOCK_MS) return "in_progress" as const;
    tx.set(ref, { date: today, requestedAt: now.toISOString() }, { merge: true });
    return "claimed" as const;
  });
  if (claimed !== "claimed") return { status: claimed, date: today };

  try {
    // Období: od konce předchozího briefingu, nejvýš týden zpět.
    const prev = await db.collection("briefings").where("date", "<", today).orderBy("date", "desc").limit(1).get();
    const prevTo = prev.docs[0]?.data().coversTo as string | undefined;
    const earliest = new Date(now.getTime() - BRIEFING_MAX_DAYS * 86_400_000);
    const from = prevTo && new Date(prevTo) > earliest ? new Date(prevTo) : new Date(now.getTime() - 86_400_000);
    const coversFrom = (from < earliest ? earliest : from).toISOString();

    const eventsSnap = await db.collection("events").where("updatedAt", ">=", coversFrom).limit(300).get();
    const events = eventsSnap.docs
      .map((d) => d.data() as MarketEvent)
      .filter((e) => e.finalScore >= BRIEFING_MIN_SCORE)
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, BRIEFING_MAX_EVENTS);

    const dashboard = (await db.collection("dashboard").doc("today").get()).data() as DashboardSnapshot | undefined;
    const base = {
      date: today,
      coversFrom,
      coversTo: now.toISOString(),
      generatedAt: now.toISOString(),
      numbers: dashboard?.indicators ?? [],
      events: events.map((e) => ({ id: e.id, title: e.title, priority: e.priority, finalScore: e.finalScore })),
    };

    let briefing: Briefing;
    if (events.length === 0) {
      briefing = {
        ...base,
        kind: "quiet",
        headline: "Klidné období: žádná událost nepřekročila práh důležitosti.",
        sections: [],
        forAdvisor: [],
      };
    } else {
      const indicatorDocs = (await db.getAll(...INDICATORS.map((d) => db.collection("indicators").doc(d.id)))).map(
        (s) => s.data() as IndicatorDoc | undefined,
      );
      const r = await generateBriefing({
        periodLabel: periodLabel(new Date(coversFrom), now),
        events,
        marketContext: marketContextFrom(indicatorDocs),
      });
      await recordUsage(db, now, [r.cost]);
      briefing = {
        ...base,
        kind: "ai",
        model: r.servedBy,
        promptVersion: BRIEFING_PROMPT_VERSION,
        headline: r.content.headline,
        topStory: r.content.topStory,
        sections: r.content.sections,
        forAdvisor: r.content.forAdvisor,
      };
    }
    await ref.set({ ...briefing, requestedAt: null });
    return { status: "generated" as AnalyzeStatus, date: today };
  } catch (e) {
    await ref.set({ requestedAt: null }, { merge: true });
    if (e instanceof HttpsError) throw e;
    throw new HttpsError("internal", "Briefing se nepodařilo vytvořit, zkus to prosím znovu.");
  }
}

// ---------------------------------------------------------------------------
// Zkušební notifikace (nastavení alertů)

/** Pošle zkušební push na všechna zařízení volajícího – ověření, že notifikace dorazí. */
export async function handleSendTestNotification(db: Firestore, uid: string | undefined, appUrl: string) {
  await assertAdmin(db, uid);
  const devices = await db.collection("users").doc(uid!).collection("devices").get();
  const tokens = devices.docs.map((d) => d.data().token as string | undefined).filter((t): t is string => !!t);
  if (tokens.length === 0) {
    throw new HttpsError("failed-precondition", "Nemáš zaregistrované žádné zařízení. Nejdřív zapni notifikace.");
  }
  const res = await getMessaging().sendEachForMulticast({
    tokens,
    notification: { title: "🔔 Finance Radar", body: "Zkušební notifikace: alerty na tomto zařízení fungují." },
    webpush: appUrl ? { fcmOptions: { link: appUrl } } : undefined,
  });
  return { sent: res.successCount, failed: res.failureCount };
}
