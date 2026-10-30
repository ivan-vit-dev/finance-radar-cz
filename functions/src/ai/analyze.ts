import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { assertCompleted, claude, costOf, MODELS, type CallCost, type ModelId } from "./claude.js";
import type { Extraction } from "./extract.js";

export const ANALYZE_PROMPT_VERSION = "analyze-v2";

const Impact = z.enum(["high", "medium", "low", "none"]);

export const AnalysisSchema = z.object({
  whatHappened: z.string().describe("Co se stalo: max. 2–3 věty, jen fakta ze vstupu"),
  why: z.string().describe("Proč se to stalo: max. 3–5 vět, jen co plyne ze vstupu; jinak napiš, že důvod zdroj neuvádí"),
  meaning: z.string().describe("Co to prakticky znamená pro trh a klienty, 2–4 věty"),
  whoIsAffected: z.array(
    z.enum([
      "mortgage_client",
      "borrower",
      "investor",
      "saver",
      "property_owner",
      "tenant",
      "insured",
      "entrepreneur",
    ]),
  ),
  impact: z.object({
    mortgages: Impact,
    consumerLoans: Impact,
    realEstate: Impact,
    insurance: Impact,
    investments: Impact,
  }),
  whatToWatch: z.array(z.string()).describe("Co sledovat dál, 1–4 konkrétní body"),
  forAdvisor: z
    .array(z.object({ label: z.string().describe("Např. 'Hypotéky', 'Klient', 'Pozor'"), text: z.string() }))
    .describe("Co to znamená pro poradce, 2–4 krátké body"),
  clientExplanation: z
    .string()
    .describe("Jak to vysvětlit klientovi: 2–3 věty bez odborných výrazů, jako komunikační pomůcka, ne doporučení produktu"),
});

export type Analysis = z.infer<typeof AnalysisSchema>;

/** Aktuální hodnoty ukazatelů. Hodnoty i změny počítá kód, AI je jen interpretuje. */
export interface MarketContextLine {
  label: string;
  value: string;
  asOf: string;
  change?: string;
}

const SYSTEM = `Jsi analytik aplikace Finance Radar pro českého finančního poradce (hypotéky, spotřebitelské úvěry, pojištění, investice). Dostaneš ověřenou událost, její tvrzení rozdělená na fakta, interpretace, odhady a názory, a aktuální tržní ukazatele. Napiš analýzu, která poradci řekne, co se stalo, proč, co to znamená a co s tím dělat.

Zásady:
- Pracuj jen se vstupem. Nepřidávej čísla, data ani události, které ve vstupu nejsou. Žádné vlastní výpočty, procenta ani rozdíly. Všechna čísla už spočítal program a jsou v tržních ukazatelích.
- Fakta podávej jako fakta. Odhady a názory vždy uveď s tím, kdo je tvrdí („podle prognózy ČNB…“, „analytik X očekává…“). Nikdy nevydávej odhad za jistotu.
- Tržní ukazatele jsou jen kontext. Použij je pouze tehdy, když s událostí přímo souvisejí (např. rozhodnutí ČNB a sazby hypoték). U nesouvisejících událostí (podvody, minimální mzda, rozpočet) je nezmiňuj a nepiš ani, že se „sazby nemění“.
- Pokud zdroj neuvádí důvod, napiš to, místo abys ho domýšlel.
- Pokud je událost starší než aktuální tržní ukazatele, uveď její datum, aby bylo jasné, že novější data mohou situaci měnit.
- „Pro poradce“ piš prakticky: co to mění v práci s klientem, na co si dát pozor (např. nezaměňovat nabídkové a skutečně sjednané sazby).
- clientExplanation je komunikační pomůcka: jednoduchá čeština, žádné doporučení konkrétního produktu ani investice, žádné sliby o budoucím vývoji.
- impact hodnoť střízlivě. high jen tam, kde se mění podmínky nebo ceny pro klienty.
- Piš česky, věcně, bez superlativů a clickbaitu.`;

