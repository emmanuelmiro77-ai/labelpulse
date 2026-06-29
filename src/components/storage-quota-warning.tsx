"use client";

/**
 * StorageQuotaWarning
 *
 * 🔒 FASE A FIX (QuotaExceededError):
 * Shows a non-blocking banner when localStorage is full or under pressure.
 * Two levels:
 *   1. WARNING (yellow): sidecar backups were cleared to make space — but storage is tight
 *   2. CRITICAL (red): write failed entirely, only cloud sync is keeping data safe
 *
 * The banner auto-dismisses after 15s for WARNING, persists for CRITICAL until user closes it.
 */

import { useEffect, useState } from "react";
import { AlertCircle, X, CloudOff } from "lucide-react";

type Level = "warning" | "critical";

type QuotaEvent = {
  detail: {
    cleared?: number;
    recovered?: boolean;
    key?: string;
    error?: string;
  };
};

export function StorageQuotaWarning() {
  const [level, setLevel] = useState<Level | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onWarning = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      setLevel("warning");
      setMessage(
        `Storage locale quasi pieno — ho liberato ${detail.cleared || 0} backup vecchi per fare spazio. ` +
        `I tuoi dati sono salvati nel cloud.`
      );
      // Auto-dismiss after 15s for warning level
      setTimeout(() => setLevel(null), 15000);
    };

    const onCritical = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      setLevel("critical");
      setMessage(
        `⚠️ Storage locale pieno — impossibile salvare nel browser. ` +
        `I tuoi dati sono stati sincronizzati nel cloud. ` +
        `Riprendi da qualsiasi dispositivo con lo stesso login.`
      );
      // Log to console for debugging
      console.error("[StorageQuotaWarning] Critical storage failure:", detail);
    };

    window.addEventListener("labelpulse:storage-quota-warning", onWarning);
    window.addEventListener("labelpulse:storage-quota-exceeded", onCritical);

    return () => {
      window.removeEventListener("labelpulse:storage-quota-warning", onWarning);
      window.removeEventListener("labelpulse:storage-quota-exceeded", onCritical);
    };
  }, []);

  if (!level) return null;

  const isCritical = level === "critical";
  const bg = isCritical ? "bg-red-950/95 border-red-500" : "bg-amber-950/95 border-amber-500";
  const iconColor = isCritical ? "text-red-400" : "text-amber-400";
  const Icon = isCritical ? CloudOff : AlertCircle;

  return (
    <div
      role="alert"
      className={`fixed bottom-4 right-4 z-[100] max-w-md p-4 rounded-lg border ${bg} shadow-2xl backdrop-blur-sm`}
    >
      <div className="flex items-start gap-3">
        <Icon className={`h-5 w-5 ${iconColor} shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">
            {isCritical ? "Storage pieno — cloud sync attivo" : "Storage sotto pressione"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{message}</p>
        </div>
        <button
          onClick={() => setLevel(null)}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Chiudi"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
