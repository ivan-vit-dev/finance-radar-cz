import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { setGlobalOptions } from "firebase-functions/v2";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { runIndicators } from "./indicators/update.js";
import { runIngestion } from "./ingest/ingest.js";

initializeApp();

setGlobalOptions({ region: "europe-west3", maxInstances: 2 });

export const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");
export const cnbAradApiKey = defineSecret("CNB_ARAD_API_KEY");

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
    secrets: [cnbAradApiKey],
  },
  async () => {
    const db = getFirestore();
    const [ingestion, indicators] = await Promise.all([
      runIngestion(db),
      runIndicators(db, new Date(), cnbAradApiKey.value()),
    ]);

    const ran = ingestion.filter((r) => r.status !== "skipped");
    const saved = ran.reduce((s, r) => s + (r.saved ?? 0), 0);
    const checked = indicators.filter((r) => r.status !== "skipped");
    const errors = [...ingestion, ...indicators].filter((r) => r.status === "error");
    logger.info("dispatcher", {
      sources: ran.length,
      saved,
      indicators: checked.map((r) => `${r.id}:${r.status}`),
      errors: errors.length,
      results: ran,
    });
    for (const e of errors) logger.warn("zdroj selhal", e);
  },
);
