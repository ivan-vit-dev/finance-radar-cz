import type { MarketEvent } from "@finance-radar/shared";
import { assertCompleted, claude, costOf, MODELS, type CallCost } from "./claude.js";

export const EXPLAIN_PROMPT_VERSION = "explain-v1";

const SYSTEM = `Vysvětluješ finanční zprávy jednoduše a srozumitelně (bod „Vysvětli mi to“ aplikace Finance Radar). Čtenář je finanční poradce, který si chce rychle ujasnit pojmy a souvislosti, případně je pak převyprávět klientovi.

Napiš 3–6 krátkých vět česky, bez odrážek a nadpisů:
- Vysvětli klíčový pojem nebo mechanismus, o který ve zprávě jde (např. co je repo sazba a jak se může promítnout do sazeb hypoték), obecně a správně.
- Pak jednou dvěma větami řekni, co to v tomto případě znamená, jen podle dodaných faktů.
- Žádná nová čísla ani tvrzení o této události, která nejsou ve vstupu. Žádné předpovědi ani doporučení produktů.
- Upozorni na častou záměnu, pokud existuje (např. „změna repo sazby neznamená automaticky stejnou změnu hypotečních sazeb“).`;

export async function explainSimply(e: MarketEvent): Promise<{ text: string; model: string; cost: CallCost }> {
  const facts = e.facts
    .slice(0, 8)
    .map((f) => `- ${f.t.toUpperCase()}${f.by ? ` (${f.by})` : ""}: ${f.s}`)
    .join("\n");
  const response = await claude().beta.messages.create({
    model: MODELS.analysis,
    max_tokens: 4_000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    output_config: { effort: "low" },
    messages: [{ role: "user", content: `Událost: ${e.title}\n${e.summary}\n\nTvrzení:\n${facts}` }],
  });
  assertCompleted(response);
  const text = response.content
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("")
    .trim();
  if (!text) throw new Error("Model nevrátil text");
  return { text, model: response.model, cost: costOf(MODELS.analysis, response.usage) };
}
