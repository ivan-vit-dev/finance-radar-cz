// Ukázka „Vysvětli jednoduše“ na pevné události (volá Claude, ~$0,01, nic nezapisuje).
// Spuštění: npx tsx scripts/explain-check.ts
import type { MarketEvent } from "@finance-radar/shared";
import { explainSimply } from "../src/ai/explain.js";
import { loadLocalSecrets } from "./local-secrets.js";

loadLocalSecrets();

const event = {
  title: "ČNB ponechala úrokové sazby beze změny",
  summary: "Bankovní rada ČNB ponechala 2T repo sazbu na 3,75 %. Inflace se podle prognózy zkraje příštího roku dočasně zvýší ke 3 %.",
  facts: [
    { t: "fact", s: "Bankovní rada ČNB ponechala 2T repo sazbu na 3,75 %.", by: "ČNB", q: "", doc: "d" },
    { t: "forecast", s: "Inflace se zkraje příštího roku dočasně zvýší ke 3 %.", by: "ČNB", q: "", doc: "d" },
  ],
} as unknown as MarketEvent;

const t = Date.now();
const r = await explainSimply(event);
console.log(r.text);
console.log(`\n${r.model}, $${r.cost.usd.toFixed(4)}, ${((Date.now() - t) / 1000).toFixed(1)} s`);
