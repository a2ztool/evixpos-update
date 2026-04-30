// ════════════════════════════════════════════════════════════════
// Service Worker: Web Push + version-aware lifecycle + offline shell
// ════════════════════════════════════════════════════════════════
// HTML/JS/CSS use a NETWORK-FIRST strategy so users always get the
// freshest build when online. When offline, navigations fall back
// to a cached /offline.html shell. Static icons are precached so
// the offline page renders correctly.
//
// Bump SW_VERSION whenever you want to force all installed PWAs to
// pick up the new service worker. Any byte change to this file also
// triggers the browser's update check automatically.

const SW_VERSION = "v6-2026-04-30-offline-shell";
const CACHE_NAME = `evixpos-shell-${SW_VERSION}`;
const PRECACHE_URLS = [
  "/offline.html",
  "/manifest.json",
  "/favicon.png",
  "/pwa-icon-192.png",
  "/pwa-icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  // Activate this SW immediately, replacing any waiting one
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(PRECACHE_URLS);
      } catch (e) {
        // Non-fatal: install still succeeds
      }
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Take control of all open clients right away
      await self.clients.claim();
      // Clean up legacy caches from earlier SW versions, keep current
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
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

// ════════════════════════════════════════════════════════════════
// Fetch: network-first for navigations, fall back to /offline.html
// Precached static icons served cache-first so offline page renders.
// All other requests pass through to the network untouched.
// ════════════════════════════════════════════════════════════════
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Never intercept Supabase, edge functions, or hashed Vite assets — let them go to network
  if (url.pathname.startsWith("/sw.js") || url.pathname.startsWith("/api/")) return;

  // 1) Navigation requests → network-first, fall back to offline shell
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          return fresh;
        } catch {
          const cache = await caches.open(CACHE_NAME);
          const offline = await cache.match("/offline.html");
          return offline || new Response("Offline", { status: 503, statusText: "Offline" });
        }
      })()
    );
    return;
  }

  // 2) Precached static assets (icons, manifest) → cache-first
  if (PRECACHE_URLS.includes(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const fresh = await fetch(req);
          if (fresh.ok) cache.put(req, fresh.clone());
          return fresh;
        } catch {
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  // 3) Everything else → straight to network (no caching)
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
