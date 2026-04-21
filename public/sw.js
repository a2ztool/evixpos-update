// ════════════════════════════════════════════════════════════════
// Service Worker: handles Web Push + version-aware lifecycle
// ════════════════════════════════════════════════════════════════
// IMPORTANT: This SW does NOT cache app HTML/JS/CSS. Vite already
// hashes static assets, and HTML is fetched network-first by the
// browser (no SW fetch handler). This avoids stale-content issues.
//
// Bump SW_VERSION whenever you want to force all installed PWAs to
// pick up the new service worker. Any byte change to this file also
// triggers the browser's update check automatically.

const SW_VERSION = "v3-2026-04-21";

self.addEventListener("install", (event) => {
  // Activate this SW immediately, replacing any waiting one
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Take control of all open clients right away
      await self.clients.claim();
      // Clean up any legacy caches from earlier versions
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
      // Notify open pages that a new SW is now active
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      clients.forEach((c) => c.postMessage({ type: "SW_ACTIVATED", version: SW_VERSION }));
    })()
  );
});

// Allow page to ask SW to skip waiting on demand
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  } else if (event.data?.type === "GET_VERSION") {
    event.ports[0]?.postMessage({ version: SW_VERSION });
  }
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
      for (const client of clients) {
        if ("focus" in client) {
          client.postMessage({ type: "NOTIFICATION_CLICK", payload: event.notification.data });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
