"use client";

/**
 * FeedbackInbox — admin-only panel showing beta tester feedback inline.
 *
 * Rendered inside the DataBackup popover, right after CloudDiagnostic.
 * Reads from the same /api/beta-feedback endpoint as /admin/feedback,
 * using the BETA_ADMIN_TOKEN stored in localStorage (set on first use
 * or sync from /admin/feedback).
 *
 * Compact display: latest 5 feedbacks visible, "Vedi tutti" button
 * opens /admin/feedback in a new tab for the full list with filters.
 */

import { useEffect, useState, useCallback } from "react";
import { Bug, RefreshCw, ExternalLink, CheckCircle2, AlertCircle, Inbox } from "lucide-react";

type Feedback = {
  id: number;
  email: string;
  category: "bug" | "feature" | "other";
  subject: string | null;
  message: string;
  app_version: string | null;
  label_count: number;
  demo_count: number;
  locale: string | null;
  status: "new" | "read" | "resolved" | "ignored";
  created_at: string;
};

const CATEGORY_COLOR: Record<string, string> = {
  bug: "text-red-400 bg-red-500/10 border-red-500/30",
  feature: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  other: "text-gray-400 bg-gray-500/10 border-gray-500/30",
};

const STATUS_COLOR: Record<string, string> = {
  new: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  read: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  resolved: "text-green-400 bg-green-500/10 border-green-500/30",
  ignored: "text-gray-400 bg-gray-500/10 border-gray-500/30",
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "ora";
  if (min < 60) return `${min}m fa`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h fa`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}g fa`;
  return new Date(iso).toLocaleDateString("it-IT");
}

