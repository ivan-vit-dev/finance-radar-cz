import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { assertCompleted, claude, costOf, MODELS, type CallCost } from "./claude.js";

export const EXTRACT_PROMPT_VERSION = "extract-v2";

/** Strojové klíče ukazatelů, proti kterým kód později ověřuje fakta (fáze 3). */
export const KNOWN_SUBJECTS = [
  "repo_rate",
  "discount_rate",
  "lombard_rate",
  "cpi_inflation_yoy",
  "mortgage_rate_avg",
  "mortgage_volume_new",
  "consumer_loan_rate_avg",
  "deposit_rate_savings",
  "eur_czk",
  "gdp_growth_yoy",
  "unemployment_rate",
  "average_wage_growth_yoy",
  "property_price_index_yoy",
] as const;

const StatementSchema = z.object({
  type: z
    .enum(["fact", "interpretation", "forecast", "opinion"])
    .describe("fact = ověřitelný údaj; interpretation = výklad; forecast = odhad budoucnosti; opinion = názor konkrétní osoby"),
  statement: z.string().describe("Tvrzení jednou větou česky, věrně podle textu"),
  subject: z
    .enum(KNOWN_SUBJECTS)
    .nullable()
    .describe("Ukazatel, kterého se tvrzení týká, pokud je v seznamu; jinak null"),
  value: z.number().nullable().describe("Číselná hodnota bez jednotky (5,05 % -> 5.05); jinak null"),
  unit: z.string().nullable().describe("Jednotka: '%', 'p. b.', 'mld. Kč', 'Kč', 'CZK/EUR'…; jinak null"),
  periodOrDate: z.string().nullable().describe("Období nebo datum, ke kterému se údaj vztahuje: 'YYYY-MM-DD', 'YYYY-MM' nebo 'YYYY-Qn'"),
  attributedTo: z.string().nullable().describe("Kdo to tvrdí (instituce nebo osoba), pokud to text uvádí"),
  quote: z.string().describe("Doslovná citace z textu, ze které tvrzení plyne (bez úprav, max. ~200 znaků)"),
});

export const ExtractionSchema = z.object({
  eventTitle: z.string().describe("Neutrální věcný titulek události česky, bez clickbaitu"),
  eventSummary: z.string().describe("Co se stalo, max. 2 věty česky, jen fakta"),
  entities: z.array(z.string()).describe("Instituce, firmy, zákony, osoby, kterých se událost týká"),
  statements: z.array(StatementSchema).describe("Nejdůležitější tvrzení, max. 8"),
});

export type Extraction = z.infer<typeof ExtractionSchema>;
export type Statement = z.infer<typeof StatementSchema>;

const SYSTEM = `Jsi extraktor faktů pro aplikaci Finance Radar, kterou používá český finanční poradce. Z dodaného dokumentu vytáhni událost a její nejdůležitější tvrzení.

Zásady:
- Striktně odděluj typy tvrzení:
  - fact: ověřitelný údaj nebo rozhodnutí ("ČNB ponechala repo sazbu na 3,75 %").
  - interpretation: výklad souvislostí ("to může omezovat prostor pro pokles sazeb hypoték").
  - forecast: odhad budoucího vývoje ("sazby mohou v dalších měsících klesat").
  - opinion: názor konkrétní osoby nebo analytika ("analytik XY očekává…").
- Pokud médium uvádí údaj jiné instituce, je to fact s attributedTo dané instituce. Pokud ho uvádí jen novinář bez zdroje, vyplň attributedTo názvem média.
- Každé tvrzení musí mít doslovnou citaci z textu (quote). Citaci nepřepisuj, nezkracuj uvnitř a neopravuj. Když tvrzení v textu doslova podložit nejde, nezařazuj ho.
- Čísla převáděj přesně: desetinná čárka -> tečka, "5,05 %" -> value 5.05, unit "%". Nezaokrouhluj.
- U každého číselného tvrzení vyplň periodOrDate. Relativní údaje převeď podle data vydání dokumentu: "v červnu" -> měsíc červen roku vydání (nebo předchozího roku, pokud by šlo o budoucnost); "letos" -> rok vydání; "zkraje příštího roku" -> "YYYY-Q1" následujícího roku. U rozhodnutí použij datum rozhodnutí, pokud ho text uvádí, jinak datum vydání. Null jen tehdy, když období opravdu nejde určit.
- Nedopočítávej nic, co v textu není (žádné rozdíly, průměry ani procenta navíc). Výpočty dělá jiný program.
- Ber jen tvrzení důležitá pro finančního poradce, max. 8. Méně je v pořádku.
- Pokud text nic podstatného neobsahuje, vrať prázdné statements.`;

export interface ExtractInput {
  sourceName: string;
  publishedAt: string | null;
  title: string;
  summary: string;
  text: string;
}

export interface ExtractResult {
  extraction: Extraction;
  /** Tvrzení, jejichž citace se v textu nenašla – podezření na halucinaci. */
  unverifiedQuotes: number;
  cost: CallCost;
}

export async function extract(input: ExtractInput): Promise<ExtractResult> {
  const document = [input.title, input.summary, input.text].filter(Boolean).join("\n\n");
  const response = await claude().messages.parse({
    model: MODELS.bulk,
    max_tokens: 8_000,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    output_config: { effort: "medium", format: zodOutputFormat(ExtractionSchema) },
    messages: [
      {
        role: "user",
        content: `Zdroj: ${input.sourceName}\nDatum vydání: ${input.publishedAt?.slice(0, 10) ?? "neznámé"}\n\n<document>\n${document}\n</document>`,
      },
    ],
  });
  assertCompleted(response);
  if (!response.parsed_output) throw new Error("Extrakce nevrátila platný JSON");

  const extraction = response.parsed_output;
  const haystack = normalize(document);
  const unverifiedQuotes = extraction.statements.filter((s) => !haystack.includes(normalize(s.quote))).length;

  return { extraction, unverifiedQuotes, cost: costOf(MODELS.bulk, response.usage) };
}

/** Porovnání citací odolné vůči rozdílům v mezerách, uvozovkách a pomlčkách. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[„“”"']/g, "")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}
