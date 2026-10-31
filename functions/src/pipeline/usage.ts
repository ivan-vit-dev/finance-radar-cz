import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type { CallCost } from "../ai/claude.js";

/**
 * Denní limit nákladů na automatickou AI vrstvu (USD). Při běžném provozu je spotřeba
 * kolem $0,05–0,10 denně; limit chrání před chybou ve smyčce nebo zahlcením zdroje.
 */
export const DAILY_AI_LIMIT_USD = 1;

/** Pražské datum YYYY-MM-DD – den pro účtování. */
export function pragueDate(now: Date): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(now);
}

/** Šetrný audit: jeden dokument `aiUsage/{den}` se součty, ne dokument na každé volání. */
export async function recordUsage(db: Firestore, now: Date, costs: CallCost[]): Promise<void> {
  if (costs.length === 0) return;
  const byModel: Record<string, FieldValue> = {};
  for (const c of costs) {
    byModel[c.model] = FieldValue.increment(costs.filter((x) => x.model === c.model).reduce((s, x) => s + x.usd, 0));
  }
  await db
    .collection("aiUsage")
    .doc(pragueDate(now))
    .set(
      {
        usd: FieldValue.increment(costs.reduce((s, c) => s + c.usd, 0)),
        calls: FieldValue.increment(costs.length),
        inputTokens: FieldValue.increment(costs.reduce((s, c) => s + c.inputTokens + c.cacheReadTokens + c.cacheWriteTokens, 0)),
        outputTokens: FieldValue.increment(costs.reduce((s, c) => s + c.outputTokens, 0)),
        byModel,
        updatedAt: now.toISOString(),
      },
      { merge: true },
    );
}

export async function spentToday(db: Firestore, now: Date): Promise<number> {
  const snap = await db.collection("aiUsage").doc(pragueDate(now)).get();
  return (snap.data()?.usd as number | undefined) ?? 0;
}
