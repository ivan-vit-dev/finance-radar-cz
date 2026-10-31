/* global importScripts, firebase */
// Service worker pro push notifikace (FCM). Zobrazuje alerty i se zavřeným oknem aplikace.
// Konfiguraci Firebase dostává v query stringu při registraci (lib/push.ts), protože
// statické soubory v public/ nemají přístup k proměnným prostředí. Hodnoty jsou veřejné.
importScripts("https://www.gstatic.com/firebasejs/13.1.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/13.1.0/firebase-messaging-compat.js");

const params = new URL(self.location.href).searchParams;
firebase.initializeApp({
  apiKey: params.get("apiKey"),
  projectId: params.get("projectId"),
  messagingSenderId: params.get("messagingSenderId"),
  appId: params.get("appId"),
});

// Zprávy s polem `notification` zobrazí SDK samo; klik otevře odkaz z `fcmOptions.link`.
firebase.messaging();

// Notifikace zobrazené stránkou při otevřené aplikaci (lib/push.ts) nesou odkaz v data.link.
// Ty, které zobrazilo SDK (data.FCM_MSG), obsluhuje SDK samo.
self.addEventListener("notificationclick", (event) => {
  const data = event.notification.data || {};
  if (data.FCM_MSG || !data.link) return;
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => "focus" in w);
      if (open) return open.navigate(data.link).then((w) => w && w.focus());
      return self.clients.openWindow(data.link);
    }),
  );
});
