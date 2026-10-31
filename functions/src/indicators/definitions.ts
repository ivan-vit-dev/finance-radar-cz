import type { Category, ChangeMode, IndicatorPoint } from "@finance-radar/shared";
import { ARAD_SERIES, fetchAradSeries } from "../collectors/arad.js";
import { fetchCnbFxRate, fetchRepoRateHistory } from "../collectors/cnb.js";
import { fetchCsuSeries } from "../collectors/csu.js";

/** Sdílený kontext jednoho běhu – ARAD se stahuje jedním dotazem pro všechny řady. */
export interface FetchContext {
  aradApiKey?: string;
  arad(): Promise<Record<string, IndicatorPoint[]>>;
}

export interface IndicatorDef {
  id: string;
  label: string;
  unit: string;
  decimals: number;
  source: string;
  category: Category;
  mode: ChangeMode;
  /** Popisek změny na dashboardu. */
  changeLabel: string;
  checkEveryHours: number;
  /** Kolik bodů historie držet (šetří místo). */
  keep: number;
  trendLookback: number;
  trendThreshold: number;
  /** Krátký popisek do trendů na dashboardu, např. „sazby hypoték“. */
  trendLabel?: string;
  /** true = zdroj vrací jen aktuální hodnotu, historie se skládá postupně. */
  appendOnly?: boolean;
  fetch(ctx: FetchContext): Promise<IndicatorPoint[]>;
}

const month = (date: string) => date.slice(0, 7);
const r4 = (v: number) => Math.round(v * 10_000) / 10_000;

const aradSeries = (id: string, scale = 1) => async (ctx: FetchContext) =>
  ((await ctx.arad())[id] ?? []).map((x) => ({ p: x.p, v: r4(x.v * scale) }));

/** Pořadí určuje pořadí karet na dashboardu. */
export const INDICATORS: IndicatorDef[] = [
  {
    id: "repo_rate",
    label: "Repo sazba ČNB",
    unit: "%",
    decimals: 2,
    source: "ČNB",
    category: "cnb",
    mode: "pb",
    changeLabel: "poslední změna",
    checkEveryHours: 6,
    keep: 30,
    trendLookback: 1,
    trendThreshold: 0.01,
    trendLabel: "repo sazba",
    fetch: async () => (await fetchRepoRateHistory()).map((x) => ({ p: x.date, v: x.value })),
  },
  {
    id: "mortgage_rate",
    label: "Sazba nových hypoték",
    unit: "%",
    decimals: 2,
    source: "ČNB ARAD",
    category: "mortgages",
    mode: "pb",
    changeLabel: "m/m",
    checkEveryHours: 12,
    keep: 25,
    trendLookback: 3,
    trendThreshold: 0.1,
    trendLabel: "sazby hypoték",
    fetch: aradSeries(ARAD_SERIES.mortgageRateNew),
  },
  {
    id: "inflation",
    label: "Inflace (meziročně)",
    unit: "%",
    decimals: 1,
    source: "ČSÚ",
    category: "economy",
    mode: "pb",
    changeLabel: "m/m",
    checkEveryHours: 12,
    keep: 25,
    trendLookback: 3,
    trendThreshold: 0.3,
    trendLabel: "inflace",
    fetch: async () => (await fetchCsuSeries("CEN0101HT02", "CasM", "IndicatorType", "6134J05")).points,
  },
  {
    id: "eur_czk",
    label: "EUR/CZK",
    unit: "Kč",
    decimals: 3,
    source: "ČNB",
    category: "markets",
    mode: "pct",
    changeLabel: "d/d",
    checkEveryHours: 3,
    keep: 60,
    trendLookback: 20,
    trendThreshold: 0.5,
    appendOnly: true,
    fetch: async () => {
      const r = await fetchCnbFxRate("EUR");
      return [{ p: r.date, v: r.value }];
    },
  },
  {
    id: "mortgage_volume",
    label: "Objem nových hypoték",
    unit: "mld. Kč",
    decimals: 1,
    source: "ČNB ARAD",
    category: "mortgages",
    mode: "pct",
    changeLabel: "m/m",
    checkEveryHours: 12,
    keep: 25,
    trendLookback: 3,
    trendThreshold: 5,
    fetch: aradSeries(ARAD_SERIES.mortgageVolumeNew, 1e-9),
  },
  {
    id: "consumer_loan_rate",
    label: "Sazba spotřebitelských úvěrů",
    unit: "%",
    decimals: 2,
    source: "ČNB ARAD",
    category: "consumer_loans",
    mode: "pb",
    changeLabel: "m/m",
    checkEveryHours: 12,
    keep: 25,
    trendLookback: 3,
    trendThreshold: 0.1,
    trendLabel: "sazby úvěrů",
    fetch: aradSeries(ARAD_SERIES.consumerLoanRateNew),
  },
];

/** Kontext s líným (jednorázovým) stažením všech potřebných řad z ARAD. */
export function createFetchContext(aradApiKey: string | undefined): FetchContext {
  let arad: Promise<Record<string, IndicatorPoint[]>> | undefined;
  return {
    aradApiKey,
    arad() {
      if (!aradApiKey) return Promise.reject(new Error("Chybí CNB_ARAD_API_KEY"));
      arad ??= fetchAradSeries(Object.values(ARAD_SERIES), aradApiKey, 25).then((series) =>
        Object.fromEntries(
          Object.entries(series).map(([id, pts]) => [id, pts.map((x) => ({ p: month(x.date), v: x.value }))]),
        ),
      );
      return arad;
    },
  };
}
