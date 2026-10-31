import type { EventAnalysis, EventFact, IndicatorPoint, MarketEvent, SourceDocument } from "@finance-radar/shared";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { analyze, ANALYZE_PROMPT_VERSION } from "../ai/analyze.js";
import { classify, type Classification } from "../ai/classify.js";
import { MODELS, type CallCost } from "../ai/claude.js";
import { extract, type Extraction } from "../ai/extract.js";
import { matchEvent, type MatchCandidate } from "../ai/match.js";
import { fetchArticle } from "../collectors/article.js";
import { INDICATORS } from "../indicators/definitions.js";
import type { IndicatorDoc } from "../indicators/update.js";
import { MVP_SOURCES } from "../sources.js";
import { sendAlerts } from "./alerts.js";
import { marketContextFrom } from "./context.js";
import { DAILY_AI_LIMIT_USD, recordUsage, spentToday } from "./usage.js";
import { checkFacts, mergeFacts, scoreEvent, verificationOf } from "./verify.js";

/** Kolik čekajících dokumentů zpracovat za jeden běh dispatcheru (vejde se do časového limitu). */
const MAX_PER_RUN = 20;
/** 40 = i „informativní“ věci (změny podmínek bank, investiční témata) se dostanou do radaru. */
const RELEVANCE_THRESHOLD = 40;
const DISCARD_TTL_DAYS = 30;
const MAX_ATTEMPTS = 3;
const CONCURRENCY = 4;
/** Okno, ve kterém se hledá shodná událost. */
const MATCH_WINDOW_HOURS = 72;
const MAX_MATCH_CANDIDATES = 40;
/** Kritické události se analyzují automaticky, ostatní až na vyžádání. */
export const AUTO_ANALYZE_SCORE = 90;
const MAX_AUTO_ANALYSES_PER_RUN = 2;
const QUOTE_MAX_CHARS = 200;

export interface ProcessResult {
  processed: number;
  discarded: number;
  relevant: number;
  newEvents: number;
  mergedEvents: number;
  analyzed: number;
  alertsSent: number;
  errors: string[];
  usd: number;
  skippedReason?: string;
}

interface Prepared {
  doc: SourceDocument;
  classification?: Classification;
  extraction?: Extraction;
  error?: string;
}

const sourceName = (id: string) => MVP_SOURCES.find((s) => s.id === id)?.name ?? id;

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

function toFacts(x: Extraction, docId: string): EventFact[] {
  return x.statements.map((s) => ({
    t: s.type,
    s: s.statement,
    ...(s.subject ? { sub: s.subject } : {}),
    ...(s.value !== null ? { v: s.value } : {}),
    ...(s.unit ? { u: s.unit } : {}),
    ...(s.periodOrDate ? { per: s.periodOrDate } : {}),
    ...(s.attributedTo ? { by: s.attributedTo } : {}),
    q: s.quote.slice(0, QUOTE_MAX_CHARS),
    doc: docId,
  }));
}

/**
 * Zpracuje čekající dokumenty: text -> klasifikace -> (relevantní) extrakce -> sloučení do
 * události -> ověření a skóre. Nerelevantní dokumenty dostanou TTL a samy se smažou.
 */
