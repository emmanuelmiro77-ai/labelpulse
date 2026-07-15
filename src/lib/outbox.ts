"use client";

/**
 * 🔒 OUTBOX — coda di scrittura persistente e affidabile verso Supabase.
 *
 * PROBLEMA RISOLTO:
 * Prima, ogni scrittura verso /api/demos, /api/label-data, /api/pitches,
 * /api/profile, /api/releases era "fire and forget": se falliva (rete
 * assente, telefono che va in background, tab chiusa troppo presto,
 * Vercel momentaneamente giù), l'errore veniva solo loggato in console
 * e la modifica restava SOLO in locale. Al login da un altro dispositivo,
 * loadFromNewTables() sovrascrive lo stato locale con quello del cloud
 * (giustamente, per REGOLA ZERO) — ma se quella scrittura non è mai
 * arrivata al cloud, la modifica sparisce per sempre.
 *
 * SOLUZIONE:
 * Ogni scrittura passa da qui. Se il fetch va a buon fine, fine.
 * Se fallisce, l'operazione viene salvata in IndexedDB (sopravvive a
 * refresh, chiusura tab, perdita di rete) e viene ritentata automaticamente:
 *   - subito quando torna la connessione (evento "online")
 *   - quando la tab torna visibile (evento "visibilitychange")
 *   - ogni 15 secondi finché la coda non è vuota
 *   - al prossimo avvio dell'app (flushOutbox viene chiamato al boot)
 *
 * Le operazioni sulla STESSA risorsa vengono processate in ordine di
 * creazione (FIFO), quindi una PATCH non può mai "sorpassare" la POST
 * che crea la riga.
 *
 * 🔒 FIX 2026-07-07: Migrato da localStorage a IndexedDB (idb-keyval).
 * Motivo: localStorage ha un limite di 5MB su iOS → QuotaExceededError
 * quando la coda cresce. IndexedDB ha 50MB+ e non ha questo problema.
 * Inoltre, localStorage è sincrono e blocca il thread principale.
 */

import { get as idbGet, set as idbSet } from "idb-keyval";

export interface OutboxOp {
  opId: string;
  url: string;
  method: "POST" | "PATCH" | "DELETE";
  body: any;
  createdAt: number;
  attempts: number;
  label: string; // descrizione leggibile per debug/UI, es. "demo:create:abc123"
}

const STORAGE_KEY = "labelpulse-outbox-v2";
const LEGACY_STORAGE_KEY = "labelpulse-outbox-v1"; // localStorage legacy per migrazione
const MAX_ATTEMPTS = 50; // ~ ore di retry a backoff crescente, non abbandoniamo mai i dati dell'utente
const FLUSH_INTERVAL_MS = 15000;

type Listener = (pending: number) => void;
const listeners = new Set<Listener>();

function notify(pending: number) {
  for (const l of listeners) {
    try { l(pending); } catch { /* ignore */ }
  }
}

export function onOutboxChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Cache in memoria per evitare letture IDB sincrone ad ogni getPendingCount
let _memQueue: OutboxOp[] | null = null;
let _legacyMigrated = false;

/**
 * Legge la coda da IndexedDB. Al primo avvio, migra la vecchia coda
 * da localStorage (v1) se presente.
 */
async function readQueueAsync(): Promise<OutboxOp[]> {
  if (typeof window === "undefined") return [];

  // Migrazione one-shot dalla vecchia coda localStorage
  if (!_legacyMigrated) {
    _legacyMigrated = true;
    try {
      const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacyRaw) {
        const legacyParsed = JSON.parse(legacyRaw);
        if (Array.isArray(legacyParsed) && legacyParsed.length > 0) {
          console.log(`[outbox] Migrating ${legacyParsed.length} ops from localStorage v1 → IndexedDB v2`);
          const existing = (await idbGet(STORAGE_KEY)) as OutboxOp[] | undefined;
          const merged = [...(existing || []), ...legacyParsed];
          await idbSet(STORAGE_KEY, merged);
          _memQueue = merged;
          // Pulisci la vecchia chiave localStorage
          localStorage.removeItem(LEGACY_STORAGE_KEY);
          notify(merged.length);
          return merged;
        }
        // Coda legacy vuota — pulisci comunque
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
    } catch (err) {
      console.warn("[outbox] Legacy migration failed:", err);
    }
  }

  // Usa la cache in memoria se disponibile
  if (_memQueue !== null) return _memQueue;

  try {
    const raw = (await idbGet(STORAGE_KEY)) as OutboxOp[] | undefined;
    _memQueue = Array.isArray(raw) ? raw : [];
    return _memQueue;
  } catch {
    _memQueue = [];
    return [];
  }
}

