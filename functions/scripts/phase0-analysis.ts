// Fáze 0: analýza a vrstva „pro poradce“ – porovnání Opus 5.5 vs. Sonnet 5.5
// na událostech z posledního běhu `npm run phase0`.
// Spuštění: npm run phase0:analysis -w functions
// Výstup: functions/.phase0-data/<poslední běh>/analysis.json a compare.md

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ANALYZE_PROMPT_VERSION, analyze, type AnalyzeResult, type MarketContextLine } from "../src/ai/analyze.js";
import { MODELS, type ModelId } from "../src/ai/claude.js";
import type { Extraction } from "../src/ai/extract.js";
import { ARAD_SERIES, fetchAradSeries } from "../src/collectors/arad.js";
import { fetchCnbFxRate, fetchRepoRateHistory, type RatePoint } from "../src/collectors/cnb.js";
import { loadLocalSecrets } from "./local-secrets.js";

loadLocalSecrets();

const COMPARED: ModelId[] = [MODELS.analysis, MODELS.analysisAlt];

interface SampleItem {
  source: { name: string; tier: number };
  title: string;
  url: string;
  publishedAt: string | null;
  extraction?: Extraction;
}

const cz = (n: number, digits = 2) => n.toLocaleString("cs-CZ", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const month = (d: string) => d.slice(0, 7);

/** Rozdíl posledních dvou hodnot v procentních bodech – počítá kód, ne AI. */
function pbChange(series: RatePoint[]): string | undefined {
  if (series.length < 2) return undefined;
  const [prev, last] = series.slice(-2);
  const d = last.value - prev.value;
  return `${d >= 0 ? "+" : ""}${cz(d)} p. b. proti ${month(prev.date)}`;
}

async function buildMarketContext(): Promise<MarketContextLine[]> {
  const apiKey = process.env.CNB_ARAD_API_KEY;
  if (!apiKey) throw new Error("Chybí CNB_ARAD_API_KEY v functions/.secret.local");

  const [repo, eur, arad] = await Promise.all([
    fetchRepoRateHistory(),
    fetchCnbFxRate("EUR"),
    fetchAradSeries(
      [ARAD_SERIES.mortgageRateNew, ARAD_SERIES.mortgageVolumeNew, ARAD_SERIES.consumerLoanRateNew],
      apiKey,
      3,
    ),
  ]);

  const repoNow = repo[repo.length - 1];
  const mortgage = arad[ARAD_SERIES.mortgageRateNew];
  const volume = arad[ARAD_SERIES.mortgageVolumeNew];
  const consumer = arad[ARAD_SERIES.consumerLoanRateNew];
  const last = (s: RatePoint[]) => s[s.length - 1];

  return [
    { label: "2T repo sazba ČNB", value: `${cz(repoNow.value)} %`, asOf: `platí od ${repoNow.date}` },
    { label: "Kurz EUR/CZK (ČNB)", value: cz(eur.value, 3), asOf: eur.date },
    {
      label: "Průměrná sazba nových úvěrů na bydlení (ČNB)",
      value: `${cz(last(mortgage).value)} %`,
      asOf: month(last(mortgage).date),
      change: pbChange(mortgage),
    },
    {
      label: "Objem nových úvěrů na bydlení (ČNB)",
      value: `${cz(last(volume).value / 1e9, 1)} mld. Kč`,
      asOf: month(last(volume).date),
    },
    {
      label: "Průměrná sazba nových spotřebitelských úvěrů (ČNB)",
      value: `${cz(last(consumer).value)} %`,
      asOf: month(last(consumer).date),
      change: pbChange(consumer),
    },
  ];
}

function latestRunDir(): string {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".phase0-data");
  const runs = existsSync(root) ? readdirSync(root).sort() : [];
  const dir = runs.reverse().map((r) => path.join(root, r)).find((d) => existsSync(path.join(d, "items.json")));
  if (!dir) throw new Error("Nejdřív spusť `npm run phase0 -w functions`");
  return dir;
}

