import type { IndicatorPoint } from "@finance-radar/shared";
import { fetchText } from "./http.js";

// ČSÚ DataStat – veřejné API bez klíče, odpověď ve formátu JSON-stat 2.0.
// Výběr (např. CEN0101HT02) je předdefinovaná tabulka datové sady.

interface JsonStatDataset {
  id: string[];
  size: number[];
  value: (number | null)[];
  updated?: string;
  dimension: Record<string, { category: { index: Record<string, number> } }>;
}

/**
 * Stáhne jednu řadu z výběru ČSÚ. `metricDim`/`metricCode` vybírají ukazatel,
 * `timeDim` je časová dimenze (CasM = měsíce, CasQ = čtvrtletí). Ostatní dimenze
 * musí mít jedinou kategorii (např. území = Česko).
 */
export async function fetchCsuSeries(
  selectionCode: string,
  timeDim: string,
  metricDim: string,
  metricCode: string,
): Promise<{ points: IndicatorPoint[]; updated?: string }> {
  const { text } = await fetchText(`https://data.csu.gov.cz/api/dotaz/v1/data/vybery/${selectionCode}`);
  const ds = JSON.parse(text) as JsonStatDataset;

  // JSON-stat: hodnoty jsou v jednom poli, poslední dimenze se mění nejrychleji.
  const strides = ds.size.map((_, i) => ds.size.slice(i + 1).reduce((a, b) => a * b, 1));
  const timeIdx = ds.id.indexOf(timeDim);
  const metricIdx = ds.id.indexOf(metricDim);
  if (timeIdx < 0 || metricIdx < 0) throw new Error(`ČSÚ ${selectionCode}: chybí dimenze ${timeDim}/${metricDim}`);
  ds.id.forEach((dim, i) => {
    if (i !== timeIdx && i !== metricIdx && ds.size[i] !== 1) {
      throw new Error(`ČSÚ ${selectionCode}: dimenze ${dim} má ${ds.size[i]} kategorií, čekám 1`);
    }
  });
  const metricPos = ds.dimension[metricDim].category.index[metricCode];
  if (metricPos === undefined) throw new Error(`ČSÚ ${selectionCode}: ukazatel ${metricCode} neexistuje`);

  const points: IndicatorPoint[] = [];
  for (const [period, timePos] of Object.entries(ds.dimension[timeDim].category.index)) {
    const v = ds.value[timePos * strides[timeIdx] + metricPos * strides[metricIdx]];
    if (v !== null && v !== undefined) points.push({ p: period, v });
  }
  points.sort((a, b) => a.p.localeCompare(b.p));
  return { points, updated: ds.updated };
}