/**
 * Versione sincrona per getPendingCount (usa cache in memoria).
 * Se la cache non è ancora popolata, ritorna 0 e triggera una lettura async.
 */
function readQueueSync(): OutboxOp[] {
  return _memQueue || [];
}

async function writeQueueAsync(q: OutboxOp[]): Promise<void> {
  if (typeof window === "undefined") return;
  _memQueue = q;
  try {
    await idbSet(STORAGE_KEY, q);
  } catch (err) {
    console.warn("[outbox] writeQueue failed:", err);
    // Non possiamo fare molto — il chiamante ha comunque lo stato in memoria
  }
  notify(q.length);
}

/**
 * Versione sincrona di writeQueue per compatibilità con codice legacy.
 * Aggiorna la cache in memoria e triggera scrittura async.
 */
function writeQueueSync(q: OutboxOp[]): void {
  _memQueue = q;
  void writeQueueAsync(q);
  notify(q.length);
}

export function getPendingCount(): number {
  return readQueueSync().length;
}

/**
 * Prova subito una scrittura. Se fallisce per un motivo "temporaneo"
 * (rete, 5xx, timeout), la mette in coda per il retry automatico e
 * ritorna comunque true — la UI locale è già aggiornata (optimistic),
 * la coda garantisce che prima o poi la scrittura arrivi al cloud.
 * Se fallisce per un motivo "definitivo" (400/403/404/409 — dati o
 * permessi non validi, un retry non risolverebbe nulla), NON viene
 * accodata: si logga e si ritorna false.
 * ⚠️ 401 (sessione scaduta) NON è definitivo: viene accodata per retry
 * perché la sessione si rinnova al prossimo refresh della pagina.
 */
export async function writeWithOutbox(
  url: string,
  method: "POST" | "PATCH" | "DELETE",
  body: any,
  label: string
): Promise<boolean> {
  // 🔒 Task 3: Aggiungi timestamp locale per risoluzione conflitti.
  const bodyWithTimestamp = body !== undefined
    ? { ...body, local_updated_at: new Date().toISOString() }
    : undefined;

  try {
    const res = await fetch(url, {
      method,
      headers: bodyWithTimestamp !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: bodyWithTimestamp !== undefined ? JSON.stringify(bodyWithTimestamp) : undefined,
    });
    if (res.ok) {
      console.log(`[outbox] ✅ ${label} — scritta con successo`);
      return true;
    }

    // 🔒 RACE CONDITION FIX: 409 Conflict = cloud ha dati più recenti
    // Il dato locale è stale → SCARTA (non ritentare) + ricarica dal cloud
    if (res.status === 409) {
      const errData = await res.json().catch(() => ({}));
      console.warn(`[outbox] ⚠️ ${label} — 409 Conflict: cloud ha dati più recenti. Scritture locale scartata.`, errData);
      // 🔒 Trigger ricaricamento dal cloud per allineare lo stato locale
      triggerCloudReload();
      return false; // non ritentare — il dato è stale
    }

    // 🔒 FIX: 401 (sessione scaduta) deve essere ritentato, non scartato.
    if (res.status === 401) {
      console.warn(`[outbox] ${label} — 401 sessione scaduta, accodata per retry al prossimo refresh`);
      enqueue(url, method, body, label);
      return true;
    }

    if (res.status >= 400 && res.status < 500) {
      // Errore "definitivo" — 400/403/404 (dati invalidi, forbidden, not found)
      console.error(`[outbox] ${label} — errore ${res.status} definitivo, non ritento`, await res.text().catch(() => ""));
      return false;
    }
    throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    // Errore di rete o 5xx → accoda per retry automatico
    console.warn(`[outbox] ${label} fallita, accodata per retry:`, err);
    enqueue(url, method, bodyWithTimestamp, label);
    return true;
  }
}

function enqueue(url: string, method: "POST" | "PATCH" | "DELETE", body: any, label: string): void {
  const q = readQueueSync();
  q.push({
    opId: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    url,
    method,
    body,
    createdAt: Date.now(),
    attempts: 0,
    label,
  });
  writeQueueSync(q);
  // Prova subito un flush (non-bloccante) così se la rete torna nel
  // frattempo non aspettiamo il prossimo tick da 15s.
  void flushOutbox();
}

