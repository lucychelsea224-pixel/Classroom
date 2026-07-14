// =================================================================
// Classroom Service Worker
// Caches the app shell (HTML/CSS/JS) so the app can OPEN offline.
// Automatically adapts to subfolders & handles network failures gracefully.
// =================================================================

// 1. INCREMENT THIS VERSION whenever you make updates to your app.
// The code below will automatically trigger a clean, silent browser reload for the end-user!
const CACHE_NAME = "classroom-shell-v5";

// 2. DYNAMIC PATH RESOLUTION
// This finds where sw.js is (e.g. '/' or '/classroom-app/') so paths never break.
const BASE_PATH = self.location.pathname.substring(0, self.location.pathname.lastIndexOf('/') + 1);

const SHELL_FILES = [
  "index.html",
  "classroom-dashboard.html",
  "classroom-admin.html",
  "subject.html",
  "test-select.html",
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
].map(file => `${BASE_PATH}${file}`); // Dynamically prefixes assets with the correct directory path

// 3. INSTALL EVENT
// Downloads all shell files and forces the worker to activate immediately.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

// 4. ACTIVATE EVENT
// Clears out any old caches and claims control over all active browser tabs instantly.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// 5. FETCH EVENT
// Smart caching logic with safe fallbacks that prevent ERR_FAILED crashes.
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GETs — never intercept Supabase writes (POST/PATCH/DELETE)
  if (request.method !== "GET") return;

  // Live data always goes straight to the network, never the cache
  if (request.url.includes("supabase.co")) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      // Return the cached file instantly if we have it
      if (cached) return cached;

      // Otherwise, fetch it from the network
      return fetch(request)
        .then((response) => {
          // Dynamic safety check: Only cache valid local page resources
          if (response.ok && request.url.startsWith(self.location.origin)) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          // --- BULLETPROOF OFFLINE FALLBACKS ---
          
          // Case A: User is trying to load a page, send them to the offline page
          if (request.mode === "navigate") {
            return caches.match(`${BASE_PATH}offline.html`);
          }

          // Case B: Static asset (image/CSS/JS) is missing offline, return a clean 408
          // instead of a raw connection failure (this stops ERR_FAILED completely)
          return new Response("Network offline or asset missing.", {
            status: 408,
            headers: { "Content-Type": "text/plain" }
          });
        });
    })
  );
});