import type { MarketEvent } from "@finance-radar/shared";
import type { Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { INDICATORS } from "./indicators/definitions.js";
import type { IndicatorDoc } from "./indicators/update.js";
import { marketContextFrom } from "./pipeline/context.js";
import { analyzeEvent } from "./pipeline/process.js";
import { recordUsage, spentToday } from "./pipeline/usage.js";
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

/**
 * Analýza „pro poradce“ na vyžádání. Výsledek se uloží do události; klient ho dostane
 * přes živý odběr dokumentu. Stejná revize události se nikdy neanalyzuje dvakrát.
 */
export async function handleAnalyzeEvent(db: Firestore, uid: string | undefined, eventId: unknown, now = new Date()) {
  await assertAdmin(db, uid);
  if (typeof eventId !== "string" || !/^[\w-]{1,64}$/.test(eventId)) {
    throw new HttpsError("invalid-argument", "Neplatné ID události.");
  }
  const pause = await readPauseState(db, now);
  if (pause.paused) throw new HttpsError("failed-precondition", `Aplikace je pozastavena do ${pause.until}.`);
  if ((await spentToday(db, now)) >= DAILY_TOTAL_LIMIT_USD) {
    throw new HttpsError("resource-exhausted", `Denní limit $${DAILY_TOTAL_LIMIT_USD} za AI je vyčerpán.`);
  }

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
