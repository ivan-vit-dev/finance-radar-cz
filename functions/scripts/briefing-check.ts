// Ověří getBriefing proti LOKÁLNÍMU emulátoru: klidný briefing bez AI, pak briefing z reálných
// událostí (sběr + zpracování, Opus ~$0,05). Spuštění: npx tsx scripts/briefing-check.ts

import type { Briefing } from "@finance-radar/shared";
import { loadLocalSecrets } from "./local-secrets.js";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
if (!/^(127\.0\.0\.1|localhost):/.test(process.env.FIRESTORE_EMULATOR_HOST)) throw new Error("Jen emulátor");
loadLocalSecrets();

const { initializeApp } = await import("firebase-admin/app");
const { getFirestore } = await import("firebase-admin/firestore");
const { handleGetBriefing } = await import("../src/callable.js");
const { runIngestion } = await import("../src/ingest/ingest.js");
const { runIndicators } = await import("../src/indicators/update.js");
const { runProcessing } = await import("../src/pipeline/process.js");

initializeApp({ projectId: "demo-finance-radar" });
const db = getFirestore();
await db.collection("admins").doc("owner").set({ email: "test@example.com" });
await runIndicators(db, new Date(), process.env.CNB_ARAD_API_KEY);

const show = async (label: string) => {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(new Date());
  const b = (await db.collection("briefings").doc(today).get()).data() as Briefing;
  console.log(`\n=== ${label}: ${b.kind}${b.model ? ` (${b.model})` : ""}, událostí ${b.events.length}, čísel ${b.numbers.length}`);
  console.log("Titulek:", b.headline);
  if (b.topStory) console.log(`Hlavní: ${b.topStory.title}\n  ${b.topStory.text}\n  Sledovat: ${b.topStory.watch}`);
  for (const s of b.sections) console.log(`[${s.area}] ${s.text} (${s.eventIds.length} událostí)`);
  for (const f of b.forAdvisor) console.log(`• ${f}`);
};

// 1) Prázdná databáze -> klidný briefing bez AI
console.log("1)", await handleGetBriefing(db, "owner"));
await show("bez událostí");
const usage1 = (await db.collection("aiUsage").get()).docs.reduce((s, d) => s + (d.data().usd ?? 0), 0);
console.log("útrata:", usage1);

// 2) Reálné události -> briefing od modelu
const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(new Date());
await db.collection("briefings").doc(today).delete();
await runIngestion(db);
for (let i = 0; i < 4; i++) await runProcessing(db);
const t = Date.now();
console.log("\n2)", await handleGetBriefing(db, "owner"), `${((Date.now() - t) / 1000).toFixed(1)} s`);
await show("s událostmi");
console.log("3) znovu:", await handleGetBriefing(db, "owner"));
const usage = (await db.collection("aiUsage").get()).docs.map((d) => d.data());
console.log("aiUsage:", JSON.stringify(usage.map((u) => ({ usd: u.usd, calls: u.calls, byModel: u.byModel }))));
