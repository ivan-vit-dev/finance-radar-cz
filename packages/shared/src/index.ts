// Sdílené doménové typy a deterministická logika (scoring) pro web i Cloud Functions.
// Pravidlo ze specifikace (bod 31): výpočty, procenta a prahy počítá kód, nikdy AI.

export const CATEGORIES = [
  "mortgages",
  "consumer_loans",
  "cnb",
  "banks",
  "real_estate",
  "insurance",
  "economy",
  "legislation",
  "markets",
] as const;

export type Category = (typeof CATEGORIES)[number];

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
}

/** Provozní stav zdroje, kolekce `sourceState/{sourceId}`. Konfigurace zdroje je v kódu. */
export interface SourceState {
  lastFetchedAt?: string;
  lastSuccessAt?: string;
  lastError?: string | null;
  consecutiveErrors: number;
  lastNewCount: number;
  /** Hashe nedávno viděných URL (nejnovější první, omezený počet) – dedup za 1 čtení na zdroj. */
  seen: string[];
}

export type DocumentStatus = "pending" | "classified" | "discarded" | "error";

/**
 * Šetrný záznam o dokumentu, kolekce `documents/{id}`, id = hash kanonické URL.
 * Plný text se neukládá: stáhne se jen při zpracování AI a zahodí se.
 * Jako důkaz slouží odkaz a doslovné citace u extrahovaných faktů.
 */
export interface SourceDocument {
  id: string;
  sourceId: string;
  tier: SourceTier;
  url: string;
  title: string;
  /** Perex z RSS, zkrácený na PEREX_MAX_CHARS. */
  perex: string;
  publishedAt: string | null;
  fetchedAt: string;
  status: DocumentStatus;
}

export const PEREX_MAX_CHARS = 300;
export const TITLE_MAX_CHARS = 300;

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
    decimals: number;
    /** Změna proti předchozí hodnotě, spočítaná kódem. */
    change?: number;
    changeUnit?: string;
    /** Období, ke kterému se změna vztahuje, např. „m/m“, „proti 31. 10.“. */
    changeLabel?: string;
    /** Období hodnoty: „2026-09“ (měsíc) nebo „2026-10-30“ (den). */
    asOf: string;
  }[];
  categoryTrends: { category: Category; label: string; trend: Trend }[];
}

// ---------------------------------------------------------------------------
// Tržní ukazatele (fáze 3). Vše deterministické, žádná AI.

/** Bod časové řady v kompaktní podobě (šetří místo ve Firestore). p = "YYYY-MM" nebo "YYYY-MM-DD". */
export interface IndicatorPoint {
  p: string;
  v: number;
}

/**
 * Jak počítat změnu:
 * - "pb": rozdíl v procentních bodech (sazby, inflace)
 * - "pct": relativní změna v % (kurz, objemy)
 */
export type ChangeMode = "pb" | "pct";

export interface IndicatorStats {
  latest: IndicatorPoint;
  previous?: IndicatorPoint;
  /** Změna proti předchozímu bodu řady. */
  change?: number;
  /** Změna proti stejnému období před rokem (jen měsíční řady). */
  changeYoY?: number;
  min: IndicatorPoint;
  max: IndicatorPoint;
  trend: Trend;
}

/**
 * Spočítá statistiky z řady seřazené od nejstarší. Trend porovnává poslední hodnotu
 * s hodnotou `trendLookback` bodů zpět; změna menší než `trendThreshold` je „flat“.
 */
export function computeIndicatorStats(
  points: IndicatorPoint[],
  mode: ChangeMode,
  trendLookback: number,
  trendThreshold: number,
): IndicatorStats | null {
  if (points.length === 0) return null;
  const latest = points[points.length - 1];
  const previous = points.length > 1 ? points[points.length - 2] : undefined;
  const diff = (a: number, b: number) => (mode === "pb" ? a - b : ((a - b) / b) * 100);

  const yearAgoPeriod = /^\d{4}-\d{2}$/.test(latest.p)
    ? `${Number(latest.p.slice(0, 4)) - 1}${latest.p.slice(4)}`
    : undefined;
  const yearAgo = yearAgoPeriod ? points.find((x) => x.p === yearAgoPeriod) : undefined;

  const base = points[Math.max(0, points.length - 1 - trendLookback)];
  const trendDelta = diff(latest.v, base.v);
  const trend: Trend =
    base === latest || Math.abs(trendDelta) < trendThreshold ? "flat" : trendDelta > 0 ? "up" : "down";

  // Chybějící hodnoty se vynechávají úplně (Firestore neumí uložit `undefined`).
  return {
    latest,
    ...(previous ? { previous, change: round(diff(latest.v, previous.v), 4) } : {}),
    ...(yearAgo ? { changeYoY: round(diff(latest.v, yearAgo.v), 4) } : {}),
    min: points.reduce((m, x) => (x.v < m.v ? x : m)),
    max: points.reduce((m, x) => (x.v > m.v ? x : m)),
    trend,
  };
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
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
