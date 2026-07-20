// =================================================================
// Classroom Service Worker
// Caches the app shell (HTML/CSS/JS) so the app can open offline.
//
// IMPORTANT: navigations use a NETWORK-FIRST strategy — an online
// user always gets the freshest page, and the cache is only used as
// a fallback when there's no connection. This avoids ever serving a
// stale or broken cached page to someone who's actually online.
// =================================================================

const CACHE_NAME = "classroom-shell-v13";

// Finds where sw.js is served from (e.g. '/' or '/classroom-app/')
// so every cached URL resolves correctly regardless of subfolder.
const BASE_PATH = self.location.pathname.substring(0, self.location.pathname.lastIndexOf('/') + 1);

const SHELL_FILES = [
  "index.html",
  "classroom-dashboard.html",
  "classroom-admin.html",
  "subject.html",
  "test-select.html",
  "notes.html",
  "quiz.html",
  "upgrade.html",
  "study-plan.html",
  "login.html",
  "signup.html",
  "admin-login.html",
  "offline.html",
  "privacy-policy.html",
  "terms.html",
  "supabase-client.js",
  "offline-store.js",
  "manifest.json",
  "icon.svg"
].map(file => `${BASE_PATH}${file}`);

// ---- INSTALL ----
// Fetches each shell file individually (not cache.addAll, which is
// all-or-nothing) so one bad file can't break the whole install.
// Any response that came through a redirect is rebuilt into a plain
// Response before storing — Chrome refuses to use a *redirected*
// cached Response to answer a page navigation and throws ERR_FAILED,
// which is what was breaking every page load until a hard refresh.
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(SHELL_FILES.map(async (url) => {
      try {
        const response = await fetch(url, { cache: "reload" });
        if (!response.ok) return;
        const safe = response.redirected
          ? new Response(await response.blob(), {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers
            })
          : response;
        await cache.put(url, safe);
      } catch (err) {
        console.warn("[sw] precache skipped:", url, err);
      }
    }));
    self.skipWaiting();
  })());
});

// ---- ACTIVATE ----
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// ---- FETCH ----
self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  // Never intercept cross-origin requests (Supabase API, the
  // supabase-js CDN script, fonts, etc.) — let the browser handle
  // those exactly as it normally would.
  if (new URL(request.url).origin !== self.location.origin) return;

  // Page navigations: network-first.
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        if (fresh.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, fresh.clone()).catch(() => {});
        }
        return fresh;
      } catch (err) {
        const cached = await caches.match(request);
        if (cached) return cached;
        const offline = await caches.match(`${BASE_PATH}offline.html`);
        return offline || new Response(
          "<!DOCTYPE html><html><head><meta charset='UTF-8'><title>Offline</title>" +
          "<style>body{background:#2d2d2d;color:#f4f2ee;font-family:sans-serif;text-align:center;padding:50px;}</style>" +
          "</head><body><h1>You're offline</h1><p>Please check your connection and try again.</p></body></html>",
          { status: 200, headers: { "Content-Type": "text/html" } }
        );
      }
    })());
    return;
  }

  // Everything else (CSS/JS/icons): cache-first, network fallback.
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    } catch (err) {
      return new Response("Offline", { status: 408, headers: { "Content-Type": "text/plain" } });
    }
  })());
});
