// Ověří analyzeEvent proti LOKÁLNÍMU emulátoru: vygenerování, opakované volání (bez placení)
// a souběžná volání (zámek). Volá Claude Opus jednou (~$0,04).
// Spuštění: npx tsx scripts/analyze-check.ts

import type { MarketEvent } from "@finance-radar/shared";
import { loadLocalSecrets } from "./local-secrets.js";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
if (!/^(127\.0\.0\.1|localhost):/.test(process.env.FIRESTORE_EMULATOR_HOST)) throw new Error("Jen emulátor");
loadLocalSecrets();

const { initializeApp } = await import("firebase-admin/app");
const { getFirestore } = await import("firebase-admin/firestore");
const { handleAnalyzeEvent } = await import("../src/callable.js");
const { runIndicators } = await import("../src/indicators/update.js");

initializeApp({ projectId: "demo-finance-radar" });
const db = getFirestore();

await db.collection("admins").doc("owner").set({ email: "test@example.com" });
await runIndicators(db, new Date(), process.env.CNB_ARAD_API_KEY);

const event: MarketEvent = {
  id: "evt-cnb-test",
  title: "ČNB ponechala úrokové sazby beze změny",
  summary: "Bankovní rada ČNB ponechala 2T repo sazbu na 3,75 %. Inflace se podle prognózy zkraje příštího roku dočasně zvýší ke 3 %.",
  categories: ["cnb", "mortgages", "economy"],
  entities: ["ČNB", "bankovní rada"],
  firstSeenAt: "2026-10-31T08:00:00Z",
  updatedAt: "2026-10-31T08:00:00Z",
  documentIds: ["doc1"],
  sourceIds: ["cnb-tz"],
  bestTier: 1,
  scores: { relevance: 95, advisorImpact: 90, marketImpact: 90, urgency: 75, confidence: 95 },
  finalScore: 90,
  priority: "critical",
  verification: "verified_primary",
  facts: [
    {
      t: "fact",
      s: "Bankovní rada ČNB ponechala 2T repo sazbu na 3,75 %.",
      sub: "repo_rate",
      v: 3.75,
      u: "%",
      per: "2026-10-31",
      by: "ČNB",
      q: "2T repo sazba zůstává na 3,75 %",
      doc: "doc1",
      chk: "ok",
    },
    { t: "forecast", s: "Inflace se zkraje příštího roku dočasně zvýší ke 3 %.", v: 3, u: "%", per: "2027-Q1", by: "ČNB", q: "dojde k jejímu dočasnému nárůstu ke 3 %", doc: "doc1" },
  ],
  revision: 1,
};
await db.collection("events").doc(event.id).set(event);

const t = Date.now();
console.log("1) první volání:", await handleAnalyzeEvent(db, "owner", event.id), `${((Date.now() - t) / 1000).toFixed(1)} s`);
console.log("2) opakované volání:", await handleAnalyzeEvent(db, "owner", event.id));

await db.collection("events").doc(event.id).update({ revision: 2 });
const [a, b] = await Promise.allSettled([
  handleAnalyzeEvent(db, "owner", event.id),
  handleAnalyzeEvent(db, "owner", event.id),
]);
console.log(
  "3) dvě souběžná volání po změně události:",
  [a, b].map((r) => (r.status === "fulfilled" ? r.value.status : `chyba ${(r.reason as Error).message}`)),
);

const saved = (await db.collection("events").doc(event.id).get()).data() as MarketEvent;
console.log("analýza: revize", saved.analysis?.revision, "| model", saved.analysis?.model);
console.log("pro poradce:", saved.analysis?.forAdvisor.map((f) => `${f.label}: ${f.text}`).join("\n  "));
const usage = (await db.collection("aiUsage").get()).docs.map((d) => d.data());
console.log("aiUsage:", JSON.stringify(usage.map((u) => ({ usd: u.usd, calls: u.calls }))));
await Promise.allSettled([handleAnalyzeEvent(db, "stranger", event.id)]).then(([r]) =>
  console.log("4) cizí účet:", r.status === "rejected" ? (r.reason as { code: string }).code : "PUSTIL!"),
);
