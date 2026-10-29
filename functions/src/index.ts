import { initializeApp } from "firebase-admin/app";
import { setGlobalOptions } from "firebase-functions/v2";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";

initializeApp();

setGlobalOptions({ region: "europe-west3", maxInstances: 2 });

export const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

/**
 * Jediný naplánovaný job (Cloud Scheduler má zdarma jen 3 joby).
 * Ve fázi 2 projde kolekci `sources` a spustí collectory zdrojů,
 * kterým uplynul `frequencyMinutes` od `lastFetchedAt`.
 */
export const dispatcher = onSchedule(
  { schedule: "every 15 minutes", timeZone: "Europe/Prague" },
  async () => {
    logger.info("dispatcher tick – collectory zatím nejsou implementované (fáze 2)");
  },
);
