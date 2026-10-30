import { XMLParser } from "fast-xml-parser";
import { fetchText } from "./http.js";

export interface FeedItem {
  title: string;
  url: string;
  publishedAt: string | null;
  summary: string;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  // Titulky a perexy často obsahují entity a CDATA, chceme je jako text.
  cdataPropName: false,
  processEntities: true,
  htmlEntities: true,
});

/** Stáhne RSS 2.0 nebo Atom kanál a vrátí normalizované položky (nejnovější první). */
export async function fetchFeed(url: string): Promise<FeedItem[]> {
  const { text } = await fetchText(url);
  const doc = parser.parse(text);
  // Některé weby místo kanálu vrátí HTML (blokace, údržba) se stavem 200.
  // Tichých 0 položek by vypadalo jako „nic nového“, proto chyba.
  if (!doc?.rss && !doc?.feed && !doc?.["rdf:RDF"]) {
    throw new Error(`Odpověď není RSS ani Atom (${text.slice(0, 80).replace(/\s+/g, " ")}…)`);
  }

  const rssItems = asArray(doc?.rss?.channel?.item);
  const atomEntries = asArray(doc?.feed?.entry);

  const items: FeedItem[] = [
    ...rssItems.map((it) => ({
      title: toText(it.title),
      url: toText(it.link),
      publishedAt: toIso(toText(it.pubDate) || toText(it["dc:date"])),
      summary: stripHtml(toText(it.description)),
    })),
    ...atomEntries.map((e) => ({
      title: toText(e.title),
      url: atomLink(e.link),
      publishedAt: toIso(toText(e.published) || toText(e.updated)),
      summary: stripHtml(toText(e.summary) || toText(e.content)),
    })),
  ];

  return items
    .filter((i) => i.title && i.url)
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

function asArray<T>(v: T | T[] | undefined): T[] {
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}

function toText(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "object" && "#text" in (v as Record<string, unknown>)) {
    return String((v as Record<string, unknown>)["#text"]).trim();
  }
  return typeof v === "object" ? "" : String(v).trim();
}

function atomLink(link: unknown): string {
  const links = asArray(link as Record<string, string> | Record<string, string>[]);
  const alternate = links.find((l) => !l["@_rel"] || l["@_rel"] === "alternate");
  return alternate?.["@_href"] ?? "";
}

function toIso(date: string): string | null {
  if (!date) return null;
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
