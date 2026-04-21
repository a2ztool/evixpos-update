// ════════════════════════════════════════════════════════════════
// Service Worker: handles Web Push when app is closed/backgrounded
// ════════════════════════════════════════════════════════════════
// IMPORTANT: This SW only handles push events. It does NOT cache
// app assets (no offline mode), avoiding stale-content issues.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Push event — show OS notification
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    try { data = { title: "Notification", body: event.data?.text?.() || "" }; } catch {}
  }

  const title = data.title || "🔔 New Notification";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.notification_id ? `notif-${data.notification_id}` : `notif-${Date.now()}`,
    data: { url: data.url || "/dashboard", type: data.type, notification_id: data.notification_id },
    vibrate: [100, 50, 100],
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Click → focus existing tab or open new one
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/dashboard";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Try to focus an existing app window
      for (const client of clients) {
        if ("focus" in client) {
          client.postMessage({ type: "NOTIFICATION_CLICK", payload: event.notification.data });
          return client.focus();
        }
      }
      // Otherwise open a new one
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