export async function runProcessing(
  db: Firestore,
  now = new Date(),
  options: { appUrl?: string; sendAlerts?: boolean } = {},
): Promise<ProcessResult> {
  const result: ProcessResult = {
    processed: 0,
    discarded: 0,
    relevant: 0,
    newEvents: 0,
    mergedEvents: 0,
    analyzed: 0,
    alertsSent: 0,
    errors: [],
    usd: 0,
  };
  const costs: CallCost[] = [];

  const spent = await spentToday(db, now);
  if (spent >= DAILY_AI_LIMIT_USD) return { ...result, skippedReason: `denní limit $${DAILY_AI_LIMIT_USD} vyčerpán` };

  const pendingSnap = await db
    .collection("documents")
    .where("status", "==", "pending")
    .orderBy("fetchedAt")
    .limit(MAX_PER_RUN)
    .get();
  if (pendingSnap.empty) return result;

  // 1) Text + klasifikace + extrakce – paralelně, nezávisle na ostatních dokumentech.
  const prepared: Prepared[] = pendingSnap.docs.map((d) => ({ doc: d.data() as SourceDocument }));
  await mapLimit(prepared, CONCURRENCY, async (item) => {
    const { doc } = item;
    try {
      let text = "";
      try {
        text = (await fetchArticle(doc.url)).text;
      } catch {
        // Paywall nebo výpadek: klasifikuje se aspoň podle titulku a perexu.
      }
      const c = await classify({
        sourceName: sourceName(doc.sourceId),
        sourceTier: doc.tier,
        title: doc.title,
        summary: doc.perex,
        text,
      });
      costs.push(c.cost);
      item.classification = c.classification;
      if (c.classification.isRelevant && c.classification.relevance >= RELEVANCE_THRESHOLD) {
        const x = await extract({
          sourceName: sourceName(doc.sourceId),
          publishedAt: doc.publishedAt,
          title: doc.title,
          summary: doc.perex,
          text,
        });
        costs.push(x.cost);
        item.extraction = x.extraction;
      }
    } catch (e) {
      item.error = (e as Error).message.slice(0, 300);
    }
  });

  // 2) Ukazatele pro ověření faktů a pro tržní kontext analýzy (6 čtení).
  const indicatorDocs = (await db.getAll(...INDICATORS.map((d) => db.collection("indicators").doc(d.id)))).map(
    (s) => s.data() as IndicatorDoc | undefined,
  );
  const indicatorPoints: Record<string, IndicatorPoint[]> = Object.fromEntries(
    indicatorDocs.filter((d): d is IndicatorDoc => !!d).map((d) => [d.id, d.points]),
  );

  // 3) Slučování do událostí – postupně, aby dva články o téže věci v jednom běhu skončily v jedné události.
  const since = new Date(now.getTime() - MATCH_WINDOW_HOURS * 3_600_000).toISOString();
  const recentSnap = await db
    .collection("events")
    .where("updatedAt", ">=", since)
    .orderBy("updatedAt", "desc")
    .limit(MAX_MATCH_CANDIDATES)
    .get();
  const recent = new Map(recentSnap.docs.map((d) => [d.id, d.data() as MarketEvent]));
  /** Skóre jednotlivých článků podle událostí – pro přepočet maxima při sloučení. */
  const docScores = new Map<string, Omit<MarketEvent["scores"], "confidence">[]>();
  const changedEvents = new Set<string>();

  for (const item of prepared) {
    const ref = db.collection("documents").doc(item.doc.id);
    const c = item.classification;

    if (item.error || !c) {
      const attempts = (item.doc.attempts ?? 0) + 1;
      result.errors.push(`${item.doc.id}: ${item.error ?? "bez klasifikace"}`);
      await ref.update({
        attempts,
        ...(attempts >= MAX_ATTEMPTS
          ? { status: "error", expireAt: Timestamp.fromMillis(now.getTime() + DISCARD_TTL_DAYS * 86_400_000) }
          : {}),
      });
      continue;
    }
    result.processed++;

    if (!item.extraction || item.extraction.statements.length === 0) {
      result.discarded++;
      await ref.update({
        status: "discarded",
        finalScore: Math.round(c.relevance),
        expireAt: Timestamp.fromMillis(now.getTime() + DISCARD_TTL_DAYS * 86_400_000),
      });
      continue;
    }
    result.relevant++;

    const x = item.extraction;
    let matchId: string | null = null;
    try {
      const candidates: MatchCandidate[] = [...recent.values()].map((e) => ({
        id: e.id,
        title: e.title,
        summary: e.summary,
        firstSeenAt: e.firstSeenAt,
      }));
      const m = await matchEvent({
        title: x.eventTitle,
        summary: x.eventSummary,
        entities: x.entities,
        publishedAt: item.doc.publishedAt,
        candidates,
      });
      if (m.cost) costs.push(m.cost);
      matchId = m.matchId;
    } catch (e) {
      result.errors.push(`${item.doc.id} match: ${(e as Error).message.slice(0, 200)}`);
    }

    const existing = matchId ? recent.get(matchId) : undefined;
    const facts = checkFacts(mergeFacts(existing?.facts ?? [], toFacts(x, item.doc.id)), indicatorPoints);
    const sourceIds = [...new Set([...(existing?.sourceIds ?? []), item.doc.sourceId])];
    const bestTier = Math.min(existing?.bestTier ?? 4, item.doc.tier) as MarketEvent["bestTier"];
    const verification = verificationOf(facts, bestTier, sourceIds.length);
    const perDoc = [...(docScores.get(existing?.id ?? "") ?? (existing ? [existing.scores] : [])), c];
    // Lepší (primárnější) zdroj přebírá titulek a shrnutí.
    const takeText = !existing || item.doc.tier < existing.bestTier;

    const event: MarketEvent = {
      id: existing?.id ?? db.collection("events").doc().id,
      title: takeText ? x.eventTitle : existing.title,
      summary: takeText ? x.eventSummary : existing.summary,
      categories: [...new Set([...(existing?.categories ?? []), ...c.categories])],
      entities: [...new Set([...(existing?.entities ?? []), ...x.entities])].slice(0, 15),
      firstSeenAt: existing?.firstSeenAt ?? now.toISOString(),
      updatedAt: now.toISOString(),
      documentIds: [...new Set([...(existing?.documentIds ?? []), item.doc.id])],
      sourceIds,
      bestTier,
      ...scoreEvent(perDoc, verification),
      verification,
      facts,
      revision: (existing?.revision ?? 0) + 1,
      ...(existing?.analysis ? { analysis: existing.analysis } : {}),
      // Bez přenosu by sloučení dalšího zdroje poslalo stejný alert znovu.
      ...(existing?.alertedUsers ? { alertedUsers: existing.alertedUsers } : {}),
    };
    docScores.set(event.id, perDoc);

    const batch = db.batch();
    batch.set(db.collection("events").doc(event.id), event);
    batch.update(ref, { status: "classified", finalScore: event.finalScore, eventId: event.id });
    await batch.commit();

    recent.set(event.id, event);
    changedEvents.add(event.id);
    if (existing) result.mergedEvents++;
    else result.newEvents++;
  }

  // 4) Automatická analýza jen u kritických událostí (ostatní na vyžádání z webu).
  const contextLines = marketContextFrom(indicatorDocs);
  const toAnalyze = [...changedEvents]
    .map((id) => recent.get(id)!)
    .filter((e) => e.finalScore >= AUTO_ANALYZE_SCORE && e.analysis?.revision !== e.revision)
    .slice(0, MAX_AUTO_ANALYSES_PER_RUN);
  for (const e of toAnalyze) {
    if (spent + costs.reduce((s, c) => s + c.usd, 0) >= DAILY_AI_LIMIT_USD) break;
    try {
      const analysis = await analyzeEvent(e, contextLines);
      costs.push(analysis.cost);
      await db.collection("events").doc(e.id).update({ analysis: analysis.value });
      result.analyzed++;
    } catch (err) {
      result.errors.push(`${e.id} analyze: ${(err as Error).message.slice(0, 200)}`);
    }
  }

  await recordUsage(db, now, costs);
  result.usd = costs.reduce((s, c) => s + c.usd, 0);
  if (changedEvents.size > 0) await rebuildDashboardEvents(db, now);

  // 5) Push alerty podle pravidel uživatelů (selhání nesmí shodit zpracování).
  if (options.sendAlerts && changedEvents.size > 0) {
    try {
      const alerts = await sendAlerts(db, [...changedEvents].map((id) => recent.get(id)!), options.appUrl ?? "");
      result.alertsSent = alerts.sent;
      if (alerts.failed) result.errors.push(`alerty: ${alerts.failed} neodešlo, ${alerts.removedTokens} neplatných zařízení smazáno`);
    } catch (e) {
      result.errors.push(`alerty: ${(e as Error).message.slice(0, 200)}`);
    }
  }
  return result;
}

