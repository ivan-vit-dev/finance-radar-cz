// Spustí ingestion proti LOKÁLNÍMU emulátoru Firestore (nikdy proti produkci).
// Předpoklad: běží `npm run emulators` (nebo aspoň firestore emulátor na 127.0.0.1:8080).
// Spuštění: npm run ingest:emulator -w functions

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
const PROJECT_ID = "demo-finance-radar";

const { initializeApp } = await import("firebase-admin/app");
const { getFirestore } = await import("firebase-admin/firestore");
const { runIngestion } = await import("../src/ingest/ingest.js");

if (!process.env.FIRESTORE_EMULATOR_HOST?.startsWith("127.0.0.1") && !process.env.FIRESTORE_EMULATOR_HOST?.startsWith("localhost")) {
  throw new Error("Skript smí běžet jen proti lokálnímu emulátoru");
}

initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();

const print = (label: string, results: Awaited<ReturnType<typeof runIngestion>>) => {
  console.log(`\n${label}`);
  for (const r of results) {
    console.log(`  ${r.sourceId.padEnd(16)} ${r.status.padEnd(7)} ${r.fetched ?? ""}${r.fetched !== undefined ? " v kanálu, " : ""}${r.saved !== undefined ? `${r.saved} nových` : ""}${r.error ? ` – ${r.error}` : ""}`);
  }
};

const t0 = new Date();
print("1. běh:", await runIngestion(db, t0));
print("2. běh o 5 min později (zdroje nejsou na řadě):", await runIngestion(db, new Date(t0.getTime() + 5 * 60_000)));
print("3. běh o 2 h později (vše na řadě, dedup):", await runIngestion(db, new Date(t0.getTime() + 120 * 60_000)));

const docs = await db.collection("documents").get();
const bytes = docs.docs.reduce((s, d) => s + Buffer.byteLength(JSON.stringify(d.data())), 0);
const states = await db.collection("sourceState").get();
const stateBytes = states.docs.reduce((s, d) => s + Buffer.byteLength(JSON.stringify(d.data())), 0);
console.log(
  `\nDokumentů: ${docs.size}, průměrně ${Math.round(bytes / Math.max(docs.size, 1))} B na dokument, celkem ${(bytes / 1024).toFixed(1)} kB`,
);
console.log(`Stav zdrojů: ${states.size} dokumentů, celkem ${(stateBytes / 1024).toFixed(1)} kB`);
console.log("Ukázka dokumentu:", JSON.stringify(docs.docs[0]?.data(), null, 2));