let flushing = false;

/**
 * Rielabora la coda in ordine. Va chiamata:
 * - al boot dell'app (App.tsx / layout)
 * - su evento "online"
 * - su "visibilitychange" quando la tab torna visibile
 * - periodicamente (vedi startOutboxAutoFlush)
 */
export async function flushOutbox(): Promise<{ pending: number; flushed: number }> {
  if (typeof window === "undefined") return { pending: 0, flushed: 0 };
  if (flushing) return { pending: getPendingCount(), flushed: 0 };
  // 🔒 CLOUD-FIRST: Non flushare durante il boot cloud-first
  if (_cloudSyncPaused) {
    console.log("[outbox] ⏸️ Flush skipped — cloud sync in progress");
    return { pending: getPendingCount(), flushed: 0 };
  }
  flushing = true;
  let flushed = 0;
  try {
    const q = await readQueueAsync();
    const remaining: OutboxOp[] = [];
    for (const op of q) {
      try {
        const res = await fetch(op.url, {
          method: op.method,
          headers: op.body !== undefined ? { "Content-Type": "application/json" } : undefined,
          body: op.body !== undefined ? JSON.stringify(op.body) : undefined,
        });
        if (res.ok) {
          flushed++;
          continue; // rimossa dalla coda
        }
        if (res.status >= 400 && res.status < 500) {
          // Definitivo — droppiamo per non bloccare per sempre la coda,
          // ma logghiamo forte perché è un dato utente che non è arrivato.
          console.error(`[outbox] DROP definitivo per ${op.label} (HTTP ${res.status})`, op);
          continue;
        }
        throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        op.attempts++;
        if (op.attempts >= MAX_ATTEMPTS) {
          console.error(`[outbox] DROP dopo ${MAX_ATTEMPTS} tentativi per ${op.label}`, op, err);
          continue;
        }
        remaining.push(op);
      }
    }
    await writeQueueAsync(remaining);
    return { pending: remaining.length, flushed };
  } finally {
    flushing = false;
  }
}

let autoFlushStarted = false;
let _cloudSyncPaused = false; // 🔒 Blocca il flush durante il boot cloud-first
let _isInitialSyncDone = false; // 🔒 True solo dopo il primo loadFromCloud completato
let _cloudReloadCallback: (() => void) | null = null;

/**
 * 🔒 CLOUD-FIRST: Pausa il flush dell'outbox.
 */
export function pauseOutboxFlush(): void {
  _cloudSyncPaused = true;
  console.log("[outbox] ⏸️ Flush paused — cloud sync in progress");
}

/**
 * 🔒 CLOUD-FIRST: Riprendi il flush dell'outbox.
 */
export function resumeOutboxFlush(): void {
  _cloudSyncPaused = false;
  _isInitialSyncDone = true;
  console.log("[outbox] ▶️ Flush resumed — cloud sync complete, initial sync done");
  void flushOutbox();
}

/**
 * 🔒 RACE CONDITION FIX: Registra callback per ricaricare dal cloud su 409.
 */
export function onCloudConflict(callback: () => void): void {
  _cloudReloadCallback = callback;
}

/**
 * 🔒 RACE CONDITION FIX: Triggera ricaricamento dal cloud.
 */
function triggerCloudReload(): void {
  if (_cloudReloadCallback) {
    console.log("[outbox] 🔄 Triggering cloud reload due to 409 conflict");
    _cloudReloadCallback();
  }
}

/**
 * 🔒 Ritorna true se il primo sync dal cloud è completato.
 */
export function isInitialSyncDone(): boolean {
  return _isInitialSyncDone;
}

/**
 * Da chiamare una sola volta all'avvio dell'app.
 */
export function startOutboxAutoFlush(): void {
  if (typeof window === "undefined" || autoFlushStarted) return;
  autoFlushStarted = true;

  // 🔒 Pre-popolamento cache in memoria al boot (non bloccante)
  void readQueueAsync().then((q) => {
    if (q.length > 0) {
      console.log(`[outbox] Boot: ${q.length} pending ops in queue`);
    }
  });

  // 🔒 NON flushare subito se il cloud sync è in pausa
  if (!_cloudSyncPaused) void flushOutbox();

  window.addEventListener("online", () => void flushOutbox());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void flushOutbox();
  });
  setInterval(() => void flushOutbox(), FLUSH_INTERVAL_MS);
}
