import {
  PEREX_MAX_CHARS,
  TITLE_MAX_CHARS,
  type Source,
  type SourceDocument,
  type SourceState,
} from "@finance-radar/shared";
import type { Firestore } from "firebase-admin/firestore";
import { fetchFeed, type FeedItem } from "../collectors/rss.js";
import { MVP_SOURCES } from "../sources.js";
import { canonicalUrl, urlId } from "./url.js";

/** Kolik hashů viděných URL držet na zdroj (HN má v kanálu až 150 položek). */
const SEEN_CAP = 400;
/** Starší položky se neukládají – hlavně při prvním běhu, kdy je v kanálu i archiv. */
const MAX_ITEM_AGE_DAYS = 3;
/** Po kolika chybách v řadě se zdroj začne zkoušet méně často (backoff). */
const BACKOFF_AFTER_ERRORS = 3;

export interface SourceRunResult {
  sourceId: string;
  status: "skipped" | "ok" | "error";
  fetched?: number;
  saved?: number;
  error?: string;
}

const EMPTY_STATE: SourceState = { consecutiveErrors: 0, lastNewCount: 0, seen: [] };

/** Je zdroj na řadě? Při opakovaných chybách se interval prodlužuje (max. 8×). */
export function isDue(source: Source, state: SourceState, now: Date): boolean {
  if (!state.lastFetchedAt) return true;
  const backoff = state.consecutiveErrors >= BACKOFF_AFTER_ERRORS ? Math.min(2 ** (state.consecutiveErrors - 2), 8) : 1;
  const elapsedMin = (now.getTime() - new Date(state.lastFetchedAt).getTime()) / 60_000;
  // Tolerance 1 minuty, aby 15minutový zdroj neutekl kvůli zpoždění scheduleru.
  return elapsedMin >= source.frequencyMinutes * backoff - 1;
}

/** Vybere z kanálu nové a dost čerstvé položky a převede je na šetrné dokumenty. */
export function selectNewDocuments(
  source: Source,
  items: FeedItem[],
  seen: Set<string>,
  now: Date,
): SourceDocument[] {
  const minDate = now.getTime() - MAX_ITEM_AGE_DAYS * 86_400_000;
  const docs = new Map<string, SourceDocument>();
  for (const item of items) {
    let id: string;
    let url: string;
    try {
      url = canonicalUrl(item.url);
      id = urlId(item.url);
    } catch {
      continue; // nevalidní URL v kanálu
    }
    if (seen.has(id) || docs.has(id)) continue;
    if (item.publishedAt && new Date(item.publishedAt).getTime() < minDate) continue;
    docs.set(id, {
      id,
      sourceId: source.id,
      tier: source.tier,
      url,
      title: item.title.slice(0, TITLE_MAX_CHARS),
      perex: truncate(item.summary, PEREX_MAX_CHARS),
      publishedAt: item.publishedAt,
      fetchedAt: now.toISOString(),
      status: "pending",
    });
  }
  return [...docs.values()];
}

/**
 * Jeden běh dispatcheru: projde zdroje, které jsou na řadě, a uloží nové dokumenty.
 * Čtení: 1 dokument stavu na zdroj. Zápisy: nové dokumenty + 1 stav na zdroj.
 */
export async function runIngestion(db: Firestore, now = new Date(), sources = MVP_SOURCES): Promise<SourceRunResult[]> {
  const enabled = sources.filter((s) => s.enabled && s.kind === "rss");
  const stateRefs = enabled.map((s) => db.collection("sourceState").doc(s.id));
  const snaps = stateRefs.length ? await db.getAll(...stateRefs) : [];

  return Promise.all(
    enabled.map(async (source, i): Promise<SourceRunResult> => {
      const state: SourceState = { ...EMPTY_STATE, ...(snaps[i].data() as Partial<SourceState> | undefined) };
      if (!isDue(source, state, now)) return { sourceId: source.id, status: "skipped" };

      try {
        const items = await fetchFeed(source.url);
        const candidates = selectNewDocuments(source, items, new Set(state.seen), now);
        // Stejný článek mohl přijít už z jiného zdroje – čtou se jen nové kandidáty, ne celý kanál.
        const refs = candidates.map((d) => db.collection("documents").doc(d.id));
        const existing = refs.length ? await db.getAll(...refs) : [];
        const docs = candidates.filter((_, j) => !existing[j].exists);

        const batch = db.batch();
        for (const d of docs) batch.create(db.collection("documents").doc(d.id), d);
        // Do „viděných“ patří všechny položky kanálu, i ty příliš staré – ať se neověřují znovu.
        const feedIds = items.flatMap((it) => {
          try {
            return [urlId(it.url)];
          } catch {
            return [];
          }
        });
        const seen = [...new Set([...feedIds, ...state.seen])].slice(0, SEEN_CAP);
        batch.set(stateRefs[i], {
          ...state,
          seen,
          lastFetchedAt: now.toISOString(),
          lastSuccessAt: now.toISOString(),
          lastError: null,
          consecutiveErrors: 0,
          lastNewCount: docs.length,
        } satisfies SourceState);
        await batch.commit();

        return { sourceId: source.id, status: "ok", fetched: items.length, saved: docs.length };
      } catch (e) {
        const message = (e as Error).message.slice(0, 300);
        await stateRefs[i].set(
          {
            ...state,
            lastFetchedAt: now.toISOString(),
            lastError: message,
            consecutiveErrors: state.consecutiveErrors + 1,
          } satisfies SourceState,
        );
        return { sourceId: source.id, status: "error", error: message };
      }
    }),
  );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > max * 0.6 ? lastSpace : max).trimEnd()}…`;
}
