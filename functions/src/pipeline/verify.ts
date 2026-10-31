import {
  computeFinalScore,
  priorityFromScore,
  type EventFact,
  type IndicatorPoint,
  type MarketEvent,
  type ScoreInputs,
  type SourceTier,
  type VerificationStatus,
} from "@finance-radar/shared";

// Ověřování faktů a skórování událostí – deterministicky, bez AI (bod 9 a 31 specifikace).

/**
 * Které extrahované ukazatele lze porovnat s vlastními daty a s jakou tolerancí.
 * Sazby hypoték z médií se neporovnávají: média často citují jinou metodiku
 * (Hypoindex, ČBA) než ČNB, takže rozdíl by nebyl rozpor, ale planý poplach.
 */
const CHECKABLE: Record<string, { indicator: string; tolerance: number }> = {
  repo_rate: { indicator: "repo_rate", tolerance: 0.001 },
  cpi_inflation_yoy: { indicator: "inflation", tolerance: 0.05 },
  eur_czk: { indicator: "eur_czk", tolerance: 0.02 },
};

/** Hodnota ukazatele platná pro dané období (u repo jde o skokovou řadu: poslední změna ≤ období). */
function valueForPeriod(indicator: string, points: IndicatorPoint[], period: string): number | undefined {
  if (indicator === "repo_rate") {
    const end = /^\d{4}-\d{2}$/.test(period) ? `${period}-31` : period;
    const valid = points.filter((x) => x.p <= end);
    return valid.length ? valid[valid.length - 1].v : undefined;
  }
  return points.find((x) => x.p === period)?.v;
}

/**
 * Porovná číselná fakta s ukazateli. Výsledek: "ok" (sedí), "conflict" (nesedí),
 * nebo bez značky (nelze porovnat – chybí období nebo data). Odhady a názory se neověřují.
 */
export function checkFacts(facts: EventFact[], indicators: Record<string, IndicatorPoint[]>): EventFact[] {
  return facts.map((f) => {
    const rule = f.sub ? CHECKABLE[f.sub] : undefined;
    if (f.t !== "fact" || !rule || f.v === undefined || !f.per) return f;
    const expected = valueForPeriod(rule.indicator, indicators[rule.indicator] ?? [], f.per);
    if (expected === undefined) return f;
    return { ...f, chk: Math.abs(expected - f.v) <= rule.tolerance ? "ok" : "conflict" };
  });
}

export function verificationOf(facts: EventFact[], bestTier: SourceTier, sourceCount: number): VerificationStatus {
  if (facts.some((f) => f.chk === "conflict")) return "conflict";
  if (bestTier === 1) return "verified_primary";
  if (sourceCount >= 2) return "confirmed_multiple";
  if (bestTier <= 3) return "secondary";
  return "pending";
}

const CONFIDENCE: Record<VerificationStatus, number> = {
  verified_primary: 95,
  confirmed_multiple: 85,
  secondary: 65,
  pending: 45,
  conflict: 30,
};

type ClassificationScores = Omit<ScoreInputs, "confidence">;

/** Skóre události = maximum dílčích skóre ze všech jejích článků + důvěryhodnost z ověření. */
export function scoreEvent(
  perDocument: ClassificationScores[],
  verification: VerificationStatus,
): Pick<MarketEvent, "scores" | "finalScore" | "priority"> {
  const max = (k: keyof ClassificationScores) => Math.max(0, ...perDocument.map((d) => d[k]));
  const scores: ScoreInputs = {
    relevance: max("relevance"),
    advisorImpact: max("advisorImpact"),
    marketImpact: max("marketImpact"),
    urgency: max("urgency"),
    confidence: CONFIDENCE[verification],
  };
  const finalScore = computeFinalScore(scores);
  return { scores, finalScore, priority: priorityFromScore(finalScore) };
}

/** Sloučí fakta, vynechá duplicitní tvrzení a omezí počet (šetří místo). */
export function mergeFacts(existing: EventFact[], incoming: EventFact[], cap = 12): EventFact[] {
  const key = (f: EventFact) => f.s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const seen = new Set(existing.map(key));
  const out = [...existing];
  for (const f of incoming) {
    if (out.length >= cap) break;
    if (seen.has(key(f))) continue;
    seen.add(key(f));
    out.push(f);
  }
  return out;
}
