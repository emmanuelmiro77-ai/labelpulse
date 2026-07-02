/**
 * LabelPulse Service Worker v8 — Bulletproof Offline-First PWA + Web Push
 *
 * v6 (2026-06-25): removed skipWaiting() from install handler so the
 *   update flow is user-driven (banner → "Aggiorna" → SKIP_WAITING).
 *   This fixes the bug where the banner wouldn't go away because the
 *   new SW was already active and registration.waiting was null.
 *
 * Strategy: Cache-First for static assets, Network-First for HTML
 *
 * This ensures:
 * - The app loads INSTANTLY from cache (even offline)
 * - HTML is always fresh when online (updates detected immediately)
 * - If the server is down, the app still works 100% from cache
 * - Users get an update notification when a new version is available
 * - Web Push notifications work on iOS (Home Screen), Android, Desktop
 */

const CACHE_NAME = "labelpulse-v8";
const OFFLINE_URL = "/";

// Pre-cache essential assets on install
const PRECACHE_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/favicon-32.png",
  "/icons/apple-touch-icon.png",
];

// Install: cache critical assets.
// 🔒 FASE D FIX: skipWaiting() automatico per forzare aggiornamento su iPhone
// (Franco aveva cache v6 vecchia con bug cross-account, non vedeva il banner)
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Cache what we can, don't fail if some assets aren't available yet
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn("[SW] Some pre-cache assets failed:", err);
      });
    })
  );
  // 🔒 FASE D: skipWaiting automatico — forza l'aggiornamento immediato
  self.skipWaiting();
});

// Activate: clean old caches and claim all pages immediately
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log("[SW] Deleting old cache:", key);
            return caches.delete(key);
          })
      )
    ).then(() => {
      console.log("[SW] Claiming all clients");
      return self.clients.claim();
    })
  );
});

// Fetch: Smart routing based on request type
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Skip non-GET requests
  if (request.method !== "GET") return;

  // Skip API calls and external requests
  if (
    request.url.includes("/api/") ||
    request.url.includes("googleapis.com") ||
    !request.url.startsWith(self.location.origin)
  ) {
    return;
  }

  const url = new URL(request.url);

  // STRATEGY 1: Service Worker — always from network (never cache SW)
  if (url.pathname === "/sw.js") {
    event.respondWith(
      fetch(request).catch(() => new Response("", { status: 503 }))
    );
    return;
  }

  // STRATEGY 2: Navigation (HTML pages) — Network-First with instant cache fallback
  // This ensures users always get the latest HTML when online,
  // but the app still works when offline or server is down
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            // Cache the fresh HTML
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          // Network failed — serve from cache (app works offline!)
          return caches.match(request).then((cached) => {
            if (cached) return cached;
            // Ultimate fallback: serve the cached index.html
            return caches.match(OFFLINE_URL);
          });
        })
    );
    return;
  }

  // STRATEGY 3: Static assets (JS, CSS, images, fonts) — Cache-First
  // These are immutable (content-hashed filenames), so cache-first is safe
  // This makes the app load INSTANTLY on repeat visits
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.match(/\.(js|css|png|jpg|svg|ico|woff2?|ttf|eot|webp)$/)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          // Return cached version immediately (instant load!)
          // Also update cache in background for next time
          fetch(request).then((response) => {
            if (response.ok) {
              caches.open(CACHE_NAME).then((cache) => cache.put(request, response));
            }
          }).catch(() => {}); // Ignore background update failures
          return cached;
        }
        // Not in cache — fetch from network and cache
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        }).catch(() => new Response("Offline", { status: 503 }));
      })
    );
    return;
  }

  // STRATEGY 4: Other requests (manifest, etc.) — Network-First with cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => {
        return caches.match(request).then((cached) => {
          return cached || new Response("Offline", { status: 503 });
        });
      })
  );
});

// Handle messages from the app
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// =====================================================================
// WEB PUSH NOTIFICATIONS
// =====================================================================

// Handle incoming push events
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (err) {
    // Fallback: treat as plain text
    payload = { title: "LabelPulse", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "LabelPulse";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: payload.tag || "labelpulse-notification",
    renotify: true,
    data: {
      url: payload.url || "/",
    },
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      // Update badge count (iOS Safari 16.4+ supports this)
      navigator.setAppBadge ? navigator.setAppBadge(1).catch(() => {}) : Promise.resolve(),
    ])
  );
});

// Handle notification click — focus existing window or open new one
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    (async () => {
      // Clear badge on click
      if (navigator.clearAppBadge) {
        try { await navigator.clearAppBadge(); } catch {}
      }
      // Try to focus an existing window
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of allClients) {
        // If a window is already open at our origin, focus + navigate
        if (client.url.includes(self.location.origin)) {
          if ("focus" in client) {
            try { await client.focus(); } catch {}
          }
          if ("navigate" in client) {
            try { await client.navigate(targetUrl); } catch {}
          }
          return;
        }
      }
      // Otherwise open a new window
      if (self.clients.openWindow) {
        try { await self.clients.openWindow(targetUrl); } catch {}
      }
    })()
  );
});

// Handle notification close (optional: analytics)
self.addEventListener("notificationclose", (event) => {
  // No-op for now
});