export function FeedbackInbox() {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string>("");
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  // Load BETA_ADMIN_TOKEN from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("beta_admin_token") || "";
    setToken(stored);
    setTokenInput(stored);
    if (!stored) setShowTokenInput(true);
  }, []);

  const fetchFeedbacks = useCallback(async () => {
    if (!token) {
      setShowTokenInput(true);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/beta-feedback?status=new&limit=10", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        setShowTokenInput(true);
        setError("Token non valido. Inseriscilo di nuovo.");
        return;
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      setFeedbacks(data.feedback || []);
    } catch (err: any) {
      setError(err.message || "Errore caricamento feedback");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) fetchFeedbacks();
  }, [token, fetchFeedbacks]);

  const markAsRead = async (id: number) => {
    if (!token) return;
    try {
      await fetch(`/api/beta-feedback?id=${id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "read" }),
      });
      // Update local state: remove from list (we filter new only)
      setFeedbacks((prev) => prev.filter((f) => f.id !== id));
    } catch (err) {
      console.error("markAsRead failed:", err);
    }
  };

  const saveToken = () => {
    const v = tokenInput.trim();
    if (!v) return;
    localStorage.setItem("beta_admin_token", v);
    setToken(v);
    setShowTokenInput(false);
    setError(null);
  };

  const newCount = feedbacks.length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Bug className="h-3.5 w-3.5 text-amber-400" />
          <p className="text-xs font-medium text-foreground">
            Feedback Beta
          </p>
          {newCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold bg-amber-500 text-black">
              {newCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={fetchFeedbacks}
            disabled={loading || !token}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-secondary/50 hover:bg-secondary border border-border/40 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-60"
            title="Aggiorna"
          >
            <RefreshCw className={`h-2.5 w-2.5 ${loading ? "animate-spin" : ""}`} />
            ↻
          </button>
          <a
            href="/admin/feedback"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-secondary/50 hover:bg-secondary border border-border/40 text-muted-foreground hover:text-foreground transition-colors"
            title="Apri pagina completa"
          >
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        </div>
      </div>

      {/* Token setup */}
      {showTokenInput && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="h-3 w-3 text-amber-400 shrink-0" />
            <p className="text-[10px] text-amber-400 font-medium">
              Configura il token admin
            </p>
          </div>
          <p className="text-[9px] text-muted-foreground leading-snug">
            Lo stesso <code className="bg-secondary/50 px-0.5 rounded">BETA_ADMIN_TOKEN</code> delle env vars Vercel.
          </p>
          <div className="flex gap-1">
            <input
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="token"
              onKeyDown={(e) => e.key === "Enter" && saveToken()}
              className="flex-1 min-w-0 text-[10px] px-1.5 py-1 rounded bg-background border border-border/40 text-foreground"
            />
            <button
              onClick={saveToken}
              className="px-2 py-1 rounded text-[10px] font-medium bg-primary text-primary-foreground hover:bg-primary/90"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && !showTokenInput && (
        <div className="flex items-start gap-1.5 p-2 rounded-md bg-red-500/10 border border-red-500/30">
          <AlertTriangle className="h-3 w-3 text-red-400 shrink-0 mt-0.5" />
          <p className="text-[10px] text-red-400 leading-snug">{error}</p>
        </div>
      )}

      {/* Feedback list */}
      {!showTokenInput && !error && newCount === 0 && !loading && (
        <div className="flex items-center gap-1.5 p-2 rounded-md bg-secondary/20 border border-border/40">
          <Inbox className="h-3 w-3 text-muted-foreground shrink-0" />
          <p className="text-[10px] text-muted-foreground">
            Nessun feedback nuovo. Tutti letti ✅
          </p>
        </div>
      )}

      {!showTokenInput && newCount > 0 && (
        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
          {feedbacks.map((f) => (
            <div
              key={f.id}
              className="rounded-md border border-border/40 bg-card/50 p-2 space-y-1"
            >
              <div className="flex items-center gap-1 flex-wrap">
                <span className={`text-[8px] uppercase px-1 py-0.5 rounded border ${CATEGORY_COLOR[f.category]}`}>
                  {f.category}
                </span>
                <span className={`text-[8px] uppercase px-1 py-0.5 rounded border ${STATUS_COLOR[f.status]}`}>
                  {f.status}
                </span>
                <span className="text-[9px] text-muted-foreground ml-auto">
                  {formatRelative(f.created_at)}
                </span>
              </div>
              {f.subject && (
                <p className="text-[11px] font-medium text-foreground line-clamp-1">
                  {f.subject}
                </p>
              )}
              <p className="text-[10px] text-muted-foreground leading-snug line-clamp-3">
                {f.message}
              </p>
              <div className="flex items-center justify-between pt-0.5">
                <p className="text-[9px] text-muted-foreground/70 font-mono truncate">
                  {f.email}
                </p>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setExpanded(expanded === f.id ? null : f.id)}
                    className="text-[9px] px-1.5 py-0.5 rounded bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground"
                  >
                    {expanded === f.id ? "Chiudi" : "Dettagli"}
                  </button>
                  <button
                    onClick={() => markAsRead(f.id)}
                    title="Segna come letto"
                    className="text-[9px] px-1.5 py-0.5 rounded bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground flex items-center gap-0.5"
                  >
                    <CheckCircle2 className="h-2.5 w-2.5" />
                  </button>
                </div>
              </div>
              {expanded === f.id && (
                <div className="pt-1.5 mt-1 border-t border-border/30 space-y-1 text-[9px] text-muted-foreground/80">
                  <p className="whitespace-pre-wrap text-foreground/90 text-[10px] leading-relaxed">
                    {f.message}
                  </p>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 pt-1">
                    <div><span className="opacity-60">App ver:</span> {f.app_version || "—"}</div>
                    <div><span className="opacity-60">Lang:</span> {(f.locale || "—").toUpperCase()}</div>
                    <div><span className="opacity-60">Labels:</span> {f.label_count}</div>
                    <div><span className="opacity-60">Demos:</span> {f.demo_count}</div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Help */}
      {!showTokenInput && (
        <p className="text-[9px] text-muted-foreground/60 leading-snug pt-1 border-t border-border/30">
          Mostra gli ultimi 10 feedback non letti. Per la lista completa con filtri,
          usa l'icona ↗ in alto.
        </p>
      )}
    </div>
  );
}
