// Stáhne data Sněmovny a vypíše relevantní zákony a jejich fáze (nic nezapisuje).
// Spuštění: npx tsx scripts/legislation-check.ts
import { USER_AGENT } from "../src/collectors/http.js";
import { fetchEffectiveFrom } from "../src/legislation/esbirka.js";
import { downloadPsp, finalPhase, selectLegislation } from "../src/legislation/psp.js";

const t = Date.now();
const data = await downloadPsp(USER_AGENT);
const items = selectLegislation(data, new Date());
console.log(`staženo a zpracováno za ${((Date.now() - t) / 1000).toFixed(1)} s, relevantních zákonů: ${items.length}`);

const today = new Date().toISOString().slice(0, 10);
const byPhase: Record<string, number> = {};
for (const it of items) {
  let effective: string | null = null;
  if (it.sbirka) effective = await fetchEffectiveFrom(it.sbirka.rok, it.sbirka.cislo, USER_AGENT);
  const phase = finalPhase(it.phase, !!it.sbirka, effective ?? undefined, today);
  byPhase[phase] = (byPhase[phase] ?? 0) + 1;
  if (it.sbirka || phase !== "snemovna") {
    console.log(
      `  ${phase.padEnd(10)} t.${it.tisk}/${it.term} ${it.title.slice(0, 60).padEnd(60)} ${it.sbirka ? `${it.sbirka.cislo}/${it.sbirka.rok} Sb.` : ""} ${effective ? `účinnost ${effective}` : ""} [${it.matched.join(", ")}]`,
    );
  }
}
console.log("fáze:", JSON.stringify(byPhase));
console.log("ukázka návrhů ve Sněmovně:");
for (const it of items.filter((x) => !x.sbirka && x.phase === "snemovna").slice(0, 6)) {
  console.log(`  t.${it.tisk} ${it.title.slice(0, 70)} – ${it.stateLabel} [${it.matched.join(", ")}]`);
}
