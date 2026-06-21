// ===================================================================
// IndexedDB persistence for artists & tracks
// ===================================================================
// Why IndexedDB: a single Beatport scrape produces ~3400 artists /
// ~3000 tracks totaling ~9MB. localStorage is capped at 5-10MB on
// most browsers, so we use IndexedDB (50-500MB typical quota).
//
// Schema (single object store "artists", keyPath "id"):
//   - one record per Artist (key = artist.id, e.g. "bp_6824")
//   - tracks are embedded inside the artist record (tracksByGenre)
//
// This is intentionally simple — no separate tracks store. Artists
// are the primary access pattern (browse, search, detail view).

const DB_NAME = "labelpulse-artists";
const DB_VERSION = 1;
const STORE_NAME = "artists";

let _dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

export async function saveArtistsToIDB(artists: any[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    // Clear and bulk-insert (simpler than per-record merge — we trust
    // the caller to have already merged correctly in-memory).
    store.clear();
    for (const artist of artists) {
      store.put(artist);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function loadArtistsFromIDB(): Promise<any[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function clearArtistsIDB(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getArtistsCountFromIDB(): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
