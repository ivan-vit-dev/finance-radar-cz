// Stáhne zdroje skutečnými collectory a vypíše, co by se uložilo (nic nezapisuje).
// Spuštění: npx tsx scripts/sources-check.ts [id-zdroje ...]   (bez argumentů = všechny zapnuté)
import { MVP_SOURCES } from "@finance-radar/shared";
import { fetchHtmlList } from "../src/collectors/html-list.js";
import { fetchFeed } from "../src/collectors/rss.js";

const ids = process.argv.slice(2);
const sources = MVP_SOURCES.filter((s) => s.enabled && (ids.length === 0 || ids.includes(s.id)));

for (const s of sources) {
  try {
    const items = s.kind === "html" ? await fetchHtmlList(s.url, s.linkPattern ?? "") : await fetchFeed(s.url);
    console.log(`\n${s.id} (${s.kind}, tier ${s.tier}): ${items.length} položek`);
    for (const i of items.slice(0, 4)) {
      console.log(`  ${i.publishedAt?.slice(0, 10) ?? "bez data  "} ${i.title.slice(0, 80)}`);
    }
  } catch (e) {
    console.log(`\n${s.id}: CHYBA ${(e as Error).message}`);
  }
}
