"use client";

/**
 * CloudDiagnostic — admin-only panel showing the live state of the two
 * Supabase cloud rows that back LabelPulse:
 *
 *   1. GLOBAL row (id='global') — Beatport rankings + snapshots, written
 *      only by admin. This is what every regular user reads at login.
 *   2. PERSONAL row (id=email) — profile, demos, per-label personal
 *      fields (notes, emails, status, links). Each user has their own.
 *
 * The panel lets the admin verify at a glance:
 *   - Did my last scrape land on the global row?
 *   - When was the global row last updated?
 *   - How many labels/snapshots does the global row hold right now?
 *   - How many labels in my personal row have real personal data
 *     (notes/emails/status/links) vs default placeholders?
 *   - How many of my personal labels are custom (isCustom=true)?
 *
 * Usage: rendered inside the Database popover (data-backup.tsx), only
 * when isAdmin is true. Has its own Refresh button to re-fetch.
 */

import { useState, useEffect, useCallback } from "react";
import {
  Globe2,
  User2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  HardDrive,
  Tag,
  Database as DatabaseIcon,
} from "lucide-react";
import { getCloudDiagnostic, type CloudDiagnostic as CloudDiagnosticData } from "@/lib/supabase";
import { useAppStore } from "@/lib/store";

// ==================== HELPERS ====================

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatTimestamp(ts: string | null, locale: string): string {
  if (!ts) return "—";
  try {
    const d = new Date(ts);
    const localeStr = locale === "it" ? "it-IT" : locale === "es" ? "es-ES" : locale === "fr" ? "fr-FR" : locale === "de" ? "de-DE" : "en-US";
    return d.toLocaleString(localeStr, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return ts;
  }
}

function relativeTime(ts: string | null): string {
  if (!ts) return "";
  try {
    const diff = Date.now() - new Date(ts).getTime();
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return `${sec}s fa`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m fa`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h fa`;
    const days = Math.floor(hr / 24);
    return `${days}g fa`;
  } catch {
    return "";
  }
}

// ==================== SUB-COMPONENT: ROW CARD ====================

interface RowCardProps {
  title: string;
  icon: React.ReactNode;
  accent: "cyan" | "violet";
  row: CloudDiagnosticData["personal"] | CloudDiagnosticData["global"];
  locale: string;
}

function RowCard({ title, icon, accent, row, locale }: RowCardProps) {
  const accentText = accent === "cyan" ? "text-cyan-400" : "text-violet-400";
  const accentBg = accent === "cyan" ? "bg-cyan-500/10" : "bg-violet-500/10";
  const accentBorder = accent === "cyan" ? "border-cyan-500/30" : "border-violet-500/30";

  return (
    <div className={`rounded-md border ${accentBorder} ${accentBg} p-2.5 space-y-2`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={accentText}>{icon}</span>
          <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider">{title}</span>
        </div>
        {row.exists ? (
          <span className="flex items-center gap-1 text-[9px] text-emerald-400 font-medium">
            <CheckCircle2 className="h-3 w-3" /> OK
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[9px] text-amber-400 font-medium">
            <AlertTriangle className="h-3 w-3" /> MANCANTE
          </span>
        )}
      </div>

      {/* Row id */}
      <div className="text-[10px] text-muted-foreground/80 font-mono truncate" title={row.id}>
        id: {row.id}
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-1.5 text-[10px]">
        <Metric icon={<DatabaseIcon className="h-2.5 w-2.5" />} label="Labels" value={row.exists ? String(row.labelsCount) : "—"} />
        <Metric icon={<Clock className="h-2.5 w-2.5" />} label="Snapshots" value={row.exists ? String(row.snapshotsCount) : "—"} />
        <Metric icon={<Tag className="h-2.5 w-2.5" />} label="Custom" value={row.exists ? String(row.customLabelsCount) : "—"} />
        <Metric icon={<HardDrive className="h-2.5 w-2.5" />} label="Size" value={formatBytes(row.sizeBytes)} />
      </div>

      {/* Personal data row — only meaningful for personal row, but harmless on global */}
      {accent === "violet" && row.exists && (
        <div className="text-[10px] text-muted-foreground/90 leading-snug pt-1 border-t border-border/30">
          <span className="text-violet-300 font-medium">{row.beatportWithPersonalDataCount}</span> label con note/email/status compilati
        </div>
      )}

      {/* Timestamps */}
      {row.exists && (
        <div className="text-[10px] text-muted-foreground/80 space-y-0.5 pt-1 border-t border-border/30">
          <div className="flex items-center justify-between gap-2">
            <span>Updated_at:</span>
            <span className="text-foreground/90 font-mono truncate" title={row.updatedAt || ""}>
              {formatTimestamp(row.updatedAt, locale)} <span className="text-muted-foreground/60">({relativeTime(row.updatedAt)})</span>
            </span>
          </div>
          {row.rankingsUpdatedAt && (
            <div className="flex items-center justify-between gap-2">
              <span>Rankings:</span>
              <span className="text-foreground/90 font-mono truncate" title={row.rankingsUpdatedAt}>
                {formatTimestamp(row.rankingsUpdatedAt, locale)}
              </span>
            </div>
          )}
          {row.lastGlobalUpdate && (
            <div className="flex items-center justify-between gap-2">
              <span>Global push:</span>
              <span className="text-foreground/90 font-mono truncate" title={row.lastGlobalUpdate}>
                {formatTimestamp(row.lastGlobalUpdate, locale)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1 text-muted-foreground">
      <span className="text-muted-foreground/60">{icon}</span>
      <span>{label}:</span>
      <span className="text-foreground font-mono font-medium ml-auto">{value}</span>
    </div>
  );
}

// ==================== MAIN COMPONENT ====================

export function CloudDiagnostic() {
  const locale = useAppStore((s) => s.locale) || "it";
  const [data, setData] = useState<CloudDiagnosticData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDiagnostic = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getCloudDiagnostic();
      if (!result) {
        setError(locale === "it" ? "Supabase non configurato" : "Supabase not configured");
      } else {
        setData(result);
      }
    } catch (err) {
      console.error("[CloudDiagnostic] Fetch failed:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [locale]);

  // Auto-fetch on mount
  useEffect(() => {
    fetchDiagnostic();
  }, [fetchDiagnostic]);

  return (
    <div className="space-y-2">
      {/* Header with refresh button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <DatabaseIcon className="h-3.5 w-3.5 text-amber-400" />
          <p className="text-xs font-medium text-foreground">
            {locale === "it" ? "Diagnostica Cloud" : "Cloud Diagnostic"}
          </p>
        </div>
        <button
          type="button"
          onClick={fetchDiagnostic}
          disabled={loading}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-secondary/50 hover:bg-secondary border border-border/40 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-60"
          title={locale === "it" ? "Aggiorna" : "Refresh"}
        >
          <RefreshCw className={`h-2.5 w-2.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? "…" : "↻"}
        </button>
      </div>

      {/* Current user info */}
      {data && (
        <div className="text-[10px] text-muted-foreground/80 leading-snug">
          {locale === "it" ? "Login:" : "Logged in as:"}{" "}
          <span className="text-foreground font-mono">{data.currentEmail || "—"}</span>
          {data.isAdmin && (
            <span className="ml-1.5 inline-flex items-center gap-0.5 text-[9px] uppercase tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded px-1 py-0.5 font-medium">
              admin
            </span>
          )}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex items-start gap-1.5 p-2 rounded-md bg-red-500/10 border border-red-500/30">
          <AlertTriangle className="h-3 w-3 text-red-400 shrink-0 mt-0.5" />
          <p className="text-[10px] text-red-400 leading-snug">{error}</p>
        </div>
      )}

      {/* Row cards */}
      {data && (
        <div className="space-y-2">
          <RowCard
            title={locale === "it" ? "Riga Globale" : "Global Row"}
            icon={<Globe2 className="h-3.5 w-3.5" />}
            accent="cyan"
            row={data.global}
            locale={locale}
          />
          <RowCard
            title={locale === "it" ? "Riga Personale" : "Personal Row"}
            icon={<User2 className="h-3.5 w-3.5" />}
            accent="violet"
            row={data.personal}
            locale={locale}
          />
        </div>
      )}

      {/* Help hint */}
      {data && (
        <p className="text-[9px] text-muted-foreground/60 leading-snug pt-1 border-t border-border/30">
          {locale === "it"
            ? "La riga globale è letta da tutti gli utenti. La riga personale contiene solo le tue personalizzazioni (note, email, status)."
            : "The global row is read by all users. Your personal row holds only your customizations (notes, emails, status)."}
        </p>
      )}

      {/* Fetched-at footer */}
      {data && (
        <p className="text-[9px] text-muted-foreground/40 text-right">
          {locale === "it" ? "Aggiornato:" : "Fetched:"} {formatTimestamp(data.fetchedAt, locale)}
        </p>
      )}
    </div>
  );
}