export interface AnalyzeInput {
  sourceName: string;
  sourceTier: number;
  publishedAt: string | null;
  extraction: Extraction;
  marketContext: MarketContextLine[];
}

export interface AnalyzeResult {
  analysis: Analysis;
  /** Čísla ve výstupu, která na vstupu nebyla – podezření na vymyšlené údaje. */
  numbersNotInInput: string[];
  servedBy: string;
  cost: CallCost;
  ms: number;
}

export async function analyze(input: AnalyzeInput, model: ModelId = MODELS.analysis): Promise<AnalyzeResult> {
  const userContent = renderInput(input);
  const started = Date.now();

  const response = await claude().beta.messages.parse({
    model,
    max_tokens: 16_000,
    // Při odmítnutí (např. falešně pozitivní bezpečnostní filtr) zkusí API záložní model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    output_config: { effort: "medium", format: betaZodOutputFormat(AnalysisSchema) },
    messages: [{ role: "user", content: userContent }],
  });
  assertCompleted(response);
  if (!response.parsed_output) throw new Error("Analýza nevrátila platný JSON");

  const analysis = response.parsed_output;
  return {
    analysis,
    numbersNotInInput: numbersMissingFrom(JSON.stringify(analysis), userContent),
    servedBy: response.model,
    cost: costOf(model, response.usage),
    ms: Date.now() - started,
  };
}

function renderInput(input: AnalyzeInput): string {
  const x = input.extraction;
  const statements = x.statements
    .map((s) => {
      const who = s.attributedTo ? ` (${s.attributedTo})` : "";
      const period = s.periodOrDate ? ` [období: ${s.periodOrDate}]` : "";
      return `- ${s.type.toUpperCase()}${who}${period}: ${s.statement}`;
    })
    .join("\n");
  const context = input.marketContext
    .map((c) => `- ${c.label}: ${c.value} (k ${c.asOf})${c.change ? `, změna: ${c.change}` : ""}`)
    .join("\n");

  return [
    `Zdroj: ${input.sourceName} (tier ${input.sourceTier}), vydáno ${input.publishedAt?.slice(0, 10) ?? "neznámo"}`,
    `Událost: ${x.eventTitle}\n${x.eventSummary}`,
    `Tvrzení:\n${statements || "- (žádná)"}`,
    `Aktuální tržní ukazatele (spočítal program):\n${context || "- (nejsou k dispozici)"}`,
  ].join("\n\n");
}

const SCALE: Record<string, number> = { tis: 1e3, mil: 1e6, mld: 1e9, bil: 1e12 };

/**
 * Vytáhne čísla ve výstupu, která se nevyskytují na vstupu (malá celá čísla a roky ignoruje).
 * Převod jednotek („386 000 000 000 Kč“ -> „386 mld. Kč“) se za nové číslo nepovažuje.
 */
export function numbersMissingFrom(output: string, input: string): string[] {
  const re = /(-?\d+(?:[  ]\d{3})*(?:[.,]\d+)?)(?:\s*(tis|mil|mld|bil)\b)?/g;
  const values = (s: string) =>
    [...s.matchAll(re)].map((m) => {
      const raw = m[1].replace(/[\s ]/g, "").replace(",", ".");
      return { raw, abs: Math.abs(Number(raw) * (m[2] ? SCALE[m[2]] : 1)) };
    });
  const known = new Set(values(input).flatMap((v) => [v.raw.replace("-", ""), String(v.abs)]));
  return [
    ...new Set(
      values(output)
        .filter(({ raw, abs }) => {
          const v = Math.abs(Number(raw));
          const trivial = Number.isInteger(v) && (v <= 12 || (v >= 1990 && v <= 2040));
          return !trivial && !known.has(raw.replace("-", "")) && !known.has(String(abs));
        })
        .map((v) => v.raw),
    ),
  ];
}
