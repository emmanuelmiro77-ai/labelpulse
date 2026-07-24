/**
 * 🔒 SISTEMA DI BACKUP AUTOMATICO — LabelPulse
 *
 * Salva uno snapshot completo dello stato su IndexedDB ad ogni modifica
 * significativa. Lo snapshot è keyed per email utente, quindi:
 *
 *   - NON viene cancellato al logout (clearAllLocalData non lo tocca)
 *   - Ogni utente ha il proprio backup isolato
 *   - All'apertura, se il cloud sync fallisce o ritorna vuoto,
 *     l'ultimo snapshot viene ripristinato automaticamente
 *
 * Flusso:
 *   1. Utente modifica stato (label, demo, profilo, etc.)
 *      → saveSnapshot(email, state) salva su IndexedDB
 *   2. Utente chiude l'app o fa logout
 *      → saveSnapshot finale (già fatto dal subscribe)
 *   3. Utente riapre l'app / fa login
 *      → loadSnapshot(email) carica l'ultimo snapshot
 *      → se cloud sync ritorna vuoto, usa lo snapshot come fallback
 *      → se cloud sync ha dati, usa i dati cloud (cloud wins)
 */

import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";

const SNAPSHOT_PREFIX = "labelpulse-snapshot-";
const SNAPSHOT_INDEX_KEY = "labelpulse-snapshot-index";

export interface StateSnapshot {
  email: string;
  timestamp: string;
  version: number;
  labels: any[];
  demos: any[];
  releases: any[];
  userProfile: any;
  savedPitches: any[];
  sentCampaigns: any[];
  rankingSnapshots: any[];
  rankingsUpdatedAt: string | null;
  locale: string;
  // 🔒 Phase 1: projects è opzionale per backward compat con snapshot
  // precedenti alla Phase 1. Nuovi snapshot lo includono sempre.
  projects?: any[];
}

/**
 * Salva uno snapshot dello stato per l'email specificata.
 * Debounced per evitare troppi scritture (salva al massimo ogni 2 secondi).
 *
 * 🔒 FEEDBACK UI: Emette un evento custom 'labelpulse-backup' sul window
 * object ad ogni salvataggio, così l'UI può mostrare un indicatore.
 */
let _saveTimeout: ReturnType<typeof setTimeout> | null = null;
let _pendingSnapshot: StateSnapshot | null = null;
let _lastSaveAt: number | null = null;
let _lastSaveStatus: "ok" | "error" | "saving" = "ok";

export function getLastBackupInfo(): { timestamp: number | null; status: "ok" | "error" | "saving" } {
  return { timestamp: _lastSaveAt, status: _lastSaveStatus };
}

function emitBackupEvent(status: "ok" | "error" | "saving", timestamp?: number) {
  if (typeof window === "undefined") return;
  _lastSaveStatus = status;
  if (timestamp) _lastSaveAt = timestamp;
  window.dispatchEvent(new CustomEvent("labelpulse-backup", {
    detail: { status, timestamp: _lastSaveAt },
  }));
}

