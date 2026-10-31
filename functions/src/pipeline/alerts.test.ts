import { alertMatches, DEFAULT_ALERT_RULES, type AlertRules } from "@finance-radar/shared";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const rules = (over: Partial<AlertRules> = {}): AlertRules => ({ ...DEFAULT_ALERT_RULES, ...over });

describe("alertMatches", () => {
  it("výchozí pravidla: skóre od 80 v jakékoli oblasti", () => {
    assert.equal(alertMatches(rules(), { finalScore: 85, categories: ["mortgages"], bestTier: 3 }), true);
    assert.equal(alertMatches(rules(), { finalScore: 70, categories: ["mortgages"], bestTier: 3 }), false);
  });
  it("„cokoli z ČNB“ platí jen pro primární zdroj", () => {
    assert.equal(alertMatches(rules(), { finalScore: 20, categories: ["cnb"], bestTier: 1 }), true);
    assert.equal(alertMatches(rules(), { finalScore: 20, categories: ["cnb"], bestTier: 3 }), false);
    assert.equal(alertMatches(rules({ anyCnb: false }), { finalScore: 20, categories: ["cnb"], bestTier: 1 }), false);
  });
  it("omezení na oblasti", () => {
    const r = rules({ categories: ["mortgages", "legislation"], anyCnb: false });
    assert.equal(alertMatches(r, { finalScore: 90, categories: ["economy"], bestTier: 3 }), false);
    assert.equal(alertMatches(r, { finalScore: 90, categories: ["economy", "legislation"], bestTier: 3 }), true);
  });
  it("vypnuté alerty nepošlou nic", () => {
    assert.equal(alertMatches(rules({ enabled: false }), { finalScore: 99, categories: ["cnb"], bestTier: 1 }), false);
  });
});
