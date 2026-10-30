import Anthropic from "@anthropic-ai/sdk";

/** Modely podle PLAN.md: levný Haiku na objem, Opus na analýzu. */
export const MODELS = {
  bulk: "claude-haiku-5-5",
  analysis: "claude-opus-5-5",
  /** Alternativa pro analýzu, porovnává se ve fázi 0. */
  analysisAlt: "claude-sonnet-5-5",
} as const;

export type ModelId = (typeof MODELS)[keyof typeof MODELS];

/**
 * Ceny v USD za 1M tokenů (Anthropic API, stav 10/2026). Haiku: prompty do 100k tokenů.
 * Cache u Haiku je odhad podle obvyklého poměru (zápis 1,25×, čtení 0,1× vstupu).
 */
const PRICING: Record<ModelId, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
};

let client: Anthropic | undefined;

/** Klient se vytváří líně, aby se klíč četl až za běhu (secret v Cloud Functions). */
export function claude(): Anthropic {
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export interface CallCost {
  model: ModelId;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  usd: number;
}

type UsageLike = Pick<Anthropic.Usage, "input_tokens" | "output_tokens"> & {
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

export function costOf(model: ModelId, usage: UsageLike): CallCost {
  const p = PRICING[model];
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const usd =
    (usage.input_tokens * p.input +
      usage.output_tokens * p.output +
      cacheRead * p.cacheRead +
      cacheWrite * p.cacheWrite) /
    1_000_000;
  return {
    model,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
    usd,
  };
}

/** Odmítnutí nebo useknutý výstup se nesmí tvářit jako platný výsledek. */
export function assertCompleted(response: {
  stop_reason: string | null;
  stop_details?: { category?: string | null } | null;
}): void {
  if (response.stop_reason === "refusal") {
    throw new Error(`Model odmítl požadavek (${response.stop_details?.category ?? "bez kategorie"})`);
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("Výstup modelu byl useknut (max_tokens)");
  }
}
