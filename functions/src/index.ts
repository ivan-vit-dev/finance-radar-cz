import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { setGlobalOptions } from "firebase-functions/v2";
import { onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { handleAnalyzeEvent, handleExplainEvent, handleGetBriefing, handleSendTestNotification } from "./callable.js";
import { defineSecret, defineString } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { runIndicators } from "./indicators/update.js";
import { runIngestion } from "./ingest/ingest.js";
import { runLegislation } from "./legislation/sync.js";
import { sendAlerts } from "./pipeline/alerts.js";
import { rebuildDashboardEvents, runProcessing } from "./pipeline/process.js";
import { readPauseState } from "./runtime.js";

initializeApp();

setGlobalOptions({ region: "europe-west3", maxInstances: 2 });

export const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");
export const cnbAradApiKey = defineSecret("CNB_ARAD_API_KEY");
/** Adresa webu pro odkazy v push notifikacích (functions/.env), např. https://finance-radar-cz.vercel.app */
export const appUrl = defineString("APP_URL", { default: "" });

/**
 * Jediný naplánovaný job (Cloud Scheduler má zdarma jen 3 joby).
 * Stáhne zdroje a ukazatele, které jsou podle své frekvence na řadě.
 */
export const dispatcher = onSchedule(
  {
    schedule: "every 15 minutes",
    timeZone: "Europe/Prague",
    timeoutSeconds: 300,
    memory: "512MiB",
    secrets: [cnbAradApiKey, anthropicApiKey],
  },
  async () => {
    const db = getFirestore();
    // Pauza z `config/runtime.pausedUntil` – viz runtime.ts. Stojí 1 čtení za běh.
    const pause = await readPauseState(db);
    if (pause.paused) {
      logger.info("dispatcher pozastaven", { until: pause.until });
      return;
    }
    if (pause.invalid) logger.warn("config/runtime.pausedUntil má neplatný formát, čekám YYYY-MM-DD", pause);

    const site = appUrl.value().replace(/\/+$/, "");
    const [ingestion, indicators, legislation] = await Promise.all([
      runIngestion(db),
      runIndicators(db, new Date(), cnbAradApiKey.value()),
      runLegislation(db),
    ]);

    // Změny fáze zákonů vytvořily události – dashboard a alerty jako u ostatních událostí.
    if (legislation.events.length > 0) {
      await rebuildDashboardEvents(db, new Date());
      await sendAlerts(db, legislation.events, site).catch((e: Error) =>
        logger.warn("alerty legislativy selhaly", { error: e.message }),
      );
    }

    // AI zpracování až po stažení, aby zahrnulo i nejnovější články.
    process.env.ANTHROPIC_API_KEY = anthropicApiKey.value();
    const processing = await runProcessing(db, new Date(), { sendAlerts: true, appUrl: site });

    const ran = ingestion.filter((r) => r.status !== "skipped");
    const saved = ran.reduce((s, r) => s + (r.saved ?? 0), 0);
    const checked = indicators.filter((r) => r.status !== "skipped");
    const errors = [...ingestion, ...indicators].filter((r) => r.status === "error");
    logger.info("dispatcher", {
      sources: ran.length,
      saved,
      indicators: checked.map((r) => `${r.id}:${r.status}`),
      legislation: { status: legislation.status, items: legislation.items, changed: legislation.changed, events: legislation.events.length },
      processing,
      errors: errors.length + processing.errors.length + (legislation.status === "error" ? 1 : 0),
      results: ran,
    });
    for (const e of errors) logger.warn("zdroj selhal", e);
    if (legislation.error) logger.warn("legislativa selhala", { error: legislation.error });
    for (const e of processing.errors) logger.warn("zpracování selhalo", { error: e });
  },
);

/** Analýza události na vyžádání z webu (Opus). Viz callable.ts. */
export const analyzeEvent = onCall(
  { secrets: [anthropicApiKey], timeoutSeconds: 120, memory: "512MiB", maxInstances: 2 },
  async (request) => {
    process.env.ANTHROPIC_API_KEY = anthropicApiKey.value();
    return handleAnalyzeEvent(getFirestore(), request.auth?.uid, (request.data as { eventId?: unknown })?.eventId);
  },
);

/** Briefing při prvním otevření aplikace v daný den (Opus). Viz callable.ts. */
export const getBriefing = onCall(
  { secrets: [anthropicApiKey], timeoutSeconds: 180, memory: "512MiB", maxInstances: 2 },
  async (request) => {
    process.env.ANTHROPIC_API_KEY = anthropicApiKey.value();
    return handleGetBriefing(getFirestore(), request.auth?.uid);
  },
);

/** „Vysvětli jednoduše“ v detailu události (Opus, uloží se). */
export const explainEvent = onCall(
  { secrets: [anthropicApiKey], timeoutSeconds: 60, maxInstances: 2 },
  async (request) => {
    process.env.ANTHROPIC_API_KEY = anthropicApiKey.value();
    return handleExplainEvent(getFirestore(), request.auth?.uid, (request.data as { eventId?: unknown })?.eventId);
  },
);

/** Zkušební push notifikace z nastavení. */
export const sendTestNotification = onCall({ maxInstances: 1 }, async (request) =>
  handleSendTestNotification(getFirestore(), request.auth?.uid, appUrl.value().replace(/\/+$/, "")),
);
