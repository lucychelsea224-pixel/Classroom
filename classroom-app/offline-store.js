// =================================================================
// Local offline cache for notes and questions, backed by IndexedDB.
// Data is written here whenever a Supabase fetch succeeds, and read
// from here whenever the app is offline or a fetch fails.
// =================================================================

const OFFLINE_DB_NAME = "classroom-offline";
const OFFLINE_DB_VERSION = 2;

function openOfflineDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("notesCache")) {
        db.createObjectStore("notesCache", { keyPath: "subjectId" });
      }
      if (!db.objectStoreNames.contains("questionsCache")) {
        db.createObjectStore("questionsCache", { keyPath: "subjectId" });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putMeta(key, value) {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("meta", "readwrite");
    tx.objectStore("meta").put({ key, value, cachedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getMeta(key) {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("meta", "readonly");
    const req = tx.objectStore("meta").get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : null);
    req.onerror = () => reject(req.error);
  });
}

async function putCache(storeName, subjectId, items) {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put({ subjectId, items, cachedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getCache(storeName, subjectId) {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).get(subjectId);
    req.onsuccess = () => resolve(req.result ? req.result.items : []);
    req.onerror = () => reject(req.error);
  });
}

window.offlineStore = {
  cacheNotes: (subjectId, items) => putCache("notesCache", subjectId, items),
  getNotes: (subjectId) => getCache("notesCache", subjectId),
  cacheQuestions: (subjectId, items) => putCache("questionsCache", subjectId, items),
  getQuestions: (subjectId) => getCache("questionsCache", subjectId),
  setMeta: (key, value) => putMeta(key, value),
  getMeta: (key) => getMeta(key)
};

// Registers the service worker. Call this from every page.
function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch((err) => {
        console.error("Service worker registration failed:", err);
      });
    });
  }
}