/** Analýza události (Opus). Používá ji automatika i budoucí funkce „na vyžádání“. */
export async function analyzeEvent(
  e: MarketEvent,
  marketContext: ReturnType<typeof marketContextFrom>,
): Promise<{ value: EventAnalysis; cost: CallCost }> {
  const r = await analyze(
    {
      sourceName: e.sourceIds.map(sourceName).join(", "),
      sourceTier: e.bestTier,
      publishedAt: e.firstSeenAt,
      extraction: {
        eventTitle: e.title,
        eventSummary: e.summary,
        entities: e.entities,
        statements: e.facts.map((f) => ({
          type: f.t,
          statement: f.s,
          subject: null,
          value: f.v ?? null,
          unit: f.u ?? null,
          periodOrDate: f.per ?? null,
          attributedTo: f.by ?? null,
          quote: f.q,
        })),
      },
      marketContext,
    },
    MODELS.analysis,
  );
  return {
    value: {
      ...r.analysis,
      model: r.servedBy,
      promptVersion: ANALYZE_PROMPT_VERSION,
      generatedAt: new Date().toISOString(),
      revision: e.revision,
    },
    cost: r.cost,
  };
}

/** Přepočítá „Dnešní top zprávy“ a počet kritických událostí v `dashboard/today`. */
export async function rebuildDashboardEvents(db: Firestore, now: Date): Promise<void> {
  const since = new Date(now.getTime() - 36 * 3_600_000).toISOString();
  const snap = await db.collection("events").where("updatedAt", ">=", since).limit(200).get();
  const events = snap.docs.map((d) => d.data() as MarketEvent).filter((e) => e.finalScore >= 30);
  events.sort((a, b) => b.finalScore - a.finalScore);
  await db
    .collection("dashboard")
    .doc("today")
    .set(
      {
        criticalCount: events.filter((e) => e.priority === "critical").length,
        topEvents: events.slice(0, 8).map((e) => ({
          id: e.id,
          title: e.title,
          priority: e.priority,
          finalScore: e.finalScore,
          categories: e.categories,
          verification: e.verification,
        })),
        eventsUpdatedAt: now.toISOString(),
      },
      { merge: true },
    );
}