async function main() {
  const dir = latestRunDir();
  const items = (JSON.parse(readFileSync(path.join(dir, "items.json"), "utf8")) as SampleItem[]).filter(
    (i) => i.extraction && i.extraction.statements.length > 0,
  );
  const marketContext = await buildMarketContext();
  console.log("Tržní kontext:");
  marketContext.forEach((c) => console.log(`  ${c.label}: ${c.value} (${c.asOf})${c.change ? `, ${c.change}` : ""}`));
  console.log(`\nAnalyzuji ${items.length} událostí × ${COMPARED.length} modely…`);

  type Row = { item: SampleItem; results: Partial<Record<ModelId, AnalyzeResult | { error: string }>> };
  const rows: Row[] = items.map((item) => ({ item, results: {} }));
  const jobs = rows.flatMap((row) => COMPARED.map((model) => ({ row, model })));

  let next = 0;
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (next < jobs.length) {
        const { row, model } = jobs[next++];
        try {
          row.results[model] = await analyze(
            {
              sourceName: row.item.source.name,
              sourceTier: row.item.source.tier,
              publishedAt: row.item.publishedAt,
              extraction: row.item.extraction!,
              marketContext,
            },
            model,
          );
        } catch (e) {
          row.results[model] = { error: (e as Error).message };
        }
      }
    }),
  );

  writeFileSync(path.join(dir, "analysis.json"), JSON.stringify({ marketContext, rows }, null, 2));
  const summary = COMPARED.map((m) => summarizeModel(m, rows.map((r) => r.results[m]))).join("\n");
  writeFileSync(path.join(dir, "compare.md"), compareReport(rows, marketContext, summary));
  console.log(`\nPrompt: ${ANALYZE_PROMPT_VERSION}\n${summary}\n\nVýstup: ${path.join(dir, "compare.md")}`);
}

function summarizeModel(model: ModelId, results: (AnalyzeResult | { error: string } | undefined)[]): string {
  const ok = results.filter((r): r is AnalyzeResult => !!r && !("error" in r));
  const errors = results.length - ok.length;
  const usd = ok.reduce((s, r) => s + r.cost.usd, 0);
  const out = ok.reduce((s, r) => s + r.cost.outputTokens, 0);
  const ms = ok.reduce((s, r) => s + r.ms, 0) / Math.max(ok.length, 1);
  const invented = ok.reduce((s, r) => s + r.numbersNotInInput.length, 0);
  const fallbacks = ok.filter((r) => r.servedBy !== model).length;
  return (
    `${model.padEnd(18)} ok ${ok.length}, chyby ${errors}, fallback ${fallbacks}, ` +
    `$${usd.toFixed(3)} ($${(usd / Math.max(ok.length, 1)).toFixed(4)}/událost), ` +
    `výstup ${out} tok., ${(ms / 1000).toFixed(1)} s/událost, čísla mimo vstup: ${invented}`
  );
}

function compareReport(
  rows: { item: SampleItem; results: Partial<Record<ModelId, AnalyzeResult | { error: string }>> }[],
  ctx: MarketContextLine[],
  summary: string,
): string {
  const lines = [
    "# Fáze 0 – porovnání analýzy",
    "",
    "```",
    summary,
    "```",
    "",
    "Tržní kontext: " + ctx.map((c) => `${c.label} ${c.value} (${c.asOf}${c.change ? `, ${c.change}` : ""})`).join("; "),
    "",
  ];
  for (const { item, results } of rows) {
    lines.push(`## ${item.extraction!.eventTitle}`, `${item.source.name} · [odkaz](${item.url})`, "");
    for (const model of COMPARED) {
      const r = results[model];
      lines.push(`### ${model}`);
      if (!r || "error" in r) {
        lines.push(`❌ ${r?.error ?? "nespuštěno"}`, "");
        continue;
      }
      const a = r.analysis;
      lines.push(
        `**Co se stalo:** ${a.whatHappened}`,
        `**Proč:** ${a.why}`,
        `**Co to znamená:** ${a.meaning}`,
        `**Koho se týká:** ${a.whoIsAffected.join(", ")}`,
        `**Dopad:** hypotéky ${a.impact.mortgages}, úvěry ${a.impact.consumerLoans}, nemovitosti ${a.impact.realEstate}, pojištění ${a.impact.insurance}, investice ${a.impact.investments}`,
        `**Co sledovat:** ${a.whatToWatch.join(" · ")}`,
        `**Pro poradce:**`,
        ...a.forAdvisor.map((f) => `- *${f.label}:* ${f.text}`),
        `**Pro klienta:** ${a.clientExplanation}`,
        `_${r.cost.outputTokens} tok., $${r.cost.usd.toFixed(4)}, ${(r.ms / 1000).toFixed(1)} s${r.numbersNotInInput.length ? `, ⚠️ čísla mimo vstup: ${r.numbersNotInInput.join(", ")}` : ""}_`,
        "",
      );
    }
  }
  return lines.join("\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
