// Fáze 0: vzorek reálných článků -> klasifikace (Haiku) -> extrakce faktů (Haiku).
// Spuštění: npm run phase0 -w functions -- [--per-source 6] [--threshold 50]
// Výstup: functions/.phase0-data/<čas>/ (items.json, report.md) – mimo git, obsahuje cizí texty.

import { computeFinalScore, priorityFromScore, type Source } from "@finance-radar/shared";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CLASSIFY_PROMPT_VERSION, classify, type Classification } from "../src/ai/classify.js";
import type { CallCost } from "../src/ai/claude.js";
import { EXTRACT_PROMPT_VERSION, extract, type Extraction } from "../src/ai/extract.js";
import { fetchArticle } from "../src/collectors/article.js";
import { fetchFeed } from "../src/collectors/rss.js";
import { MVP_SOURCES } from "../src/sources.js";
import { loadLocalSecrets } from "./local-secrets.js";

loadLocalSecrets();

const args = process.argv.slice(2);
const argNum = (name: string, def: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const PER_SOURCE = argNum("per-source", 6);
const THRESHOLD = argNum("threshold", 50);
const CONCURRENCY = 4;

/** Dočasná důvěryhodnost podle tieru, než bude hotové ověřování (fáze 4). */
const TIER_CONFIDENCE: Record<number, number> = { 1: 95, 2: 75, 3: 60, 4: 30 };

interface Item {
  source: Pick<Source, "id" | "name" | "tier">;
  title: string;
  url: string;
  publishedAt: string | null;
  summary: string;
  text: string;
  textError?: string;
  classification?: Classification;
  finalScore?: number;
  priority?: string;
  extraction?: Extraction;
  unverifiedQuotes?: number;
  errors: string[];
  costs: CallCost[];
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

async function main() {
  const started = Date.now();
  const sources = MVP_SOURCES.filter((s) => s.kind === "rss" && s.enabled);

  // 1) RSS
  const items: Item[] = [];
  for (const s of sources) {
    try {
      const feed = await fetchFeed(s.url);
      for (const f of feed.slice(0, PER_SOURCE)) {
        items.push({ source: { id: s.id, name: s.name, tier: s.tier }, ...f, text: "", errors: [], costs: [] });
      }
      console.log(`RSS  ${s.id.padEnd(16)} ${Math.min(feed.length, PER_SOURCE)}/${feed.length}`);
    } catch (e) {
      console.log(`RSS  ${s.id.padEnd(16)} CHYBA ${(e as Error).message}`);
    }
  }

  // 2) Text článků
  await mapLimit(items, CONCURRENCY, async (it) => {
    try {
      const a = await fetchArticle(it.url);
      it.text = a.text;
      it.url = a.finalUrl;
    } catch (e) {
      it.textError = (e as Error).message;
    }
  });
  console.log(`TEXT ${items.filter((i) => i.text.length > 300).length}/${items.length} článků s textem > 300 znaků`);

  // 3) Klasifikace
  await mapLimit(items, CONCURRENCY, async (it) => {
    try {
      const r = await classify({
        sourceName: it.source.name,
        sourceTier: it.source.tier,
        title: it.title,
        summary: it.summary,
        text: it.text,
      });
      it.classification = r.classification;
      it.costs.push(r.cost);
      it.finalScore = computeFinalScore({ ...r.classification, confidence: TIER_CONFIDENCE[it.source.tier] });
      it.priority = priorityFromScore(it.finalScore);
    } catch (e) {
      it.errors.push(`classify: ${(e as Error).message}`);
    }
  });

  // 4) Extrakce u relevantních
  const toExtract = items.filter((i) => i.classification?.isRelevant && i.classification.relevance >= THRESHOLD);
  await mapLimit(toExtract, CONCURRENCY, async (it) => {
    try {
      const r = await extract({
        sourceName: it.source.name,
        publishedAt: it.publishedAt,
        title: it.title,
        summary: it.summary,
        text: it.text,
      });
      it.extraction = r.extraction;
      it.unverifiedQuotes = r.unverifiedQuotes;
      it.costs.push(r.cost);
    } catch (e) {
      it.errors.push(`extract: ${(e as Error).message}`);
    }
  });

  // 5) Výstup
  const outDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    ".phase0-data",
    new Date().toISOString().replace(/[:.]/g, "-"),
  );
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "items.json"), JSON.stringify(items, null, 2));
  const summary = summarize(items, toExtract.length, Date.now() - started);
  writeFileSync(path.join(outDir, "report.md"), report(items, summary));
  console.log("\n" + summary);
  console.log(`\nVýstup: ${outDir}`);
}

