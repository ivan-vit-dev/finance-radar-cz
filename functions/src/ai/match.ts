import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { assertCompleted, claude, costOf, MODELS, type CallCost } from "./claude.js";

export const MATCH_PROMPT_VERSION = "match-v1";

export interface MatchCandidate {
  id: string;
  title: string;
  summary: string;
  firstSeenAt: string;
}

export interface MatchInput {
  title: string;
  summary: string;
  entities: string[];
  publishedAt: string | null;
  candidates: MatchCandidate[];
}

const SYSTEM = `Rozhoduješ, zda nový článek popisuje stejnou konkrétní událost jako některá z již známých událostí.

Stejná událost = stejné rozhodnutí, oznámení, zveřejnění statistiky nebo incident, jen z jiného zdroje nebo s dalšími podrobnostmi (např. tisková zpráva ČNB a článek médií o tomtéž rozhodnutí; tři média o tomtéž zdražení jedné firmy).
Jiná událost = jen podobné téma (např. dvě různá rozhodnutí ČNB, zdražení dvou různých firem, inflace za různé měsíce, první a druhé čtení stejného zákona).

Pokud si nejsi jistý, vrať null – je lepší mít dvě podobné události než sloučit dvě různé.`;

/** Najde existující událost, ke které článek patří. Bez kandidátů se model nevolá. */
export async function matchEvent(input: MatchInput): Promise<{ matchId: string | null; cost?: CallCost }> {
  if (input.candidates.length === 0) return { matchId: null };

  const ids = input.candidates.map((c) => c.id) as [string, ...string[]];
  const schema = z.object({
    matchId: z.enum(ids).nullable().describe("ID shodné události, nebo null = nová událost"),
    reason: z.string().describe("Krátké zdůvodnění česky"),
  });

  const candidates = input.candidates
    .map((c) => `- id ${c.id} (od ${c.firstSeenAt.slice(0, 10)}): ${c.title} – ${c.summary}`)
    .join("\n");

  const response = await claude().messages.parse({
    model: MODELS.bulk,
    max_tokens: 2_000,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    output_config: { effort: "low", format: zodOutputFormat(schema) },
    messages: [
      {
        role: "user",
        content: [
          `Nový článek (vydán ${input.publishedAt?.slice(0, 10) ?? "neznámo"}):`,
          `${input.title} – ${input.summary}`,
          `Entity: ${input.entities.join(", ") || "-"}`,
          `\nZnámé události:\n${candidates}`,
        ].join("\n"),
      },
    ],
  });
  assertCompleted(response);
  return { matchId: response.parsed_output?.matchId ?? null, cost: costOf(MODELS.bulk, response.usage) };
}
