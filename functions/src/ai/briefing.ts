import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { MarketEvent } from "@finance-radar/shared";
import { z } from "zod";
import type { MarketContextLine } from "./analyze.js";
import { numbersMissingFrom } from "./analyze.js";
import { assertCompleted, claude, costOf, MODELS, type CallCost } from "./claude.js";

export const BRIEFING_PROMPT_VERSION = "briefing-v1";

const SYSTEM = `Jsi editor ranního briefingu aplikace Finance Radar pro českého finančního poradce (hypotéky, úvěry, pojištění, investice). Dostaneš seznam už ověřených a ohodnocených událostí za určité období a aktuální tržní ukazatele. Napiš briefing, po jehož přečtení poradce za 2 minuty ví, co je důležité.

Zásady:
- Pracuj jen se vstupem. Žádná nová čísla, data ani události; žádné výpočty (čísla spočítal program).
- topStory = nejdůležitější událost pro práci poradce (obvykle nejvyšší skóre, ale rozhoduje dopad na klienty).
- sections: 2–5 oblastí (např. „ČNB“, „Hypotéky“, „Nemovitosti“, „Úvěry“, „Regulace“, „Ekonomika“), každá 1–3 věty. Do oblasti dávej jen události, které do ní patří; oblast bez událostí vynech.
- forAdvisor: 3–5 krátkých praktických bodů „co je dnes důležité pro poradce“.
- Odhady a názory vždy s uvedením, kdo je tvrdí. Fakta podávej věcně, bez superlativů.
- Pokud je období delší než den, piš o „uplynulém týdnu/dnech“, ne o „dnešku“.
- eventIds používej jen z dodaného seznamu.`;

export interface BriefingInput {
  periodLabel: string;
  events: MarketEvent[];
  marketContext: MarketContextLine[];
}

export async function generateBriefing(input: BriefingInput) {
  const ids = input.events.map((e) => e.id) as [string, ...string[]];
  const EventId = z.enum(ids);
  const schema = z.object({
    headline: z.string().describe("Jedna věta: hlavní zpráva období"),
    topStory: z.object({
      eventId: EventId,
      title: z.string(),
      text: z.string().describe("2–3 věty: co se stalo a proč je to pro poradce důležité"),
      watch: z.string().describe("Co sledovat dál, jedna věta"),
    }),
    sections: z.array(z.object({ area: z.string(), eventIds: z.array(EventId), text: z.string() })),
    forAdvisor: z.array(z.string()),
  });

  const events = input.events
    .map((e) => {
      const facts = e.facts
        .filter((f) => f.t === "fact")
        .slice(0, 3)
        .map((f) => `    • ${f.s}${f.by ? ` (${f.by})` : ""}`)
        .join("\n");
      const forecasts = e.facts
        .filter((f) => f.t !== "fact")
        .slice(0, 2)
        .map((f) => `    • ${f.t.toUpperCase()}${f.by ? ` (${f.by})` : ""}: ${f.s}`)
        .join("\n");
      return [
        `- id ${e.id} | skóre ${e.finalScore} | ${e.priority} | ověření: ${e.verification} | oblasti: ${e.categories.join(", ")}`,
        `  ${e.title}: ${e.summary}`,
        facts,
        forecasts,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
  const context = input.marketContext
    .map((c) => `- ${c.label}: ${c.value} (k ${c.asOf})${c.change ? `, změna: ${c.change}` : ""}`)
    .join("\n");
  const userContent = `Období: ${input.periodLabel}\n\nUdálosti (seřazené podle skóre):\n${events}\n\nTržní ukazatele (spočítal program):\n${context}`;

  const response = await claude().beta.messages.parse({
    model: MODELS.analysis,
    max_tokens: 16_000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    output_config: { effort: "medium", format: betaZodOutputFormat(schema) },
    messages: [{ role: "user", content: userContent }],
  });
  assertCompleted(response);
  if (!response.parsed_output) throw new Error("Briefing nevrátil platný JSON");

  const cost: CallCost = costOf(MODELS.analysis, response.usage);
  return {
    content: response.parsed_output,
    servedBy: response.model,
    numbersNotInInput: numbersMissingFrom(JSON.stringify(response.parsed_output), userContent),
    cost,
  };
}
