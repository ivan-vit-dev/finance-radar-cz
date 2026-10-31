// Aktualizuje ukazatele proti LOKÁLNÍMU emulátoru Firestore (nikdy proti produkci).
// Data se stahují ze skutečných zdrojů (ČNB, ARAD, ČSÚ).
// Spuštění: npm run indicators:emulator -w functions

import { loadLocalSecrets } from "./local-secrets.js";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
if (!/^(127\.0\.0\.1|localhost):/.test(process.env.FIRESTORE_EMULATOR_HOST)) {
  throw new Error("Skript smí běžet jen proti lokálnímu emulátoru");
}
loadLocalSecrets();

const { initializeApp } = await import("firebase-admin/app");
const { getFirestore } = await import("firebase-admin/firestore");
const { runIndicators } = await import("../src/indicators/update.js");

initializeApp({ projectId: "demo-finance-radar" });
const db = getFirestore();
const key = process.env.CNB_ARAD_API_KEY;

const t0 = new Date();
for (const [label, now] of [
  ["1. běh", t0],
  ["2. běh o 30 min později (nic není na řadě)", new Date(t0.getTime() + 30 * 60_000)],
  ["3. běh o 13 h později (vše na řadě, data stejná)", new Date(t0.getTime() + 13 * 3_600_000)],
] as const) {
  const results = await runIndicators(db, now, key);
  console.log(`\n${label}:`);
  for (const r of results) {
    console.log(`  ${r.id.padEnd(20)} ${r.status.padEnd(9)} ${r.latest ? `${r.latest.p} = ${r.latest.v}` : ""}${r.error ? r.error : ""}`);
  }
}

const docs = await db.collection("indicators").get();
const bytes = docs.docs.reduce((s, d) => s + Buffer.byteLength(JSON.stringify(d.data())), 0);
console.log(`\nindicators: ${docs.size} dokumentů, celkem ${(bytes / 1024).toFixed(1)} kB`);
const dash = (await db.collection("dashboard").doc("today").get()).data();
console.log(`dashboard/today (${Buffer.byteLength(JSON.stringify(dash))} B):`);
console.log(JSON.stringify(dash, null, 2));
