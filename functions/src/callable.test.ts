import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import { assertAdmin, handleAnalyzeEvent } from "./callable.js";

/** Minimální náhrada Firestore pro kontroly oprávnění (bez emulátoru). */
function fakeDb(admins: string[]): Firestore {
  return {
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => ({ exists: name === "admins" && admins.includes(id), data: () => undefined }),
      }),
    }),
  } as unknown as Firestore;
}

describe("analyzeEvent – oprávnění a vstup", () => {
  it("odmítne nepřihlášeného", async () => {
    await assert.rejects(assertAdmin(fakeDb([]), undefined), { code: "unauthenticated" });
  });
  it("odmítne přihlášeného, který není v admins", async () => {
    await assert.rejects(assertAdmin(fakeDb(["owner"]), "stranger"), { code: "permission-denied" });
  });
  it("pustí admina", async () => {
    await assert.doesNotReject(assertAdmin(fakeDb(["owner"]), "owner"));
  });
  it("odmítne neplatné ID události dřív, než sáhne na data nebo AI", async () => {
    await assert.rejects(handleAnalyzeEvent(fakeDb(["owner"]), "owner", "../admins/x"), { code: "invalid-argument" });
    await assert.rejects(handleAnalyzeEvent(fakeDb(["owner"]), "owner", 42), { code: "invalid-argument" });
  });
});
