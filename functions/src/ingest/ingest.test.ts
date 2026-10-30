import type { Source, SourceState } from "@finance-radar/shared";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FeedItem } from "../collectors/rss.js";
import { isDue, selectNewDocuments } from "./ingest.js";
import { canonicalUrl, urlId } from "./url.js";

const source: Source = {
  id: "test",
  name: "Test",
  kind: "rss",
  url: "https://example.cz/rss",
  tier: 3,
  priority: 50,
  frequencyMinutes: 30,
  categories: ["economy"],
  enabled: true,
};
const now = new Date("2026-10-30T12:00:00Z");
const state = (over: Partial<SourceState> = {}): SourceState => ({
  consecutiveErrors: 0,
  lastNewCount: 0,
  seen: [],
  ...over,
});
const item = (over: Partial<FeedItem> = {}): FeedItem => ({
  title: "Titulek",
  url: "https://example.cz/clanek-1",
  publishedAt: "2026-10-30T10:00:00Z",
  summary: "Perex",
  ...over,
});

describe("canonicalUrl / urlId", () => {
  it("odstraní sledovací parametry, fragment a koncové lomítko a sjednotí https", () => {
    assert.equal(
      canonicalUrl("http://WWW.Example.cz/clanek/?utm_source=rss&id=5&fbclid=x#komentare"),
      "https://www.example.cz/clanek?id=5",
    );
  });
  it("stejný článek s různými sledovacími parametry má stejné ID", () => {
    assert.equal(urlId("https://example.cz/a?utm_medium=rss"), urlId("https://example.cz/a/"));
  });
  it("různé články mají různé ID", () => {
    assert.notEqual(urlId("https://example.cz/a"), urlId("https://example.cz/b"));
  });
});

describe("isDue", () => {
  it("nikdy nestažený zdroj je na řadě", () => {
    assert.equal(isDue(source, state(), now), true);
  });
  it("respektuje frekvenci zdroje", () => {
    assert.equal(isDue(source, state({ lastFetchedAt: "2026-10-30T11:45:00Z" }), now), false);
    assert.equal(isDue(source, state({ lastFetchedAt: "2026-10-30T11:30:00Z" }), now), true);
  });
  it("toleruje zpoždění scheduleru o minutu", () => {
    assert.equal(isDue(source, state({ lastFetchedAt: "2026-10-30T11:30:30Z" }), now), true);
  });
  it("po opakovaných chybách prodlužuje interval", () => {
    // 4 chyby -> backoff 4× -> 120 min
    const failing = state({ lastFetchedAt: "2026-10-30T11:00:00Z", consecutiveErrors: 4 });
    assert.equal(isDue(source, failing, now), false);
    assert.equal(isDue(source, { ...failing, lastFetchedAt: "2026-10-30T10:00:00Z" }, now), true);
  });
});

describe("selectNewDocuments", () => {
  it("přeskočí už viděné, duplicitní a staré položky", () => {
    const items = [
      item({ url: "https://example.cz/novy" }),
      item({ url: "https://example.cz/novy?utm_source=x" }), // duplicita v kanálu
      item({ url: "https://example.cz/videny" }),
      item({ url: "https://example.cz/stary", publishedAt: "2026-10-20T10:00:00Z" }),
      item({ url: "https://example.cz/bez-data", publishedAt: null }),
    ];
    const docs = selectNewDocuments(source, items, new Set([urlId("https://example.cz/videny")]), now);
    assert.deepEqual(
      docs.map((d) => d.url),
      ["https://example.cz/novy", "https://example.cz/bez-data"],
    );
  });
  it("ukládá jen šetrná pole a zkrátí dlouhý perex", () => {
    const [doc] = selectNewDocuments(source, [item({ summary: "slovo ".repeat(200) })], new Set(), now);
    assert.deepEqual(Object.keys(doc).sort(), [
      "fetchedAt",
      "id",
      "perex",
      "publishedAt",
      "sourceId",
      "status",
      "tier",
      "title",
      "url",
    ]);
    assert.ok(doc.perex.length <= 301, `perex má ${doc.perex.length} znaků`);
    assert.ok(doc.perex.endsWith("…"));
    assert.equal(doc.status, "pending");
  });
});
