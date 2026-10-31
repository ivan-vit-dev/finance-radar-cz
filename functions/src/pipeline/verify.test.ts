import type { EventFact } from "@finance-radar/shared";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeCategories } from "../ai/classify.js";
import { checkFacts, mergeFacts, scoreEvent, verificationOf } from "./verify.js";

describe("normalizeCategories", () => {
  it("ponechá jen známé kategorie bez duplicit", () => {
    assert.deepEqual(normalizeCategories(["Mortgages", "cnb", "pensions", "cnb", " economy "]), [
      "mortgages",
      "cnb",
      "economy",
    ]);
  });
});

const fact = (over: Partial<EventFact>): EventFact => ({ t: "fact", s: "Tvrzení", q: "citace", doc: "d1", ...over });

const indicators = {
  repo_rate: [
    { p: "2026-03-26", v: 3.5 },
    { p: "2026-06-19", v: 3.75 },
  ],
  inflation: [
    { p: "2026-06", v: 1.5 },
    { p: "2026-09", v: 2.5 },
  ],
};

describe("checkFacts", () => {
  it("repo sazba: porovná s hodnotou platnou k datu (skoková řada)", () => {
    const [ok, old, bad] = checkFacts(
      [
        fact({ sub: "repo_rate", v: 3.75, per: "2026-08-07" }),
        fact({ sub: "repo_rate", v: 3.5, per: "2026-05" }),
        fact({ sub: "repo_rate", v: 4, per: "2026-08-07" }),
      ],
      indicators,
    );
    assert.equal(ok.chk, "ok");
    assert.equal(old.chk, "ok");
    assert.equal(bad.chk, "conflict");
  });

  it("inflace: porovná stejný měsíc s tolerancí", () => {
    const [ok, bad] = checkFacts(
      [fact({ sub: "cpi_inflation_yoy", v: 1.5, per: "2026-06" }), fact({ sub: "cpi_inflation_yoy", v: 1.9, per: "2026-06" })],
      indicators,
    );
    assert.equal(ok.chk, "ok");
    assert.equal(bad.chk, "conflict");
  });

  it("neověřuje odhady, fakta bez období a neporovnatelné ukazatele", () => {
    const out = checkFacts(
      [
        fact({ t: "forecast", sub: "cpi_inflation_yoy", v: 3, per: "2027-Q1" }),
        fact({ sub: "cpi_inflation_yoy", v: 2.5 }),
        fact({ sub: "mortgage_rate_avg", v: 4.9, per: "2026-09" }),
        fact({ sub: "cpi_inflation_yoy", v: 2.2, per: "2026-07" }), // měsíc, který v datech není
      ],
      indicators,
    );
    assert.ok(out.every((f) => f.chk === undefined));
  });
});

describe("verificationOf", () => {
  it("rozpor má přednost, pak primární zdroj, pak více zdrojů", () => {
    assert.equal(verificationOf([fact({ chk: "conflict" })], 1, 3), "conflict");
    assert.equal(verificationOf([], 1, 1), "verified_primary");
    assert.equal(verificationOf([], 3, 2), "confirmed_multiple");
    assert.equal(verificationOf([], 3, 1), "secondary");
    assert.equal(verificationOf([], 4, 1), "pending");
  });
});

describe("scoreEvent", () => {
  it("bere maximum dílčích skóre a důvěryhodnost z ověření", () => {
    const r = scoreEvent(
      [
        { relevance: 90, advisorImpact: 60, marketImpact: 80, urgency: 40 },
        { relevance: 70, advisorImpact: 95, marketImpact: 50, urgency: 75 },
      ],
      "verified_primary",
    );
    assert.deepEqual(r.scores, { relevance: 90, advisorImpact: 95, marketImpact: 80, urgency: 75, confidence: 95 });
    // 0,35·95 + 0,25·80 + 0,2·75 + 0,1·90 + 0,1·95 = 86,75
    assert.equal(r.finalScore, 87);
    assert.equal(r.priority, "high");
  });
});

describe("mergeFacts", () => {
  it("vynechá stejné tvrzení (bez ohledu na interpunkci) a dodrží limit", () => {
    const merged = mergeFacts(
      [fact({ s: "ČNB ponechala sazby." })],
      [fact({ s: "ČNB ponechala sazby" }), fact({ s: "Inflace je 2,5 %" }), fact({ s: "Třetí" })],
      2,
    );
    assert.deepEqual(
      merged.map((f) => f.s),
      ["ČNB ponechala sazby.", "Inflace je 2,5 %"],
    );
  });
});
