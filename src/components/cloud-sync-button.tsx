"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Cloud, CloudOff, Loader2, RefreshCw, CheckCircle2, AlertCircle, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { useAppStore, forceCloudSync, loadFromCloud } from "@/lib/store";
import {
  getCloudStatus,
  getLastSyncAt,
  getLastError,
  subscribeToCloudStatus,
  isSupabaseConfigured,
  type CloudSyncStatus,
} from "@/lib/supabase";

/**
 * Cloud Sync Button
 *
 * Visible indicator of the Supabase cloud sync state:
 *   🔴 Red (CloudOff):    not configured — user must enter Supabase credentials in Profilo
 *   🟡 Yellow (Loader2):  syncing — currently uploading/downloading
 *   🟢 Green (CheckCircle2): synced — last sync successful, multi-device sync active
 *   🔴 Red (AlertCircle): error — last sync failed, click to see details
 *
 * Click opens a popover with:
 *   - Current status + last sync time
 *   - "Forza sincronizzazione" button (manual sync)
 *   - Setup hint if not configured
 */
export function CloudSyncButton() {
  const { locale } = useAppStore();
  const { toast } = useToast();
  const [status, setStatus] = useState<CloudSyncStatus>("unconfigured");
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [manualSyncing, setManualSyncing] = useState(false);
  const subscribedRef = useRef(false);

  // Subscribe to status changes from supabase module
  useEffect(() => {
    const update = () => {
      setStatus(getCloudStatus());
      setLastSyncAt(getLastSyncAt());
      setLastError(getLastError());
    };
    update();
    const unsubscribe = subscribeToCloudStatus(update);
    subscribedRef.current = true;
    return () => {
      unsubscribe();
      subscribedRef.current = false;
    };
  }, []);

  // Detect credentials changes — now read from env vars, but we still
  // want to trigger an initial load when the component mounts.
  useEffect(() => {
    if (isSupabaseConfigured() && status === "unconfigured") {
      setStatus("connecting");
      loadFromCloud().catch((err) => {
        console.error("[CloudSyncButton] Initial load failed:", err);
      });
    } else if (!isSupabaseConfigured() && status !== "unconfigured") {
      setStatus("unconfigured");
    }
    // Re-check on every render (env vars are static, so this is just for safety)
  }, [status]);

  const handleManualSync = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      toast({
        title: "Cloud non configurato",
        description: "Configura NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY nel file .env.local e riavvia l'app.",
        variant: "destructive",
      });
      return;
    }
    setManualSyncing(true);
    try {
      await loadFromCloud();
      await forceCloudSync();
      toast({
        title: "Sincronizzazione completata",
        description: "I dati sono ora allineati tra tutti i dispositivi.",
      });
    } catch (err: any) {
      toast({
        title: "Errore di sincronizzazione",
        description: err?.message || "Riprova tra qualche secondo.",
        variant: "destructive",
      });
    } finally {
      setManualSyncing(false);
    }
  }, [toast]);

  // Render icon + color based on status
  let Icon: any = Cloud;
  let iconColor = "text-muted-foreground";
  let title = "Sincronizzazione cloud";
  let pulse = false;

  switch (status) {
    case "unconfigured":
      Icon = CloudOff;
      iconColor = "text-muted-foreground hover:text-red-400";
      title = "⚠️ Cloud non configurato — configura .env.local o i dati saranno persi cambiando dispositivo";
      break;
    case "connecting":
      Icon = Loader2;
      iconColor = "text-amber-400";
      title = "Connessione al cloud in corso...";
      pulse = true;
      break;
    case "syncing":
      Icon = Loader2;
      iconColor = "text-amber-400";
      title = "Sincronizzazione in corso...";
      break;
    case "synced":
      Icon = CheckCircle2;
      iconColor = "text-emerald-400";
      title = "Cloud sincronizzato";
      break;
    case "error":
      Icon = AlertCircle;
      iconColor = "text-red-400";
      title = "Errore di sincronizzazione — clicca per i dettagli";
      pulse = true;
      break;
  }

  const formatLastSync = (iso: string | null): string => {
    if (!iso) return "mai";
    try {
      const date = new Date(iso);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return "adesso";
      if (diffMin < 60) return `${diffMin} min fa`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr} h fa`;
      return date.toLocaleDateString(locale === "it" ? "it-IT" : "en-US", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`relative h-8 w-8 ${iconColor} ${pulse ? "animate-pulse" : ""}`}
          title={title}
        >
          <Icon className={`h-4 w-4 ${status === "syncing" || status === "connecting" ? "animate-spin" : ""}`} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-4" align="end">
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center gap-2">
            <Icon className={`h-4 w-4 ${iconColor} ${status === "syncing" || status === "connecting" ? "animate-spin" : ""}`} />
            <span className="text-sm font-medium text-foreground">Sincronizzazione Cloud</span>
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Stato</span>
              <StatusBadge status={status} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Ultimo sync</span>
              <span className="text-xs font-mono text-foreground">{formatLastSync(lastSyncAt)}</span>
            </div>
          </div>

          {/* Error details */}
          {status === "error" && lastError && (
            <div className="p-2 rounded-md bg-red-500/10 border border-red-500/30">
              <p className="text-[11px] text-red-400">{lastError}</p>
            </div>
          )}

          {/* Setup hint */}
          {status === "unconfigured" && (
            <div className="p-2 rounded-md bg-red-500/10 border border-red-500/30">
              <p className="text-[11px] text-red-400 leading-relaxed">
                ⚠️ <strong>Cloud non configurato.</strong> Apri il file
                <code className="px-1 py-0.5 rounded bg-secondary/50 text-foreground mx-1">.env.local</code>
                e inserisci le credenziali Supabase nei campi
                <code className="px-1 py-0.5 rounded bg-secondary/50 text-foreground mx-1">NEXT_PUBLIC_SUPABASE_URL</code>
                e
                <code className="px-1 py-0.5 rounded bg-secondary/50 text-foreground ml-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>,
                poi riavvia l'app. Senza cloud, i dati saranno persi cambiando dispositivo.
              </p>
            </div>
          )}

          {/* Manual sync button */}
          {status !== "unconfigured" && (
            <Button
              onClick={handleManualSync}
              disabled={manualSyncing}
              size="sm"
              variant="outline"
              className="w-full"
            >
              {manualSyncing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Sincronizzazione...
                </>
              ) : (
                <>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Forza sincronizzazione
                </>
              )}
            </Button>
          )}

          {/* Help link */}
          <p className="text-[10px] text-muted-foreground/70 text-center pt-1">
            {status === "synced"
              ? "I tuoi dati sono sincronizzati su tutti i dispositivi."
              : "Configura .env.local per attivare il sync multi-device."}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function StatusBadge({ status }: { status: CloudSyncStatus }) {
  const map: Record<CloudSyncStatus, { label: string; cls: string }> = {
    unconfigured: { label: "Non configurato", cls: "text-muted-foreground bg-secondary/50" },
    connecting: { label: "Connessione...", cls: "text-amber-400 bg-amber-500/10" },
    syncing: { label: "Sincronizzazione...", cls: "text-amber-400 bg-amber-500/10" },
    synced: { label: "Sincronizzato", cls: "text-emerald-400 bg-emerald-500/10" },
    error: { label: "Errore", cls: "text-red-400 bg-red-500/10" },
  };
  const { label, cls } = map[status];
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded ${cls} font-medium`}>
      {label}
    </span>
  );
}
