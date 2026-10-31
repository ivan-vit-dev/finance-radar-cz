import { deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { deleteToken, getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";
import { app, db } from "@/lib/firebase";

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

export type PushSupport = "supported" | "unsupported" | "missing-key";

export async function pushSupport(): Promise<PushSupport> {
  if (!VAPID_KEY) return "missing-key";
  return (await isSupported()) ? "supported" : "unsupported";
}

async function registerWorker(): Promise<ServiceWorkerRegistration> {
  const o = app.options;
  const qs = new URLSearchParams({
    apiKey: o.apiKey ?? "",
    projectId: o.projectId ?? "",
    messagingSenderId: o.messagingSenderId ?? "",
    appId: o.appId ?? "",
  });
  return navigator.serviceWorker.register(`/firebase-messaging-sw.js?${qs}`);
}

/** ID zařízení = hash tokenu, aby stejné zařízení nevzniklo dvakrát. */
async function deviceId(token: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(hash)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Vyžádá povolení, získá FCM token a uloží zařízení do `users/{uid}/devices`. */
export async function enablePush(uid: string): Promise<void> {
  if (!VAPID_KEY) throw new Error("Chybí klíč VAPID (NEXT_PUBLIC_FIREBASE_VAPID_KEY).");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifikace nejsou v prohlížeči povolené.");
  const registration = await registerWorker();
  const token = await getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
  await setDoc(doc(db, "users", uid, "devices", await deviceId(token)), {
    token,
    userAgent: navigator.userAgent.slice(0, 200),
    createdAt: serverTimestamp(),
  });
}

export async function disablePush(uid: string): Promise<void> {
  const registration = await registerWorker();
  const messaging = getMessaging(app);
  const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration }).catch(
    () => null,
  );
  if (token) {
    await deleteDoc(doc(db, "users", uid, "devices", await deviceId(token)));
    await deleteToken(messaging);
  }
}

/**
 * Když je aplikace otevřená, FCM doručí zprávu stránce a prohlížeč ji sám nezobrazí.
 * Ukážeme ji přes service worker, aby vypadala stejně jako na pozadí.
 */
export async function listenForegroundPush(): Promise<() => void> {
  if ((await pushSupport()) !== "supported" || Notification.permission !== "granted") return () => {};
  const registration = await registerWorker();
  return onMessage(getMessaging(app), (payload) => {
    const n = payload.notification;
    if (!n?.title) return;
    registration.showNotification(n.title, {
      body: n.body,
      icon: "/icon-192.png",
      tag: payload.data?.eventId,
      data: { link: payload.fcmOptions?.link ?? (payload.data?.eventId ? `/event/${payload.data.eventId}` : "/") },
    });
  });
}
