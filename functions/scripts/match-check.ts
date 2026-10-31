// Ruční ověření párování událostí na skutečných titulcích (volá Claude Haiku, < $0,01).
// Spuštění: npx tsx scripts/match-check.ts
import { matchEvent, type MatchCandidate } from "../src/ai/match.js";
import { loadLocalSecrets } from "./local-secrets.js";

loadLocalSecrets();

const candidates: MatchCandidate[] = [
  {
    id: "cez",
    title: "ČEZ od příštího roku zdraží elektřinu a plyn",
    summary: "ČEZ zvýší od ledna ceny elektřiny a plynu pro zákazníky bez fixace, domácnosti si připlatí stovky korun ročně.",
    firstSeenAt: "2026-10-29T08:00:00Z",
  },
  {
    id: "cnb-aug",
    title: "ČNB ponechala úrokové sazby beze změny",
    summary: "Bankovní rada ČNB na srpnovém zasedání ponechala 2T repo sazbu na 3,75 %.",
    firstSeenAt: "2026-08-07T12:00:00Z",
  },
  {
    id: "mf-pred",
    title: "MF zveřejnilo srpnovou makroekonomickou predikci",
    summary: "Ministerstvo financí odhaduje růst HDP v roce 2026 a inflaci kolem 2 %.",
    firstSeenAt: "2026-08-28T09:00:00Z",
  },
];

const cases = [
  {
    expect: "cez",
    title: "ČEZ zdraží od nového roku elektřinu i plyn",
    summary: "Zákazníci ČEZ bez fixace zaplatí od ledna za energie více, firma zdražení zdůvodňuje vývojem cen na trzích.",
    entities: ["ČEZ"],
  },
  {
    expect: null,
    title: "Pražská energetika od ledna zdražuje elektřinu",
    summary: "PRE zvýší ceny elektřiny pro domácnosti bez fixace od 1. ledna.",
    entities: ["Pražská energetika"],
  },
  {
    expect: null,
    title: "ČNB v listopadu snížila repo sazbu na 3,5 %",
    summary: "Bankovní rada ČNB na listopadovém zasedání snížila 2T repo sazbu o 0,25 p. b.",
    entities: ["ČNB"],
  },
  {
    expect: "mf-pred",
    title: "Ministerstvo financí: ekonomika letos poroste o 1,8 %, inflace zůstane u cíle",
    summary: "Srpnová makroekonomická predikce MF počítá s růstem HDP a inflací poblíž 2 %.",
    entities: ["Ministerstvo financí"],
  },
];

let ok = 0;
for (const c of cases) {
  const r = await matchEvent({ ...c, publishedAt: "2026-10-30T10:00:00Z", candidates });
  const pass = r.matchId === c.expect;
  if (pass) ok++;
  console.log(`${pass ? "OK  " : "FAIL"} ${c.title} -> ${r.matchId ?? "nová událost"} (čekám ${c.expect ?? "nová událost"})`);
}
console.log(`${ok}/${cases.length}`);
