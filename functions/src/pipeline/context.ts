import type { MarketContextLine } from "../ai/analyze.js";
import type { IndicatorDoc } from "../indicators/update.js";

const cz = (n: number, digits: number) =>
  n.toLocaleString("cs-CZ", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/**
 * Tržní kontext pro analýzu z uložených ukazatelů. Hodnoty i změny jsou spočítané kódem
 * (fáze 3), AI je jen interpretuje.
 */
export function marketContextFrom(docs: (IndicatorDoc | undefined)[]): MarketContextLine[] {
  return docs.flatMap((d): MarketContextLine[] => {
    const s = d?.stats;
    if (!d || !s) return [];
    const pb = d.unit === "%";
    const change =
      s.change !== undefined && s.previous
        ? `${s.change >= 0 ? "+" : ""}${cz(s.change, pb ? 2 : 1)} ${pb ? "p. b." : "%"} proti ${s.previous.p}`
        : undefined;
    return [
      {
        label: `${d.label} (${d.source})`,
        value: `${cz(s.latest.v, d.decimals)} ${d.unit}`,
        asOf: s.latest.p,
        ...(change ? { change } : {}),
      },
    ];
  });
}
