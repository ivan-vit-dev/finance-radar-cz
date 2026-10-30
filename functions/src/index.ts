import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { setGlobalOptions } from "firebase-functions/v2";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { runIngestion } from "./ingest/ingest.js";

initializeApp();

setGlobalOptions({ region: "europe-west3", maxInstances: 2 });

export const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");
export const cnbAradApiKey = defineSecret("CNB_ARAD_API_KEY");

/**
 * Jediný naplánovaný job (Cloud Scheduler má zdarma jen 3 joby).
 * Projde zdroje, kterým uplynul `frequencyMinutes` od posledního stažení, a uloží nové dokumenty.
 */
export const dispatcher = onSchedule(
  { schedule: "every 15 minutes", timeZone: "Europe/Prague", timeoutSeconds: 300, memory: "512MiB" },
  async () => {
    const results = await runIngestion(getFirestore());
    const ran = results.filter((r) => r.status !== "skipped");
    const errors = results.filter((r) => r.status === "error");
    const saved = ran.reduce((s, r) => s + (r.saved ?? 0), 0);
    logger.info("dispatcher", { sources: ran.length, saved, errors: errors.length, results: ran });
    for (const e of errors) logger.warn("zdroj selhal", e);
  },
);
