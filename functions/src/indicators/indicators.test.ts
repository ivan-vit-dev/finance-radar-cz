import { computeIndicatorStats, type IndicatorPoint } from "@finance-radar/shared";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { INDICATORS } from "./definitions.js";
import { isIndicatorDue, mergePoints, type IndicatorDoc } from "./update.js";

const monthly = (values: number[], start = 2025): IndicatorPoint[] =>
  values.map((v, i) => ({ p: `${start + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`, v }));

describe("computeIndicatorStats", () => {
  it("počítá změnu v p. b. proti předchozímu měsíci a proti roku zpět", () => {
    // 2025-01 … 2026-09 = 21 bodů
    const pts = monthly([...Array(20).fill(4.5), 5.05]);
    pts[pts.length - 2] = { ...pts[pts.length - 2], v: 4.94 }; // srpen 2026
    pts[8] = { ...pts[8], v: 4.6 }; // září 2025
    const s = computeIndicatorStats(pts, "pb", 3, 0.1)!;
    assert.equal(s.latest.p, "2026-09");
    assert.equal(s.change, 0.11);
    assert.equal(s.changeYoY, 0.45);
    assert.equal(s.max.v, 5.05);
    assert.equal(s.trend, "up");
  });

  it("počítá relativní změnu v % a trend „flat“ pod prahem", () => {
    const s = computeIndicatorStats(
      [
        { p: "2026-10-29", v: 24.3 },
        { p: "2026-10-30", v: 24.36 },
      ],
      "pct",
      20,
      0.5,
    )!;
    assert.equal(s.change, 0.2469);
    assert.equal(s.changeYoY, undefined); // denní řada nemá meziroční srovnání
    assert.equal(s.trend, "flat");
  });

  it("jeden bod: bez změny, trend flat; prázdná řada: null", () => {
    const s = computeIndicatorStats([{ p: "2026-06-19", v: 3.75 }], "pb", 1, 0.01)!;
    assert.equal(s.change, undefined);
    assert.equal(s.trend, "flat");
    // Žádné klíče s hodnotou undefined – Firestore by zápis odmítl.
    assert.ok(Object.values(s).every((v) => v !== undefined));
    assert.ok(!("previous" in s) && !("changeYoY" in s));
    assert.equal(computeIndicatorStats([], "pb", 1, 0.01), null);
  });
});

describe("mergePoints", () => {
  it("sloučí podle období, nová hodnota přepíše revizi, seřadí a ořízne", () => {
    const merged = mergePoints(
      [
        { p: "2026-10-28", v: 24.2 },
        { p: "2026-10-29", v: 24.3 },
      ],
      [
        { p: "2026-10-29", v: 24.31 },
        { p: "2026-10-30", v: 24.36 },
      ],
      2,
    );
    assert.deepEqual(merged, [
      { p: "2026-10-29", v: 24.31 },
      { p: "2026-10-30", v: 24.36 },
    ]);
  });
});

describe("isIndicatorDue", () => {
  const def = INDICATORS.find((d) => d.id === "mortgage_rate")!; // každých 12 h
  const now = new Date("2026-10-31T12:00:00Z");
  const doc = (over: Partial<IndicatorDoc>): IndicatorDoc => ({
    id: def.id,
    label: def.label,
    unit: def.unit,
    decimals: def.decimals,
    source: def.source,
    points: [],
    stats: null,
    consecutiveErrors: 0,
    ...over,
  });

  it("nikdy nekontrolovaný ukazatel je na řadě", () => {
    assert.equal(isIndicatorDue(def, undefined, now), true);
  });
  it("respektuje interval kontroly", () => {
    assert.equal(isIndicatorDue(def, doc({ lastCheckedAt: "2026-10-31T06:00:00Z" }), now), false);
    assert.equal(isIndicatorDue(def, doc({ lastCheckedAt: "2026-10-31T00:00:00Z" }), now), true);
  });
  it("po chybě zkusí znovu nejpozději za hodinu", () => {
    assert.equal(isIndicatorDue(def, doc({ lastCheckedAt: "2026-10-31T10:59:00Z", consecutiveErrors: 1 }), now), true);
  });
});
