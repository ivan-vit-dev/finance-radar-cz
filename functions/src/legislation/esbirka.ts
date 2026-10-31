// e-Sbírka – otevřená data (SPARQL, bez klíče). Datum účinnosti = „účinnost-znění-od“ vyhlášeného znění.
// IRI předpisu: https://opendata.eselpoint.gov.cz/esel-esb/eli/cz/sb/{rok}/{číslo}/0000-00-00

const ENDPOINT = "https://opendata.eselpoint.gov.cz/sparql";
const EFFECTIVE_FROM = "https://slovník.gov.cz/datový/sbírka/pojem/účinnost-znění-od";

/** Datum účinnosti předpisu (YYYY-MM-DD), nebo null, když ho e-Sbírka zatím nemá. */
export async function fetchEffectiveFrom(rok: number, cislo: number, userAgent: string): Promise<string | null> {
  if (!Number.isInteger(rok) || !Number.isInteger(cislo)) return null;
  const act = `https://opendata.eselpoint.gov.cz/esel-esb/eli/cz/sb/${rok}/${cislo}/0000-00-00`;
  const query = `SELECT ?od WHERE { <${act}> <${EFFECTIVE_FROM}> ?od } LIMIT 1`;
  const res = await fetch(`${ENDPOINT}?query=${encodeURIComponent(query)}`, {
    headers: { accept: "application/sparql-results+json", "user-agent": userAgent },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`e-Sbírka HTTP ${res.status}`);
  const json = (await res.json()) as { results: { bindings: { od?: { value: string } }[] } };
  const value = json.results.bindings[0]?.od?.value;
  return value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}