export function saveSnapshot(
  email: string,
  state: {
    labels: any[];
    demos: any[];
    releases: any[];
    userProfile: any;
    savedPitches: any[];
    sentCampaigns: any[];
    rankingSnapshots: any[];
    rankingsUpdatedAt: string | null;
    locale: string;
    // 🔒 Phase 1: projects è opzionale per backward compat.
    projects?: any[];
  }
): void {
  if (!email || typeof window === "undefined") return;

  const snapshot: StateSnapshot = {
    email: email.toLowerCase().trim(),
    timestamp: new Date().toISOString(),
    version: 1,
    ...state,
  };

  _pendingSnapshot = snapshot;

  // Debounce: salva al massimo ogni 2 secondi
  if (_saveTimeout) clearTimeout(_saveTimeout);
  _saveTimeout = setTimeout(async () => {
    if (!_pendingSnapshot) return;
    emitBackupEvent("saving");
    try {
      const key = `${SNAPSHOT_PREFIX}${_pendingSnapshot.email}`;
      await idbSet(key, _pendingSnapshot);

      // Aggiorna l'indice dei backup disponibili
      const index = (await idbGet(SNAPSHOT_INDEX_KEY)) as string[] || [];
      if (!index.includes(_pendingSnapshot.email)) {
        index.push(_pendingSnapshot.email);
        await idbSet(SNAPSHOT_INDEX_KEY, index);
      }

      _lastSaveAt = Date.now();
      emitBackupEvent("ok", _lastSaveAt);
      console.log(`[AutoBackup] ✅ Snapshot saved for ${_pendingSnapshot.email} (${_pendingSnapshot.labels.length} labels, ${_pendingSnapshot.demos.length} demos)`);
    } catch (err) {
      emitBackupEvent("error");
      console.warn("[AutoBackup] ❌ Failed to save snapshot:", err);
    }
    _pendingSnapshot = null;
  }, 2000);
}

/**
 * Salva immediatamente lo snapshot pending (senza debounce).
 * Chiamato prima di logout/chiusura app.
 */
export async function flushSnapshot(): Promise<void> {
  if (_saveTimeout) {
    clearTimeout(_saveTimeout);
    _saveTimeout = null;
  }
  if (!_pendingSnapshot) return;
  emitBackupEvent("saving");
  try {
    const key = `${SNAPSHOT_PREFIX}${_pendingSnapshot.email}`;
    await idbSet(key, _pendingSnapshot);
    _lastSaveAt = Date.now();
    emitBackupEvent("ok", _lastSaveAt);
    console.log(`[AutoBackup] ✅ Snapshot flushed for ${_pendingSnapshot.email} (app closing)`);
  } catch (err) {
    emitBackupEvent("error");
    console.warn("[AutoBackup] ❌ Failed to flush snapshot:", err);
  }
  _pendingSnapshot = null;
}

/**
 * Carica l'ultimo snapshot per l'email specificata.
 * Ritorna null se non esiste.
 */
export async function loadSnapshot(email: string): Promise<StateSnapshot | null> {
  if (!email || typeof window === "undefined") return null;
  try {
    const key = `${SNAPSHOT_PREFIX}${email.toLowerCase().trim()}`;
    const snapshot = (await idbGet(key)) as StateSnapshot | undefined;
    if (snapshot) {
      console.log(`[AutoBackup] Snapshot loaded for ${email} (${snapshot.labels.length} labels, ${snapshot.demos.length} demos, saved ${snapshot.timestamp})`);
    }
    return snapshot || null;
  } catch (err) {
    console.warn("[AutoBackup] Failed to load snapshot:", err);
    return null;
  }
}

/**
 * Elimina lo snapshot per l'email specificata.
 * Chiamato solo da "Pulizia completa account" (wipeCurrentUserCloudRow).
 */
export async function deleteSnapshot(email: string): Promise<void> {
  if (!email) return;
  try {
    const key = `${SNAPSHOT_PREFIX}${email.toLowerCase().trim()}`;
    await idbDel(key);
    const index = (await idbGet(SNAPSHOT_INDEX_KEY)) as string[] || [];
    const newIndex = index.filter((e) => e !== email.toLowerCase().trim());
    await idbSet(SNAPSHOT_INDEX_KEY, newIndex);
    console.log(`[AutoBackup] Snapshot deleted for ${email}`);
  } catch (err) {
    console.warn("[AutoBackup] Failed to delete snapshot:", err);
  }
}

/**
 * Lista tutte le email con backup disponibili.
 * Utile per diagnostica.
 */
export async function listSnapshots(): Promise<string[]> {
  try {
    return (await idbGet(SNAPSHOT_INDEX_KEY)) as string[] || [];
  } catch {
    return [];
  }
}
