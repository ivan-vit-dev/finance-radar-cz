import {
  alertMatches,
  DEFAULT_ALERT_RULES,
  PRIORITY_LABELS,
  type AlertRules,
  type MarketEvent,
} from "@finance-radar/shared";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

export interface AlertResult {
  sent: number;
  failed: number;
  removedTokens: number;
}

/** Chyby FCM, po kterých je token neplatný a zařízení se smaže. */
const DEAD_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

/**
 * Pošle push notifikace na nové nebo změněné události podle pravidel uživatelů.
 * Každý uživatel dostane na jednu událost nejvýš jeden alert (`alertedUsers` v události).
 * `appUrl` je adresa webu (odkaz v notifikaci), např. https://finance-radar-cz.vercel.app.
 */
export async function sendAlerts(db: Firestore, events: MarketEvent[], appUrl: string): Promise<AlertResult> {
  const result: AlertResult = { sent: 0, failed: 0, removedTokens: 0 };
  if (events.length === 0) return result;

  const users = await db.collection("users").get();
  for (const user of users.docs) {
    const rules: AlertRules = { ...DEFAULT_ALERT_RULES, ...(user.data().alertRules as Partial<AlertRules> | undefined) };
    const due = events.filter((e) => alertMatches(rules, e) && !e.alertedUsers?.[user.id]);
    if (due.length === 0) continue;

    // Páry dokument–token, aby se při chybě smazalo správné zařízení.
    const devices = (await user.ref.collection("devices").get()).docs
      .map((d) => ({ ref: d.ref, token: d.data().token as string | undefined }))
      .filter((d): d is { ref: typeof d.ref; token: string } => !!d.token);
    if (devices.length === 0) continue;

    for (const e of due) {
      const res = await getMessaging().sendEachForMulticast({
        tokens: devices.map((d) => d.token),
        notification: {
          title: `${e.priority === "critical" ? "🔴" : e.priority === "high" ? "🟠" : "🟡"} ${e.title}`,
          body: `${PRIORITY_LABELS[e.priority]} · skóre ${e.finalScore}. ${e.summary}`.slice(0, 240),
        },
        webpush: {
          notification: { tag: e.id, ...(appUrl ? { icon: `${appUrl}/icon-192.png` } : {}) },
          ...(appUrl ? { fcmOptions: { link: `${appUrl}/event/${e.id}` } } : {}),
        },
        data: { eventId: e.id },
      });
      result.sent += res.successCount;
      result.failed += res.failureCount;

      // Neplatné tokeny (odinstalovaná aplikace, zrušené povolení) se uklidí.
      await Promise.all(
        res.responses.map(async (r, i) => {
          if (r.success || !DEAD_TOKEN_CODES.has(r.error?.code ?? "")) return;
          result.removedTokens++;
          await devices[i].ref.delete();
        }),
      );
      await db
        .collection("events")
        .doc(e.id)
        .update({ [`alertedUsers.${user.id}`]: FieldValue.serverTimestamp() });
    }
  }
  return result;
}
