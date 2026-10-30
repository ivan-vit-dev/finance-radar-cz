import { fetchText } from "./http.js";
import type { RatePoint } from "./cnb.js";

// ČNB ARAD REST API. Dokumentace: https://www.cnb.cz/docs/arad20/dokumentace/arad_rest_api_cs.pdf
// Odpověď: CSV se středníky, windows-1250. Objemy chodí v jednotkách (CZK), ne v řádech z metadat.

const BASE = "https://www.cnb.cz/aradb/api/v1";

/** Vybrané řady (měsíční). ID a ověření viz docs/zdroje.md. */
export const ARAD_SERIES = {
  mortgageRateNew: "SMIRNOOBUVMIRS405CZK011111",
  mortgageRateNetNew: "SMIRNOOBUVMIRS305CZK013111",
  mortgageAprcNew: "SMIRNOOBUVMRPS405CZK011111",
  mortgageVolumeNew: "SMIRNOOBUVMOBJ405CZK011111",
  mortgageVolumeNetNew: "SMIRNOOBUVMOBJ305CZK013111",
  mortgageVolumeRefinanced: "SMIRNOOBUVMOBJ305CZK012111",
  consumerLoanRateNew: "SMIRNOOBUVMIRS404CZK011111",
  savingsDepositRate: "SMIRNOOBVKMIRS405CZK1",
  termDepositRate: "SMIRNOOBVKMIRS406CZK1",
} as const;

/** Stáhne posledních `monthsBefore` měsíců pro dané řady; výsledek seřazený od nejstarší hodnoty. */
export async function fetchAradSeries(
  indicatorIds: string[],
  apiKey: string,
  monthsBefore = 13,
): Promise<Record<string, RatePoint[]>> {
  const qs = new URLSearchParams({
    indicator_id_list: indicatorIds.join(","),
    months_before: String(monthsBefore),
    decimal_separator: "point",
    api_key: apiKey,
  });
  // URL obsahuje klíč, proto se do chybové hlášky nedává.
  let text: string;
  try {
    ({ text } = await fetchText(`${BASE}/data?${qs}`, { charset: "windows-1250", timeoutMs: 60_000 }));
  } catch (e) {
    throw new Error(`ARAD /data selhalo: ${(e as Error).message.replace(apiKey, "***")}`);
  }

  const out: Record<string, RatePoint[]> = Object.fromEntries(indicatorIds.map((id) => [id, []]));
  // Řádek: "SMIR…";;"20260930";5.0521…
  for (const line of text.split(/\r?\n/).slice(1)) {
    const [id, , period, value] = line.split(";").map((c) => c.replace(/^"|"$/g, ""));
    if (!id || !period || value === undefined || value === "") continue;
    out[id]?.push({
      date: `${period.slice(0, 4)}-${period.slice(4, 6)}-${period.slice(6, 8)}`,
      value: Number(value),
    });
  }
  for (const id of indicatorIds) out[id].sort((a, b) => a.date.localeCompare(b.date));
  return out;
}
