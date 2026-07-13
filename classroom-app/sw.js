// =================================================================
// Classroom service worker
// Caches the app shell (HTML/CSS/JS) so the app can OPEN offline.
// It never caches Supabase requests — those always need a real
// network round trip since they're live data, not static assets.
// =================================================================

const CACHE_NAME = "classroom-shell-v2";

const SHELL_FILES = [
  "classroom-dashboard.html",
  "classroom-admin.html",
  "subject.html",
  "notes.html",
  "quiz.html",
  "login.html",
  "signup.html",
  "admin-login.html",
  "offline.html",
  "supabase-client.js",
  "offline-store.js",
  "manifest.json",
  "icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GETs — never intercept Supabase writes (POST/PATCH/DELETE)
  if (request.method !== "GET") return;

  // Live data always goes straight to the network, never the cache
  if (request.url.includes("supabase.co")) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          if (response.ok && request.url.startsWith(self.location.origin)) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          // No cache, no network — show the offline fallback for page loads
          if (request.mode === "navigate") return caches.match("offline.html");
        });
    })
  );
});
