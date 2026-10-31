// Celý řetězec proti LOKÁLNÍMU emulátoru Firestore: sběr -> ukazatele -> AI zpracování.
// Volá skutečné API (RSS, ČNB, Claude) – stojí řádově centy.
// Spuštění: npm run pipeline:emulator -w functions -- [--runs 2]

import { loadLocalSecrets } from "./local-secrets.js";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
if (!/^(127\.0\.0\.1|localhost):/.test(process.env.FIRESTORE_EMULATOR_HOST)) {
  throw new Error("Skript smí běžet jen proti lokálnímu emulátoru");
}
loadLocalSecrets();

const { initializeApp } = await import("firebase-admin/app");
const { getFirestore } = await import("firebase-admin/firestore");
const { runIngestion } = await import("../src/ingest/ingest.js");
const { runIndicators } = await import("../src/indicators/update.js");
const { runProcessing } = await import("../src/pipeline/process.js");

initializeApp({ projectId: "demo-finance-radar" });
const db = getFirestore();

const i = process.argv.indexOf("--runs");
const runs = i >= 0 ? Number(process.argv[i + 1]) : 2;

const saved = (await runIngestion(db)).reduce((s, r) => s + (r.saved ?? 0), 0);
await runIndicators(db, new Date(), process.env.CNB_ARAD_API_KEY);
console.log(`Sběr: ${saved} nových dokumentů, ukazatele aktualizovány`);

let usd = 0;
for (let r = 1; r <= runs; r++) {
  const t = Date.now();
  const res = await runProcessing(db);
  usd += res.usd;
  console.log(
    `Zpracování ${r}: ${res.processed} zpracováno, ${res.discarded} vyřazeno, ${res.relevant} relevantních -> ` +
      `${res.newEvents} nových událostí, ${res.mergedEvents} sloučeno, ${res.analyzed} analyzováno, ` +
      `$${res.usd.toFixed(4)}, ${((Date.now() - t) / 1000).toFixed(0)} s${res.skippedReason ? `, ${res.skippedReason}` : ""}`,
  );
  for (const e of res.errors) console.log("  chyba:", e);
}

const events = (await db.collection("events").orderBy("finalScore", "desc").get()).docs.map((d) => d.data());
console.log(`\nUdálosti (${events.length}), celkem $${usd.toFixed(4)}:`);
for (const e of events) {
  console.log(
    `  ${String(e.finalScore).padStart(3)} ${e.priority.padEnd(9)} ${e.verification.padEnd(18)} zdroje ${e.sourceIds.join("+").padEnd(28)} ${e.title.slice(0, 80)}`,
  );
  for (const f of e.facts.filter((f: { chk?: string }) => f.chk)) console.log(`      ověření ${f.chk}: ${f.s}`);
  if (e.analysis) console.log(`      analýza (${e.analysis.model}): ${e.analysis.whatHappened.slice(0, 120)}…`);
}
const bytes = events.reduce((s, e) => s + Buffer.byteLength(JSON.stringify(e)), 0);
console.log(`Velikost událostí: průměrně ${Math.round(bytes / Math.max(events.length, 1))} B`);
const dash = (await db.collection("dashboard").doc("today").get()).data();
console.log(`dashboard: criticalCount ${dash?.criticalCount}, topEvents ${dash?.topEvents?.length}`);
const usage = (await db.collection("aiUsage").get()).docs.map((d) => ({ id: d.id, ...d.data() }));
console.log("aiUsage:", JSON.stringify(usage));
