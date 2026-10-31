import { fetchText } from "./http.js";
import { stripHtml, type FeedItem } from "./rss.js";

/**
 * Zdroj bez RSS: ze stránky se seznamem článků vytáhne odkazy, jejichž cesta odpovídá
 * `linkPattern`. Titulek = nejdelší text odkazu na stejnou URL (stránky často mají
 * u jednoho článku obrázek, titulek a „Číst dál“). Datum stránka obvykle neuvádí strojově,
 * proto `publishedAt` = null a o novosti rozhoduje seznam viděných URL.
 */
export async function fetchHtmlList(listUrl: string, linkPattern: string): Promise<FeedItem[]> {
  const { text, finalUrl } = await fetchText(listUrl);
  const pattern = new RegExp(linkPattern);
  const titles = new Map<string, string>();

  for (const m of text.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let url: string;
    try {
      url = new URL(m[1], finalUrl).href;
    } catch {
      continue;
    }
    if (!pattern.test(new URL(url).pathname)) continue;
    const title = stripHtml(m[2]);
    if (title.length > (titles.get(url)?.length ?? 0)) titles.set(url, title);
    else if (!titles.has(url)) titles.set(url, "");
  }

  return [...titles.entries()]
    .filter(([, title]) => title.length >= 10)
    .map(([url, title]) => ({ title, url, publishedAt: null, summary: "" }));
}
