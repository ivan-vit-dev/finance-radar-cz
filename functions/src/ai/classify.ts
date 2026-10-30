import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { CATEGORIES } from "@finance-radar/shared";
import { z } from "zod";
import { assertCompleted, claude, costOf, MODELS, type CallCost } from "./claude.js";

export const CLASSIFY_PROMPT_VERSION = "classify-v1";

/** Kolik znaků textu stačí na klasifikaci; zbytek se čte až při extrakci. */
const CLASSIFY_TEXT_CHARS = 4_000;

export const ClassificationSchema = z.object({
  isRelevant: z.boolean().describe("Má smysl, aby to finanční poradce vůbec viděl?"),
  categories: z.array(z.enum(CATEGORIES)).describe("Všechny oblasti, kterých se obsah týká"),
  subcategory: z.string().describe("Krátké upřesnění česky, např. 'úrokové sazby', 'refixace', 'DSTI'"),
  contentType: z.enum([
    "decision",
    "statistics",
    "market_update",
    "product",
    "regulation",
    "analysis",
    "opinion",
    "other",
  ]),
  relevance: z.number().int().describe("0–100: jak moc obsah souvisí s prací poradce"),
  advisorImpact: z.number().int().describe("0–100: dopad na práci poradce s klienty"),
  marketImpact: z.number().int().describe("0–100: dopad na český finanční trh"),
  urgency: z.number().int().describe("0–100: jak rychle to poradce potřebuje vědět"),
  actionRequired: z.boolean().describe("Měl by poradce kvůli tomu něco udělat nebo klienty informovat?"),
  reason: z.string().describe("Jedna věta česky: proč takové hodnocení"),
});

export type Classification = z.infer<typeof ClassificationSchema>;

const SYSTEM = `Jsi klasifikátor obsahu pro aplikaci Finance Radar. Uživatel je český finanční poradce, který řeší s klienty hypotéky, spotřebitelské úvěry, pojištění a investice. Tvým úkolem je rozhodnout, zda je dokument pro jeho práci důležitý, a ohodnotit ho.

Kategorie:
- mortgages: hypotéky, hypoteční sazby, refinancování, refixace, LTV/DTI/DSTI, podmínky bank pro hypotéky
- consumer_loans: spotřebitelské úvěry, RPSN, konsolidace, zadlužení domácností
- cnb: rozhodnutí a komunikace ČNB, měnová politika, makroobezřetnostní politika, dohled
- banks: konkrétní banky, jejich produkty, poplatky, výsledky
- real_estate: ceny bytů, domů, pozemků, nájmy, stavebnictví, dostupnost bydlení
- insurance: životní a neživotní pojištění, pojistný trh a jeho regulace
- economy: inflace, HDP, nezaměstnanost, mzdy, kurz koruny, výnosy dluhopisů
- legislation: zákony, vyhlášky, návrhy zákonů, regulace (Sněmovna, Senát, vláda, MF, EU)
- markets: investice, fondy, akcie, dluhopisy, penzijní produkty, spoření, podvody, ochrana spotřebitele

Orientační relevance pro poradce (relevance a advisorImpact):
- změna repo sazby ČNB: 100
- změna hypotečních sazeb nebo podmínek hypoték: 100
- nový nebo novelizovaný zákon o úvěrech: 98
- ceny nemovitostí: 95
- regulace pojišťoven: 85
- inflace, kurz koruny: 75–85
- HDP: 65
- průmyslová výroba: 40
- zahraniční zpráva bez přímého dopadu na ČR: 10–30
- politická zpráva bez finančního dopadu: 5

Pravidla:
- Hodnoť dopad na práci poradce v ČR, ne obecnou zajímavost.
- Tiskové zprávy institucí o personáliích, akcích pro veřejnost nebo interních věcech mají nízkou relevanci, i když jsou od ČNB.
- urgency je vysoká jen u věcí s okamžitým dopadem (rozhodnutí platné hned, změna sazeb od zítřka). Statistika za minulý měsíc má střední urgency.
- actionRequired je true jen tehdy, když by poradce měl konkrétně jednat (např. upozornit klienty před refixací).
- isRelevant = false pro obsah bez vztahu k financím domácností (sport, kultura, krimi, čistě zahraniční politika).
- Neodhaduj, co v textu není. Hodnoť jen podle dodaného obsahu.`;

export interface ClassifyInput {
  sourceName: string;
  sourceTier: number;
  title: string;
  summary: string;
  text: string;
}

export interface ClassifyResult {
  classification: Classification;
  cost: CallCost;
}

export async function classify(input: ClassifyInput): Promise<ClassifyResult> {
  const response = await claude().messages.parse({
    model: MODELS.bulk,
    max_tokens: 4_000,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    output_config: { effort: "low", format: zodOutputFormat(ClassificationSchema) },
    messages: [
      {
        role: "user",
        content: [
          `Zdroj: ${input.sourceName} (tier ${input.sourceTier})`,
          `Titulek: ${input.title}`,
          `Perex: ${input.summary || "(není)"}`,
          `Text (začátek):\n${input.text.slice(0, CLASSIFY_TEXT_CHARS) || "(text není k dispozici)"}`,
        ].join("\n\n"),
      },
    ],
  });
  assertCompleted(response);
  if (!response.parsed_output) throw new Error("Klasifikace nevrátila platný JSON");

  return { classification: clampScores(response.parsed_output), cost: costOf(MODELS.bulk, response.usage) };
}

/** Skóre musí být 0–100; schéma rozsah nevynucuje, hlídá ho kód. */
function clampScores(c: Classification): Classification {
  const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n)));
  return {
    ...c,
    relevance: clamp(c.relevance),
    advisorImpact: clamp(c.advisorImpact),
    marketImpact: clamp(c.marketImpact),
    urgency: clamp(c.urgency),
  };
}
