import {
  computeFinalScore,
  LEGISLATION_PHASE_LABELS,
  priorityFromScore,
  type EventFact,
  type LegislationItem,
  type LegislationPhase,
  type MarketEvent,
  type SourceState,
} from "@finance-radar/shared";
import type { Firestore } from "firebase-admin/firestore";
import { USER_AGENT } from "../collectors/http.js";
import { fetchEffectiveFrom } from "./esbirka.js";
import { downloadPsp, finalPhase, selectLegislation } from "./psp.js";

/** Data Sněmovny se aktualizují jednou za noc; kontrola dvakrát denně stačí. */
const CHECK_EVERY_HOURS = 12;
const STATE_ID = "psp-tisky";

export interface LegislationRunResult {
  status: "skipped" | "ok" | "error";
  items?: number;
  changed?: number;
  events: MarketEvent[];
  error?: string;
}

/** Urgence události podle fáze – deterministicky, bez AI. */
const URGENCY: Partial<Record<LegislationPhase, number>> = {
  senat: 55,
  prezident: 65,
  vyhlaseno: 75,
  ucinne: 85,
  ukonceno: 30,
};

function eventTitle(item: LegislationItem): string {
  const sb = item.sbirka ? `${item.sbirka.cislo}/${item.sbirka.rok} Sb.` : "";
  switch (item.phase) {
    case "senat":
      return `Sněmovna schválila: ${item.title}`;
    case "prezident":
      return `Parlament schválil, zákon míří k prezidentovi: ${item.title}`;
    case "vyhlaseno":
      return `Vyhlášeno ve Sbírce (${sb}): ${item.title}`;
    case "ucinne":
      return `Nabývá účinnosti (${sb}): ${item.title}`;
    case "ukonceno":
      return `Projednávání skončilo bez schválení: ${item.title}`;
    default:
      return item.title;
  }
}

/** Událost pro změnu fáze zákona. ID je deterministické, takže se stejná změna nezapíše dvakrát. */
export function legislationEvent(item: LegislationItem, now: Date): MarketEvent {
  const facts: EventFact[] = [
    {
      t: "fact",
      s: `Sněmovní tisk ${item.tisk} (${item.fullTitle}) je ve stavu: ${LEGISLATION_PHASE_LABELS[item.phase]}${item.stateLabel ? ` (${item.stateLabel})` : ""}.`,
      by: "Poslanecká sněmovna",
      q: `${item.title} – ${item.stateLabel || LEGISLATION_PHASE_LABELS[item.phase]}`,
      doc: "",
    },
  ];
  if (item.sbirka) {
    facts.push({
      t: "fact",
      s: `Zákon vyšel ve Sbírce zákonů pod číslem ${item.sbirka.cislo}/${item.sbirka.rok} Sb.${item.effectiveFrom ? ` Účinnost od ${item.effectiveFrom}.` : ""}`,
      ...(item.effectiveFrom ? { per: item.effectiveFrom } : {}),
      by: "e-Sbírka",
      q: `${item.sbirka.cislo}/${item.sbirka.rok} Sb.`,
      doc: "",
    });
  }
  const scores = {
    relevance: 90,
    advisorImpact: item.phase === "ukonceno" ? 40 : 80,
    marketImpact: 60,
    urgency: URGENCY[item.phase] ?? 40,
    confidence: 95,
  };
  const finalScore = computeFinalScore(scores);
  return {
    id: `leg-${item.id}-${item.phase}`,
    title: eventTitle(item),
    summary: `${item.fullTitle}. Navrhovatel: ${item.proposer || "neuveden"}. Stav: ${LEGISLATION_PHASE_LABELS[item.phase]}${item.effectiveFrom ? `, účinnost od ${new Date(item.effectiveFrom).toLocaleDateString("cs-CZ")}` : ""}.`,
    categories: item.categories,
    entities: ["Poslanecká sněmovna", ...item.matched],
    firstSeenAt: now.toISOString(),
    updatedAt: now.toISOString(),
    documentIds: [],
    sourceIds: item.sbirka ? [STATE_ID, "e-sbirka"] : [STATE_ID],
    bestTier: 1,
    scores,
    finalScore,
    priority: priorityFromScore(finalScore),
    verification: "verified_primary",
    facts,
    revision: 1,
    links: [
      { label: `Sněmovní tisk ${item.tisk} na psp.cz`, url: item.url },
      ...(item.sbirka
        ? [{ label: `${item.sbirka.cislo}/${item.sbirka.rok} Sb. v e-Sbírce`, url: `https://www.e-sbirka.cz/sb/${item.sbirka.rok}/${item.sbirka.cislo}` }]
        : []),
    ],
  };
}

