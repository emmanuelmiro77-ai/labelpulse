"use client";

/**
 * BackupIndicator — Mostra lo stato del backup automatico su IndexedDB.
 *
 * Feedback visivo per l'utente:
 * - 🟢 "Backup OK" (verde) — ultimo backup < 5 min fa
 * - 🟡 "Salvataggio..." (giallo, animato) — backup in corso
 * - 🔴 "Errore backup" (rosso) — ultimo backup fallito
 * - ⚪ "Mai" (grigio) — nessun backup ancora fatto (es. appena loggato)
 *
 * Il componente ascolta l'evento custom 'labelpulse-backup' emesso
 * da auto-backup.ts ad ogni salvataggio.
 */

import { useState, useEffect } from "react";
import { Save, Check, Loader2, AlertCircle } from "lucide-react";
import { getLastBackupInfo } from "@/lib/auto-backup";

export function BackupIndicator() {
  const [backupInfo, setBackupInfo] = useState(getLastBackupInfo());
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setBackupInfo({ timestamp: detail.timestamp, status: detail.status });
    };
    window.addEventListener("labelpulse-backup", handler);
    return () => window.removeEventListener("labelpulse-backup", handler);
  }, []);

  // Aggiorna "now" ogni 30s per ricalcolare "X min fa"
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  const { timestamp, status } = backupInfo;

  const formatRelative = (ts: number): string => {
    const diff = Math.floor((now - ts) / 1000);
    if (diff < 5) return "ora";
    if (diff < 60) return `${diff}s fa`;
    if (diff < 3600) return `${Math.floor(diff / 60)} min fa`;
    return `${Math.floor(diff / 3600)}h fa`;
  };

  if (status === "saving") {
    return (
      <div
        className="flex items-center gap-1.5 text-[10px] text-amber-400 px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/10"
        title="Salvataggio backup in corso..."
      >
        <Loader2 className="h-3 w-3 animate-spin" />
        <span className="hidden sm:inline">Salvataggio...</span>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div
        className="flex items-center gap-1.5 text-[10px] text-red-400 px-1.5 py-0.5 rounded border border-red-500/30 bg-red-500/10"
        title="Errore nel salvataggio backup — controlla la console"
      >
        <AlertCircle className="h-3 w-3" />
        <span className="hidden sm:inline">Errore backup</span>
      </div>
    );
  }

  if (!timestamp) {
    return (
      <div
        className="flex items-center gap-1.5 text-[10px] text-muted-foreground px-1.5 py-0.5 rounded border border-border/30 bg-secondary/30"
        title="Nessun backup ancora effettuato"
      >
        <Save className="h-3 w-3" />
        <span className="hidden sm:inline">Backup: mai</span>
      </div>
    );
  }

  // status === "ok"
  return (
    <div
      className="flex items-center gap-1.5 text-[10px] text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10"
      title={`Ultimo backup: ${formatRelative(timestamp)}`}
    >
      <Check className="h-3 w-3" />
      <span className="hidden sm:inline">Backup: {formatRelative(timestamp)}</span>
    </div>
  );
}
