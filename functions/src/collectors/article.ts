import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { fetchText } from "./http.js";

/** Horní mez délky textu posílaného do AI (přibližně 4–5 tisíc tokenů). */
export const MAX_ARTICLE_CHARS = 15_000;

export interface ArticleText {
  title: string;
  text: string;
  finalUrl: string;
  truncated: boolean;
}

/**
 * Stáhne stránku článku a vytáhne hlavní text (Readability).
 * U článků za paywallem vrátí jen dostupnou část – to je v pořádku,
 * klasifikace pak stojí hlavně na titulku a perexu z RSS.
 */
export async function fetchArticle(url: string): Promise<ArticleText> {
  const { text: html, finalUrl } = await fetchText(url);
  const { document } = parseHTML(html);
  const parsed = new Readability(document as unknown as Document).parse();

  const full = (parsed?.textContent ?? "").replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  return {
    title: parsed?.title ?? "",
    text: full.slice(0, MAX_ARTICLE_CHARS),
    finalUrl,
    truncated: full.length > MAX_ARTICLE_CHARS,
  };
}
