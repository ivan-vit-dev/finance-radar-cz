// Ověří synchronizaci legislativy proti LOKÁLNÍMU emulátoru (skutečná data psp.cz a e-Sbírky).
// Spuštění: npx tsx scripts/legislation-emulator.ts

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
if (!/^(127\.0\.0\.1|localhost):/.test(process.env.FIRESTORE_EMULATOR_HOST)) throw new Error("Jen emulátor");

const { initializeApp } = await import("firebase-admin/app");
const { getFirestore } = await import("firebase-admin/firestore");
const { runLegislation } = await import("../src/legislation/sync.js");

initializeApp({ projectId: "demo-finance-radar" });
const db = getFirestore();
const t0 = new Date();
const at = (h: number) => new Date(t0.getTime() + h * 3_600_000);
const brief = (r: Awaited<ReturnType<typeof runLegislation>>) =>
  `${r.status}, zákonů ${r.items ?? "-"}, změněno ${r.changed ?? "-"}, událostí ${r.events.length}${r.error ? `, chyba ${r.error}` : ""}`;

const t = Date.now();
console.log("1) první běh:", brief(await runLegislation(db, at(0))), `${((Date.now() - t) / 1000).toFixed(0)} s`);
console.log("2) za 1 h (není na řadě):", brief(await runLegislation(db, at(1))));
console.log("3) za 13 h (bez změn):", brief(await runLegislation(db, at(13))));

// Simulace: novela o spotřebitelském úvěru byla „včera“ ještě ve Sněmovně.
const docs = await db.collection("legislation").get();
const target = docs.docs.find((d) => /spotřebitelském úvěru/.test(d.data().title));
if (target) {
  await target.ref.update({ phase: "snemovna" });
  const r = await runLegislation(db, at(26));
  console.log("4) po simulované změně fáze:", brief(r));
  for (const e of r.events) console.log(`   ${e.finalScore} ${e.priority} | ${e.title}\n   ${e.summary}\n   odkazy: ${e.links?.map((l) => l.url).join(", ")}`);
}

const all = docs.docs.map((d) => d.data());
const bytes = all.reduce((s, d) => s + Buffer.byteLength(JSON.stringify(d)), 0);
console.log(`\nlegislation: ${all.length} dokumentů, celkem ${(bytes / 1024).toFixed(1)} kB`);
const byPhase: Record<string, number> = {};
for (const d of all) byPhase[d.phase] = (byPhase[d.phase] ?? 0) + 1;
console.log("fáze:", JSON.stringify(byPhase));
