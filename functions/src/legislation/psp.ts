import type { Category, LegislationItem, LegislationPhase } from "@finance-radar/shared";
import { unzipSync } from "fflate";

// Otevřená data Poslanecké sněmovny – sněmovní tisky. Dokumentace: https://www.psp.cz/sqw/hp.sqw?k=1303
// Soubory .unl: sloupce oddělené "|", kódování windows-1250, jeden záznam na řádek.

export const PSP_TISKY_ZIP = "https://www.psp.cz/eknih/cdrom/opendata/tisky.zip";

/** Druh tisku: 1 = vládní návrh zákona, 2 = návrh zákona (poslanci, Senát, kraje). */
const LAW_KINDS = new Set(["1", "2"]);

/** id_org_obd -> číslo volebního období v URL psp.cz (174 = 10. období od 2025). */
export const termNumber = (idOrgObd: number) => idOrgObd - 164;

/**
 * Relevance pro finančního poradce podle názvu zákona. Záměrně průhledná pravidla
 * (vysvětlená v nápovědě) – slovo v názvu -> oblasti.
 */
const KEYWORDS: { re: RegExp; label: string; categories: Category[]; unless?: RegExp }[] = [
  { re: /úvěr|spotřebitelsk/i, label: "úvěry", categories: ["consumer_loans"] },
  { re: /hypot/i, label: "hypotéky", categories: ["mortgages"] },
  {
    re: /pojišťov|pojištěn|pojistn/i,
    label: "pojištění",
    categories: ["insurance"],
    // Veřejné zdravotní, nemocenské, sociální a důchodové (státní) pojištění nejsou produkty,
    // které řeší poradce; důchody pokrývá klíčové slovo „penze“.
    unless: /zdravotn|nemocensk|sociální zabezpečení|sociálních služ|důchodov/i,
  },
  { re: /bank|platebn|devizov/i, label: "banky a platby", categories: ["banks"] },
  { re: /daň|daní|daňov|dph/i, label: "daně", categories: ["economy"] },
  { re: /penzi|důchod|spořen/i, label: "penze a spoření", categories: ["markets"] },
  {
    re: /investi|kapitálov|investiční fond|kolektivní(m|ho) investov|cenných papír|kryptoaktiv/i,
    label: "investice",
    categories: ["markets"],
    // „investiční pobídky“, infrastruktura apod. nejsou investice klientů.
    unless: /pobídk|infrastruktur|zemědělst/i,
  },
  { re: /insolven|exekuc|oddlužen/i, label: "insolvence a exekuce", categories: ["consumer_loans"] },
  { re: /bydlen|nemovit|katastr|stavební zákon|stavebním spoření|nájem|realit/i, label: "bydlení a nemovitosti", categories: ["real_estate"] },
  { re: /finančního trhu|finanční trh|finančních služ|finanční služ|praní peněz|finančním arbitr/i, label: "finanční trh", categories: ["banks", "markets"] },
];

export function matchKeywords(title: string): { matched: string[]; categories: Category[] } {
  const hits = KEYWORDS.filter((k) => k.re.test(title) && !(k.unless && k.unless.test(title)));
  return {
    matched: hits.map((k) => k.label),
    categories: [...new Set<Category>(["legislation", ...hits.flatMap((k) => k.categories)])],
  };
}

/** Typ stavu (typ_stavu) -> fáze ze specifikace. Vyhlášení a účinnost se určují zvlášť. */
export function phaseFromStateType(typ: number): LegislationPhase {
  if ([12, 14, 63, 64, 75, 76].includes(typ)) return "senat";
  if ([8, 11, 13, 74].includes(typ)) return "prezident";
  if (typ === 6) return "ukonceno";
  return "snemovna";
}

export function finalPhase(base: LegislationPhase, published: boolean, effectiveFrom: string | undefined, today: string) {
  if (!published) return base;
  return effectiveFrom && effectiveFrom <= today ? "ucinne" : "vyhlaseno";
}

/** "22.10.2026" -> "2026-10-22"; "2026-10-20 00:00" -> "2026-10-20". */
export function pspDate(s: string | undefined): string | null {
  if (!s) return null;
  const cz = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(s);
  if (cz) return `${cz[3]}-${cz[2].padStart(2, "0")}-${cz[1].padStart(2, "0")}`;
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return iso ? iso[1] : null;
}

const rows = (text: string) =>
  text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => l.split("|"));

export interface PspData {
  tisky: string[][];
  hist: string[][];
  stavy: Map<number, number>;
  typy: Map<number, string>;
}

