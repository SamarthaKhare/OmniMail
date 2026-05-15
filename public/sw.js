/* OmniMail service worker.
 *
 * Strategy:
 *   - App shell (/, /manifest.json, /icon-*): cache-first, fall back to network.
 *   - Same-origin static assets (/_next/static/*): cache-first.
 *   - API requests (/api/*): network-first with a 3s timeout and stale fallback.
 *   - Everything else: network-only.
 */

const VERSION = "v1";
const SHELL_CACHE = `omnimail-shell-${VERSION}`;
const RUNTIME_CACHE = `omnimail-runtime-${VERSION}`;

const SHELL_ASSETS = [
  "/",
  "/manifest.json",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL_ASSETS)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // API: network-first with stale fallback
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(req, RUNTIME_CACHE, 3000));
    return;
  }

  // Next static assets: cache-first
  if (url.pathname.startsWith("/_next/static/") || /\.(svg|png|jpg|webp|woff2?)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(req, RUNTIME_CACHE));
    return;
  }

  // App shell pages
  if (req.mode === "navigate" || SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith(cacheFirst(req, SHELL_CACHE));
    return;
  }
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) {
    // Refresh in background.
    fetch(req).then((res) => res && res.ok && cache.put(req, res.clone())).catch(() => {});
    return hit;
  }
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const fallback = await cache.match("/");
    return fallback ?? new Response("offline", { status: 503 });
  }
}

async function networkFirst(req, cacheName, timeoutMs) {
  const cache = await caches.open(cacheName);
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
    ]);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req);
    return hit ?? new Response(JSON.stringify({ error: "offline" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }
}
