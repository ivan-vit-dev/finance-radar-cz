import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { finalPhase, matchKeywords, phaseFromStateType, pspDate, selectLegislation, type PspData } from "./psp.js";

describe("matchKeywords", () => {
  it("najde oblasti podle názvu a vždy přidá legislativu", () => {
    const r = matchKeywords("Novela z. o spotřebitelském úvěru a z. o pojišťovnictví");
    assert.deepEqual(r.matched, ["úvěry", "pojištění"]);
    assert.deepEqual(r.categories, ["legislation", "consumer_loans", "insurance"]);
  });
  it("nerelevantní zákon nemá žádnou shodu", () => {
    assert.deepEqual(matchKeywords("Novela z. o podpoře sportu").matched, []);
    assert.deepEqual(matchKeywords("Novela z. o veřejném zdravotním pojištění").matched, []);
    assert.deepEqual(matchKeywords("Novela z. o Státním fondu dopravní infrastruktury").matched, []);
  });
  it("produktové pojištění a penze zůstávají", () => {
    assert.deepEqual(matchKeywords("Novela z. o distribuci pojištění a zajištění").matched, ["pojištění"]);
    assert.deepEqual(matchKeywords("Novela z. o důchodovém pojištění").matched, ["penze a spoření"]);
  });
});

describe("fáze", () => {
  it("převádí typ stavu Sněmovny na fázi", () => {
    assert.equal(phaseFromStateType(5), "snemovna"); // 3. čtení
    assert.equal(phaseFromStateType(12), "senat");
    assert.equal(phaseFromStateType(8), "prezident");
    assert.equal(phaseFromStateType(6), "ukonceno");
  });
  it("vyhlášený zákon je „účinné“ až od data účinnosti", () => {
    assert.equal(finalPhase("ukonceno", true, "2027-01-01", "2026-10-31"), "vyhlaseno");
    assert.equal(finalPhase("ukonceno", true, "2026-10-01", "2026-10-31"), "ucinne");
    assert.equal(finalPhase("ukonceno", true, undefined, "2026-10-31"), "vyhlaseno");
    assert.equal(finalPhase("senat", false, undefined, "2026-10-31"), "senat");
  });
  it("datumy psp.cz", () => {
    assert.equal(pspDate("22.10.2026"), "2026-10-22");
    assert.equal(pspDate("1.2.2026"), "2026-02-01");
    assert.equal(pspDate("2026-10-20 00:00"), "2026-10-20");
    assert.equal(pspDate(""), null);
  });
});

describe("selectLegislation", () => {
  // Řádky ve formátu tisky.unl / hist.unl (zkrácené na potřebné sloupce, ostatní prázdné).
  const tisk = (id: string, druh: string, stav: string, ct: string, obd: string, nazev: string, predlozeno: string) => {
    const r = Array(24).fill("");
    Object.assign(r, { 0: id, 1: druh, 2: stav, 3: ct, 7: obd, 9: "vláda", 10: nazev, 11: predlozeno });
    return r;
  };
  const hist = (tiskId: string, datum: string, publik = "", cislo = "") => {
    const r = Array(15).fill("");
    Object.assign(r, { 1: tiskId, 2: datum, 11: publik, 13: cislo });
    return r;
  };
  const data: PspData = {
    tisky: [
      tisk("1", "1", "20", "320", "174", "Novela z. o spotřebitelském úvěru", "25.09.2026"),
      tisk("2", "1", "21", "321", "174", "Novela z. o podpoře sportu", "29.09.2026"),
      tisk("3", "5", "21", "322", "174", "Zpráva o pojištění", "29.09.2026"), // není návrh zákona
      tisk("4", "1", "21", "900", "173", "Novela z. o daních z příjmů", "01.03.2025"), // minulé období, vyhlášeno
      tisk("5", "2", "21", "901", "173", "Novela z. o pojistné smlouvě", "01.03.2024"), // minulé období, nevyhlášeno
      tisk("6", "2", "21", "50", "442", "Návrh na úvěrovou pomoc", "01.05.1920"), // historické období s vyšším ID
    ],
    hist: [hist("1", "2026-10-20 00:00"), hist("4", "2025-06-10 00:00", "15.06.2025", "195")],
    stavy: new Map([
      [20, 12],
      [21, 6],
    ]),
    typy: new Map([
      [12, "Senát"],
      [6, "KONEC"],
    ]),
  };

  it("bere relevantní návrhy aktuálního období a vyhlášené z minulého", () => {
    const out = selectLegislation(data, new Date("2026-10-31T12:00:00Z"));
    assert.deepEqual(
      out.map((x) => x.id),
      ["1", "4"],
    );
    const [a, b] = out;
    assert.equal(a.phase, "senat");
    assert.equal(a.term, 10);
    assert.equal(a.url, "https://www.psp.cz/sqw/historie.sqw?o=10&t=320");
    assert.equal(a.lastStepAt, "2026-10-20");
    assert.deepEqual(b.sbirka, { cislo: 195, rok: 2025, publishedAt: "2025-06-15" });
  });
});