export async function downloadPsp(userAgent: string): Promise<PspData> {
  const res = await fetch(PSP_TISKY_ZIP, { headers: { "user-agent": userAgent }, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`psp.cz HTTP ${res.status}`);
  return parsePspZip(new Uint8Array(await res.arrayBuffer()));
}

export function parsePspZip(zip: Uint8Array): PspData {
  const wanted = ["tisky.unl", "hist.unl", "stavy.unl", "typ_stavu.unl"];
  const files = unzipSync(zip, { filter: (f) => wanted.includes(f.name) });
  const dec = new TextDecoder("windows-1250");
  const text = (name: string) => {
    if (!files[name]) throw new Error(`psp.cz: v archivu chybí ${name}`);
    return dec.decode(files[name]);
  };
  return {
    tisky: rows(text("tisky.unl")),
    hist: rows(text("hist.unl")),
    stavy: new Map(rows(text("stavy.unl")).map((r) => [Number(r[0]), Number(r[1])])),
    typy: new Map(rows(text("typ_stavu.unl")).map((r) => [Number(r[0]), r[1]])),
  };
}

/**
 * Vybere relevantní návrhy zákonů: celé aktuální období + z minulého období jen ty,
 * které vyšly ve Sbírce za poslední 2 roky (kvůli budoucí účinnosti).
 */
export function selectLegislation(data: PspData, now: Date): Omit<LegislationItem, "updatedAt" | "effectiveFrom">[] {
  // Sloupce viz dokumentace psp.cz (tabulka tisky, hist).
  const T = { id: 0, druh: 1, stav: 2, ct: 3, obd: 7, navrhovatel: 9, nazev: 10, predlozeno: 11, uplny: 15 };
  const H = { tisk: 1, datum: 2, publik: 11, cislo: 13 };

  const law = data.tisky.filter((r) => LAW_KINDS.has(r[T.druh]) && r[T.obd]);
  // Aktuální období = období nejnověji předloženého návrhu. (Nejvyšší ID to není: v datech
  // jsou i historická období s vyššími ID, např. 442 z roku 1920.)
  const newest = law.reduce<string[] | undefined>((best, r) => {
    const d = pspDate(r[T.predlozeno]) ?? "";
    return !best || d > (pspDate(best[T.predlozeno]) ?? "") ? r : best;
  }, undefined);
  if (!newest) return [];
  const currentObd = Number(newest[T.obd]);

  const lastStep = new Map<string, string>();
  const published = new Map<string, { cislo: number; rok: number; publishedAt: string | null }>();
  for (const h of data.hist) {
    const id = h[H.tisk];
    const date = pspDate(h[H.datum]);
    if (date && (!lastStep.has(id) || date > lastStep.get(id)!)) lastStep.set(id, date);
    const publishedAt = pspDate(h[H.publik]);
    if (h[H.cislo] && publishedAt) {
      published.set(id, { cislo: Number(h[H.cislo]), rok: Number(publishedAt.slice(0, 4)), publishedAt });
    }
  }

  const twoYearsAgo = new Date(now.getTime() - 730 * 86_400_000).toISOString().slice(0, 10);
  const out: Omit<LegislationItem, "updatedAt" | "effectiveFrom">[] = [];
  for (const r of law) {
    const obd = Number(r[T.obd]);
    const sb = published.get(r[T.id]);
    const inScope = obd === currentObd || (obd === currentObd - 1 && sb && (sb.publishedAt ?? "") >= twoYearsAgo);
    if (!inScope) continue;

    const fullTitle = (r[T.uplny] || r[T.nazev]).trim();
    const { matched, categories } = matchKeywords(`${r[T.nazev]} ${fullTitle}`);
    if (matched.length === 0) continue;

    const typ = data.stavy.get(Number(r[T.stav])) ?? 0;
    const term = termNumber(obd);
    const ct = Number(r[T.ct]);
    out.push({
      id: r[T.id],
      tisk: ct,
      term,
      title: r[T.nazev].trim(),
      fullTitle: fullTitle.slice(0, 500),
      proposer: r[T.navrhovatel].trim(),
      submittedAt: pspDate(r[T.predlozeno]),
      phase: phaseFromStateType(typ),
      stateLabel: data.typy.get(typ) || "",
      lastStepAt: lastStep.get(r[T.id]) ?? null,
      ...(sb ? { sbirka: sb } : {}),
      categories,
      matched,
      url: `https://www.psp.cz/sqw/historie.sqw?o=${term}&t=${ct}`,
    });
  }
  return out;
}