const COMPARED: (keyof LegislationItem)[] = ["phase", "stateLabel", "lastStepAt", "sbirka", "effectiveFrom", "title", "fullTitle", "matched"];
const changedFields = (a: LegislationItem | undefined, b: LegislationItem) =>
  !a || COMPARED.some((k) => JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null));

/**
 * Synchronizuje relevantní zákony (data Sněmovny + účinnost z e-Sbírky) a při změně fáze
 * vytvoří událost. Při úplně prvním běhu události nevznikají (jinak by přišla lavina).
 */
export async function runLegislation(db: Firestore, now = new Date()): Promise<LegislationRunResult> {
  const stateRef = db.collection("sourceState").doc(STATE_ID);
  const state = { consecutiveErrors: 0, lastNewCount: 0, seen: [], ...((await stateRef.get()).data() as Partial<SourceState>) };
  if (state.lastFetchedAt && now.getTime() - new Date(state.lastFetchedAt).getTime() < (CHECK_EVERY_HOURS - 0.05) * 3_600_000) {
    return { status: "skipped", events: [] };
  }

  try {
    const selected = selectLegislation(await downloadPsp(USER_AGENT), now);
    const existingSnap = await db.collection("legislation").get();
    const existing = new Map(existingSnap.docs.map((d) => [d.id, d.data() as LegislationItem]));
    const firstRun = existing.size === 0;
    const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(now);

    const items: LegislationItem[] = [];
    for (const s of selected) {
      const prev = existing.get(s.id);
      // Účinnost se ptá e-Sbírky jen jednou (u stejného čísla ve Sbírce se nemění).
      let effectiveFrom = prev?.sbirka?.cislo === s.sbirka?.cislo ? prev?.effectiveFrom : undefined;
      if (s.sbirka && !effectiveFrom) {
        effectiveFrom = (await fetchEffectiveFrom(s.sbirka.rok, s.sbirka.cislo, USER_AGENT).catch(() => null)) ?? undefined;
      }
      items.push({
        ...s,
        phase: finalPhase(s.phase, !!s.sbirka, effectiveFrom, today),
        ...(effectiveFrom ? { effectiveFrom } : {}),
        updatedAt: now.toISOString(),
      });
    }

    const changed = items.filter((it) => changedFields(existing.get(it.id), it));
    const events = firstRun
      ? []
      : changed
          .filter((it) => {
            const prevPhase = existing.get(it.id)?.phase;
            return it.phase !== "snemovna" && it.phase !== prevPhase;
          })
          .map((it) => legislationEvent(it, now));

    // Zápisy po dávkách (limit 500 operací na dávku).
    let batch = db.batch();
    let ops = 0;
    const flush = async () => {
      if (ops > 0) await batch.commit();
      batch = db.batch();
      ops = 0;
    };
    for (const it of changed) {
      batch.set(db.collection("legislation").doc(it.id), it);
      if (++ops >= 450) await flush();
    }
    for (const e of events) {
      batch.set(db.collection("events").doc(e.id), e, { merge: true });
      if (++ops >= 450) await flush();
    }
    batch.set(stateRef, {
      ...state,
      seen: [],
      lastFetchedAt: now.toISOString(),
      lastSuccessAt: now.toISOString(),
      lastError: null,
      consecutiveErrors: 0,
      lastNewCount: changed.length,
      ...(changed.length > 0 ? { lastNewAt: now.toISOString() } : {}),
    } satisfies SourceState);
    await flush();

    // Stav e-Sbírky pro stránku „Stav systému“.
    await db.collection("sourceState").doc("e-sbirka").set(
      { lastFetchedAt: now.toISOString(), lastSuccessAt: now.toISOString(), consecutiveErrors: 0, lastNewCount: 0, seen: [] },
      { merge: true },
    );

    return { status: "ok", items: items.length, changed: changed.length, events };
  } catch (e) {
    const message = (e as Error).message.slice(0, 300);
    await stateRef.set(
      { ...state, lastFetchedAt: now.toISOString(), lastError: message, consecutiveErrors: state.consecutiveErrors + 1 },
      { merge: true },
    );
    return { status: "error", error: message, events: [] };
  }
}
