import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pauseState, pragueMidnight } from "./runtime.js";

describe("pragueMidnight", () => {
  it("v zimě je půlnoc v Praze 23:00 UTC předchozího dne", () => {
    assert.equal(pragueMidnight("2027-01-01")?.toISOString(), "2026-12-31T23:00:00.000Z");
  });
  it("v létě je půlnoc v Praze 22:00 UTC předchozího dne", () => {
    assert.equal(pragueMidnight("2027-07-01")?.toISOString(), "2027-06-30T22:00:00.000Z");
  });
  it("neplatné datum vrátí null", () => {
    assert.equal(pragueMidnight("1. 1. 2027"), null);
    assert.equal(pragueMidnight("2027-13-45"), null);
  });
});

describe("pauseState", () => {
  it("bez nastavení běží", () => {
    assert.deepEqual(pauseState(undefined, new Date()), { paused: false });
    assert.deepEqual(pauseState({ pausedUntil: "" }, new Date()), { paused: false });
  });
  it("před datem je pozastaveno, od půlnoci daného dne běží", () => {
    const cfg = { pausedUntil: "2027-01-01" };
    assert.deepEqual(pauseState(cfg, new Date("2026-12-31T22:59:00Z")), { paused: true, until: "2027-01-01" });
    assert.deepEqual(pauseState(cfg, new Date("2026-12-31T23:00:00Z")), { paused: false });
  });
  it("neplatné datum provoz nezastaví a nahlásí se", () => {
    assert.deepEqual(pauseState({ pausedUntil: "příští rok" }, new Date()), { paused: false, invalid: "příští rok" });
  });
});
