// Přehled zpracovaných dokumentů v LOKÁLNÍM emulátoru: rozložení skóre a nejlépe hodnocené vyřazené.
// Spuštění: npx tsx scripts/inspect-emulator.ts

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
const { initializeApp } = await import("firebase-admin/app");
const { getFirestore } = await import("firebase-admin/firestore");
initializeApp({ projectId: "demo-finance-radar" });
const db = getFirestore();

const docs = (await db.collection("documents").get()).docs.map((d) => d.data());
const byStatus: Record<string, number> = {};
for (const d of docs) byStatus[d.status] = (byStatus[d.status] ?? 0) + 1;
console.log("stav:", JSON.stringify(byStatus));

const buckets: Record<string, number> = {};
for (const d of docs.filter((d) => d.finalScore !== undefined)) {
  const b = `${Math.floor(d.finalScore / 10) * 10}+`;
  buckets[b] = (buckets[b] ?? 0) + 1;
}
console.log("relevance vyřazených / skóre zařazených po desítkách:", JSON.stringify(buckets));

console.log("\nPrimární zdroje (tier 1):");
for (const d of docs.filter((d) => d.tier === 1)) console.log(`  ${d.status.padEnd(10)} ${d.finalScore ?? "-"}  ${d.title}`);

console.log("\nVyřazené s nejvyšší relevancí:");
for (const d of docs
  .filter((d) => d.status === "discarded")
  .sort((a, b) => b.finalScore - a.finalScore)
  .slice(0, 12)) {
  console.log(`  ${String(d.finalScore).padStart(3)} ${d.sourceId.padEnd(16)} ${d.title.slice(0, 90)}`);
}
