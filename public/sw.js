/**
 * Project 365 service worker — offline resilience for the gym floor.
 *
 * Strategy:
 * - Navigations: network-first, falling back to the last good copy of
 *   that page. Training in a basement still opens today's session.
 * - Static assets (/_next/static, icons): cache-first, they're
 *   content-hashed and immutable.
 * - Everything else (server actions, API routes): straight to network,
 *   never cached — writes must not be replayed by the cache layer. The
 *   app queues failed writes itself (src/lib/offline-queue.ts).
 */

const VERSION = "v3";
const PAGE_CACHE = `p365-pages-${VERSION}`;
const ASSET_CACHE = `p365-assets-${VERSION}`;
const OFFLINE_URLS = ["/", "/workout", "/progress"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PAGE_CACHE);
      // Best-effort: a cold install shouldn't fail because one page 401s.
      await Promise.allSettled(OFFLINE_URLS.map((url) => cache.add(url)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== PAGE_CACHE && key !== ASSET_CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icon") ||
    // Exercise photos: immutable, and wanted most where signal is worst.
    url.pathname.startsWith("/exercises/") ||
    url.pathname === "/apple-touch-icon.png" ||
    url.pathname === "/favicon.ico"
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(ASSET_CACHE);
          cache.put(request, response.clone());
        }
        return response;
      })(),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          // Only cache real pages — not the /unlock redirect.
          if (response.ok && response.type === "basic") {
            const cache = await caches.open(PAGE_CACHE);
            cache.put(request, response.clone());
          }
          return response;
        } catch {
          const cached =
            (await caches.match(request)) ??
            (await caches.match(new URL(url.pathname, self.location.origin)));
          if (cached) return cached;
          return new Response(
            `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
             <title>Offline · Project 365</title>
             <body style="font-family:system-ui;background:#0a0a0a;color:#ededed;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px;text-align:center">
             <div><p style="font-size:15px;line-height:1.5">You're offline and this page hasn't been opened before.</p>
             <p style="font-size:14px;color:#a1a1a1;line-height:1.5">Anything you log will save when you're back on signal.</p></div>`,
            { headers: { "Content-Type": "text/html; charset=utf-8" } },
          );
        }
      })(),
    );
  }
});

/**
 * Morning reminder (Phase 9). iOS requires every push to show a
 * notification, so there is no silent path here.
 */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Project 365", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: "morning",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