function summarize(items: Item[], extracted: number, ms: number): string {
  const costs = items.flatMap((i) => i.costs);
  const usd = costs.reduce((s, c) => s + c.usd, 0);
  const tokensIn = costs.reduce((s, c) => s + c.inputTokens + c.cacheReadTokens + c.cacheWriteTokens, 0);
  const tokensOut = costs.reduce((s, c) => s + c.outputTokens, 0);
  const cacheRead = costs.reduce((s, c) => s + c.cacheReadTokens, 0);
  const classified = items.filter((i) => i.classification).length;
  const relevant = items.filter((i) => i.classification?.isRelevant).length;
  const statements = items.reduce((s, i) => s + (i.extraction?.statements.length ?? 0), 0);
  const unverified = items.reduce((s, i) => s + (i.unverifiedQuotes ?? 0), 0);
  const byPriority = items.reduce<Record<string, number>>((acc, i) => {
    if (i.priority) acc[i.priority] = (acc[i.priority] ?? 0) + 1;
    return acc;
  }, {});
  const errors = items.flatMap((i) => i.errors);

  return [
    `Prompty: ${CLASSIFY_PROMPT_VERSION}, ${EXTRACT_PROMPT_VERSION}`,
    `Položek: ${items.length}, klasifikováno: ${classified}, relevantních: ${relevant}, extrahováno: ${extracted}`,
    `Priority: ${JSON.stringify(byPriority)}`,
    `Tvrzení: ${statements}, z toho citace nenalezená v textu: ${unverified}`,
    `Tokeny: vstup ${tokensIn} (z cache ${cacheRead}), výstup ${tokensOut}`,
    `Cena: $${usd.toFixed(4)} (≈ $${((usd / Math.max(items.length, 1)) * 300 * 30).toFixed(2)} měsíčně při 300 dokumentech denně)`,
    `Chyby: ${errors.length}${errors.length ? "\n  " + errors.slice(0, 10).join("\n  ") : ""}`,
    `Čas: ${(ms / 1000).toFixed(0)} s`,
  ].join("\n");
}

function report(items: Item[], summary: string): string {
  const sorted = [...items].sort((a, b) => (b.finalScore ?? -1) - (a.finalScore ?? -1));
  const lines = ["# Fáze 0 – vzorek", "", "```", summary, "```", ""];
  for (const it of sorted) {
    const c = it.classification;
    lines.push(`## ${it.finalScore ?? "–"} · ${it.priority ?? "?"} · ${it.title}`);
    lines.push(`${it.source.name} · ${it.publishedAt ?? "bez data"} · [odkaz](${it.url}) · text ${it.text.length} znaků`);
    if (c) {
      lines.push(
        `- ${c.isRelevant ? "relevantní" : "nerelevantní"} · ${c.categories.join(", ")} / ${c.subcategory} · ${c.contentType}`,
        `- relevance ${c.relevance}, advisor ${c.advisorImpact}, trh ${c.marketImpact}, urgence ${c.urgency}, akce: ${c.actionRequired ? "ano" : "ne"}`,
        `- ${c.reason}`,
      );
    }
    if (it.extraction) {
      const x = it.extraction;
      lines.push("", `**${x.eventTitle}** – ${x.eventSummary}`, "");
      for (const s of x.statements) {
        const val = s.value !== null ? ` [${s.subject ?? "?"} = ${s.value} ${s.unit ?? ""} @ ${s.periodOrDate ?? "?"}]` : "";
        lines.push(`- \`${s.type}\` ${s.statement}${val}${s.attributedTo ? ` (${s.attributedTo})` : ""}`);
        lines.push(`  > ${s.quote}`);
      }
      if (it.unverifiedQuotes) lines.push(`- ⚠️ citace nenalezené v textu: ${it.unverifiedQuotes}`);
    }
    if (it.errors.length) lines.push(`- ❌ ${it.errors.join("; ")}`);
    lines.push("");
  }
  return lines.join("\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
