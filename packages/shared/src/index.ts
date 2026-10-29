// Sdílené doménové typy a deterministická logika (scoring) pro web i Cloud Functions.
// Pravidlo ze specifikace (bod 31): výpočty, procenta a prahy počítá kód, nikdy AI.

export type Category =
  | "mortgages"
  | "consumer_loans"
  | "cnb"
  | "banks"
  | "real_estate"
  | "insurance"
  | "economy"
  | "legislation"
  | "markets";

export type SourceTier = 1 | 2 | 3 | 4;

export type SourceKind = "rss" | "api" | "html" | "pdf";

export interface Source {
  id: string;
  name: string;
  kind: SourceKind;
  url: string;
  tier: SourceTier;
  /** Váha zdroje při ověřování (bod 37), 0–100. */
  priority: number;
  /** Jak často se má zdroj kontrolovat. */
  frequencyMinutes: number;
  categories: Category[];
  enabled: boolean;
  lastFetchedAt?: string;
  lastError?: string;
}

/** Surový stažený dokument. Po uložení se nemění (bod 32). */
export interface SourceDocument {
  id: string;
  sourceId: string;
  url: string;
  title: string;
  publishedAt: string;
  fetchedAt: string;
  contentHash: string;
  /** Cesta k plnému textu v Cloud Storage. */
  storagePath: string;
  status: "new" | "classified" | "discarded" | "clustered" | "error";
}

export type StatementType = "fact" | "interpretation" | "forecast" | "opinion";

export type VerificationStatus =
  | "verified_primary" // 🟢 ověřeno primárním zdrojem
  | "confirmed_multiple" // 🔵 potvrzeno více zdroji
  | "secondary" // 🟡 sekundární zdroj
  | "pending" // 🟠 čeká na ověření
  | "conflict"; // 🔴 rozpor mezi zdroji

export interface Fact {
  id: string;
  eventId: string;
  type: StatementType;
  statement: string;
  value?: number;
  unit?: string;
  date?: string;
  sourceDocumentId: string;
  confidence: number;
  verification: VerificationStatus;
}

export type ImpactLevel = "high" | "medium" | "low" | "none";

export interface ScoreInputs {
  relevance: number;
  urgency: number;
  marketImpact: number;
  advisorImpact: number;
  confidence: number;
}

export type Priority = "critical" | "high" | "important" | "info" | "low";

export interface MarketEvent {
  id: string;
  title: string;
  categories: Category[];
  firstSeenAt: string;
  updatedAt: string;
  sourceDocumentIds: string[];
  primarySourceId?: string;
  scores: ScoreInputs;
  finalScore: number;
  priority: Priority;
  verification: VerificationStatus;
  impact: Partial<Record<Category, ImpactLevel>>;
  analysis?: {
    whatHappened: string;
    why: string;
    meaning: string;
    whoIsAffected: string[];
    whatToWatch: string[];
    forAdvisor: string;
    model: string;
    promptVersion: string;
    generatedAt: string;
  };
}

export type Trend = "up" | "down" | "flat";

/**
 * Předpočítaný dokument `dashboard/today`. Dashboard čte jen tento jeden
 * dokument, aby se držel hluboko pod denními limity čtení Firestore.
 */
export interface DashboardSnapshot {
  date: string;
  updatedAt: string;
  criticalCount: number;
  topEvents: Pick<MarketEvent, "id" | "title" | "priority" | "finalScore" | "categories" | "verification">[];
  indicators: {
    id: string;
    label: string;
    value: number;
    unit: string;
    /** Změna proti předchozí hodnotě, spočítaná kódem. */
    change?: number;
    changeUnit?: string;
    asOf: string;
  }[];
  categoryTrends: { category: Category; label: string; trend: Trend }[];
}

/** Váhy finálního skóre (bod 12 specifikace). */
export const SCORE_WEIGHTS: Record<keyof ScoreInputs, number> = {
  advisorImpact: 0.35,
  marketImpact: 0.25,
  urgency: 0.2,
  relevance: 0.1,
  confidence: 0.1,
};

export function computeFinalScore(s: ScoreInputs): number {
  const total = (Object.keys(SCORE_WEIGHTS) as (keyof ScoreInputs)[]).reduce(
    (sum, key) => sum + clamp(s[key], 0, 100) * SCORE_WEIGHTS[key],
    0,
  );
  return Math.round(total);
}

export function priorityFromScore(score: number): Priority {
  if (score >= 90) return "critical";
  if (score >= 75) return "high";
  if (score >= 55) return "important";
  if (score >= 30) return "info";
  return "low";
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  critical: "Kritické",
  high: "Vysoká priorita",
  important: "Důležité",
  info: "Informativní",
  low: "Nízká priorita",
};

export const CATEGORY_LABELS: Record<Category, string> = {
  mortgages: "Hypotéky",
  consumer_loans: "Spotřebitelské úvěry",
  cnb: "ČNB",
  banks: "Banky",
  real_estate: "Nemovitosti",
  insurance: "Pojištění",
  economy: "Ekonomika",
  legislation: "Legislativa",
  markets: "Finanční trh",
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
