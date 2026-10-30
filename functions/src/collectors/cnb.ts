import { fetchText } from "./http.js";

// Deterministické zdroje ČNB (bez AI). Formáty viz docs/zdroje.md.

export interface RatePoint {
  /** YYYY-MM-DD */
  date: string;
  value: number;
}

/** Celá historie 2T repo sazby, seřazená od nejstarší. */
export async function fetchRepoRateHistory(): Promise<RatePoint[]> {
  const { text } = await fetchText("https://www.cnb.cz/cs/faq/vyvoj_repo_historie.txt");
  // Formát: hlavička "PLATNA_OD|CNB_REPO_SAZBA_V_%", pak řádky "19951208|11,30"
  return text
    .split(/\r?\n/)
    .slice(1)
    .map((line) => /^(\d{4})(\d{2})(\d{2})\|([\d,]+)$/.exec(line.trim()))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ date: `${m[1]}-${m[2]}-${m[3]}`, value: Number(m[4].replace(",", ".")) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Kurz ČNB pro danou měnu (kolik CZK za `amount` jednotek). */
export async function fetchCnbFxRate(currencyCode: string): Promise<RatePoint> {
  const { text } = await fetchText("https://api.cnb.cz/cnbapi/exrates/daily?lang=EN");
  const data = JSON.parse(text) as {
    rates: { currencyCode: string; amount: number; rate: number; validFor: string }[];
  };
  const r = data.rates.find((x) => x.currencyCode === currencyCode);
  if (!r) throw new Error(`Kurz ${currencyCode} v odpovědi ČNB chybí`);
  return { date: r.validFor, value: r.rate / r.amount };
}
