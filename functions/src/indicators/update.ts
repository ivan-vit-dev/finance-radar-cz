import {
  computeIndicatorStats,
  type DashboardSnapshot,
  type IndicatorPoint,
  type IndicatorStats,
} from "@finance-radar/shared";
import type { Firestore } from "firebase-admin/firestore";
import { createFetchContext, INDICATORS, type IndicatorDef } from "./definitions.js";

/** Dokument `indicators/{id}`. Řada je krátká a kompaktní (~1–2 kB na ukazatel). */
export interface IndicatorDoc {
  id: string;
  label: string;
  unit: string;
  decimals: number;
  source: string;
  points: IndicatorPoint[];
  stats: IndicatorStats | null;
  lastCheckedAt?: string;
  lastChangedAt?: string;
  lastError?: string | null;
  consecutiveErrors: number;
}

export interface IndicatorRunResult {
  id: string;
  status: "skipped" | "unchanged" | "changed" | "error";
  latest?: IndicatorPoint;
  error?: string;
}

/** Sloučí nové body se stávajícími (podle období), seřadí a zkrátí na `keep`. */
export function mergePoints(existing: IndicatorPoint[], incoming: IndicatorPoint[], keep: number): IndicatorPoint[] {
  const byPeriod = new Map(existing.map((x) => [x.p, x.v]));
  for (const x of incoming) byPeriod.set(x.p, x.v);
  return [...byPeriod.entries()]
    .map(([p, v]) => ({ p, v }))
    .sort((a, b) => a.p.localeCompare(b.p))
    .slice(-keep);
}

export function isIndicatorDue(def: IndicatorDef, doc: IndicatorDoc | undefined, now: Date): boolean {
  if (!doc?.lastCheckedAt) return true;
  const hours = (now.getTime() - new Date(doc.lastCheckedAt).getTime()) / 3_600_000;
  // Po chybách zkusit dřív, ale ne častěji než každou hodinu.
  const every = doc.consecutiveErrors > 0 ? Math.min(def.checkEveryHours, 1) : def.checkEveryHours;
  return hours >= every - 1 / 60;
}

/**
 * Aktualizuje ukazatele, které jsou na řadě, a při změně přepočítá `dashboard/today`.
 * Čtení: 1 dokument na ukazatel (+1 dashboard při změně). Zápis jen u kontrolovaných ukazatelů.
 */
export async function runIndicators(
  db: Firestore,
  now = new Date(),
  aradApiKey?: string,
  defs = INDICATORS,
): Promise<IndicatorRunResult[]> {
  const refs = defs.map((d) => db.collection("indicators").doc(d.id));
  const snaps = await db.getAll(...refs);
  const docs = snaps.map((s) => s.data() as IndicatorDoc | undefined);
  const ctx = createFetchContext(aradApiKey);

  const results = await Promise.all(
    defs.map(async (def, i): Promise<IndicatorRunResult> => {
      const doc = docs[i];
      if (!isIndicatorDue(def, doc, now)) return { id: def.id, status: "skipped" };
      try {
        const incoming = await def.fetch(ctx);
        if (incoming.length === 0) throw new Error("zdroj nevrátil žádná data");
        const points = mergePoints(def.appendOnly ? (doc?.points ?? []) : [], incoming, def.keep);
        const changed = JSON.stringify(points) !== JSON.stringify(doc?.points ?? []);
        const next: IndicatorDoc = {
          id: def.id,
          label: def.label,
          unit: def.unit,
          decimals: def.decimals,
          source: def.source,
          points,
          stats: computeIndicatorStats(points, def.mode, def.trendLookback, def.trendThreshold),
          lastCheckedAt: now.toISOString(),
          lastError: null,
          consecutiveErrors: 0,
        };
        const lastChangedAt = changed ? now.toISOString() : doc?.lastChangedAt;
        if (lastChangedAt) next.lastChangedAt = lastChangedAt;
        await refs[i].set(next);
        // Do dashboardu jdou jen data, která se opravdu uložila.
        docs[i] = next;
        return { id: def.id, status: changed ? "changed" : "unchanged", latest: next.stats?.latest };
      } catch (e) {
        const message = (e as Error).message.slice(0, 300);
        await refs[i].set(
          { lastCheckedAt: now.toISOString(), lastError: message, consecutiveErrors: (doc?.consecutiveErrors ?? 0) + 1 },
          { merge: true },
        );
        return { id: def.id, status: "error", error: message };
      }
    }),
  );

  if (results.some((r) => r.status === "changed")) {
    await rebuildDashboardIndicators(db, defs, docs, now);
  }
  return results;
}

/** Zapíše do `dashboard/today` ukazatele a trendy. Události (fáze 4) nechává beze změny. */
export async function rebuildDashboardIndicators(
  db: Firestore,
  defs: IndicatorDef[],
  docs: (IndicatorDoc | undefined)[],
  now: Date,
): Promise<void> {
  const indicators: DashboardSnapshot["indicators"] = [];
  const categoryTrends: DashboardSnapshot["categoryTrends"] = [];

  defs.forEach((def, i) => {
    const stats = docs[i]?.stats;
    if (!stats) return;
    indicators.push({
      id: def.id,
      label: def.label,
      value: stats.latest.v,
      unit: def.unit,
      decimals: def.decimals,
      ...(stats.change !== undefined
        ? { change: stats.change, changeUnit: def.mode === "pb" ? "p. b." : "%", changeLabel: def.changeLabel }
        : {}),
      asOf: stats.latest.p,
    });
    if (def.trendLabel) categoryTrends.push({ category: def.category, label: def.trendLabel, trend: stats.trend });
  });

  const ref = db.collection("dashboard").doc("today");
  const exists = (await ref.get()).exists;
  await ref.set(
    {
      date: new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(now),
      updatedAt: now.toISOString(),
      indicators,
      categoryTrends,
      ...(exists ? {} : { criticalCount: 0, topEvents: [] }),
    },
    { merge: true },
  );
}
