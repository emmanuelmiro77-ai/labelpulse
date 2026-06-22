"use client";

/**
 * CloudRecovery — Diagnostica & Ripristino sync cloud.
 *
 * Questo componente è la "cassetta degli attrezzi" per risolvere problemi di
 * sincronizzazione cloud. Mostra:
 *   - Stato locale (quanti label, quanti con rankByGenre, snapshots, artisti)
 *   - Stato cloud (stessi metrici, più lastSavedAt)
 *   - Stato sidecar (profile backup, snapshots backup)
 *
 * Azioni disponibili:
 *   - "Unisci cloud + locale" — run mergeCloudData, push result to cloud
 *   - "Sovrascrivi cloud con locale" — push local → cloud (destructive su cloud)
 *   - "Sovrascrivi locale con cloud" — pull cloud → local (destructive su local)
 *   - "Ripristina da sidecar" — restore profile + snapshots da backup locali
 *   - "Scarica backup JSON" — download completo dei dati locali
 *
 * Mostrato nel tab Profilo, sotto la sezione "Sincronizzazione Cloud".
 */

import { useEffect, useState, useCallback } from "react";
import {
  RefreshCw, Upload, Download, AlertTriangle, CheckCircle2,
  Database, Cloud, HardDrive, Loader2, RotateCcw, FileDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAppStore, restoreProfileFromSidecar, restoreSnapshotsFromSidecar } from "@/lib/store";
import {
  getMainCloudSyncInfo, getArtistsCloudSyncInfo,
  forcePushLocalToCloud, forcePullCloudToLocal,
  explicitMergeLocalAndCloud, isSupabaseConfigured,
} from "@/lib/supabase";

interface LocalState {
  labels: number;
  labelsWithRankings: number;
  snapshots: number;
  demos: number;
  artists: number;
  profileHasData: boolean;
  lastSavedAt: string | null;
}

interface CloudState {
  labels: number;
  labelsWithRankings: number;
  snapshots: number;
  demos: number;
  profileHasData: boolean;
  lastSavedAt: string | null;
}

interface ArtistsCloudState {
  count: number;
  savedAt: string | null;
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "mai";
  try {
    const ts = new Date(iso).getTime();
    const now = Date.now();
    const diffMs = now - ts;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "adesso";
    if (diffMin < 60) return `${diffMin} min fa`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h fa`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 30) return `${diffD}g fa`;
    return new Date(iso).toLocaleDateString("it-IT");
  } catch {
    return iso;
  }
}

export function CloudRecovery() {
  const { toast } = useToast();
  const [localState, setLocalState] = useState<LocalState | null>(null);
  const [cloudState, setCloudState] = useState<CloudState | null>(null);
  const [artistsCloud, setArtistsCloud] = useState<ArtistsCloudState | null>(null);
  const [sidecarProfile, setSidecarProfile] = useState<boolean>(false);
  const [sidecarSnapshots, setSidecarSnapshots] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<null | "push" | "pull" | "merge">(null);

  const configured = isSupabaseConfigured();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // Local state
      const s = useAppStore.getState();
      const labels = s.labels || [];
      const labelsWithRankings = labels.filter(
        (l: any) => l && typeof l.rankByGenre === "object" && Object.keys(l.rankByGenre || {}).length > 0
      ).length;
      const profile = s.userProfile || {};
      const profileHasData =
        !!profile.artistName || !!profile.bio || !!profile.email ||
        !!profile.scLink || !!profile.photoUrl ||
        (Array.isArray(profile.links) && profile.links.length > 0);
      setLocalState({
        labels: labels.length,
        labelsWithRankings,
        snapshots: (s.rankingSnapshots || []).length,
        demos: (s.demos || []).length,
        artists: (s.artists || []).length,
        profileHasData,
        lastSavedAt: s.lastSavedAt || null,
      });

      // Sidecar state
      try {
        const sideProfileRaw = localStorage.getItem("labelpulse-profile-backup");
        const sideSnapsRaw = localStorage.getItem("labelpulse-snapshots-backup");
        if (sideProfileRaw) {
          try {
            const p = JSON.parse(sideProfileRaw);
            const prof = p?.userProfile || p?.state?.userProfile;
            setSidecarProfile(!!prof && (!!prof.artistName || !!prof.email || !!prof.bio));
          } catch { setSidecarProfile(false); }
        } else {
          setSidecarProfile(false);
        }
        if (sideSnapsRaw) {
          try {
            const sn = JSON.parse(sideSnapsRaw);
            const arr = Array.isArray(sn) ? sn : (sn?.rankingSnapshots || sn?.state?.rankingSnapshots || []);
            setSidecarSnapshots(Array.isArray(arr) ? arr.length : 0);
          } catch { setSidecarSnapshots(0); }
        } else {
          setSidecarSnapshots(0);
        }
      } catch {
        setSidecarProfile(false);
        setSidecarSnapshots(0);
      }

      // Cloud state (if configured)
      if (configured) {
        const [mainInfo, artistsInfo] = await Promise.all([
          getMainCloudSyncInfo(),
          getArtistsCloudSyncInfo(),
        ]);
        setCloudState(mainInfo);
        setArtistsCloud(artistsInfo);
      } else {
        setCloudState(null);
        setArtistsCloud(null);
      }
    } catch (e) {
      console.warn("[CloudRecovery] refresh failed:", e);
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleAction = async (action: "push" | "pull" | "merge" | "sidecar") => {
    setActionLoading(action);
    try {
      if (action === "push") {
        const ok = await forcePushLocalToCloud();
        toast({
          title: ok ? "Cloud aggiornato" : "Errore",
          description: ok
            ? "I dati locali hanno sovrascritto il cloud."
            : "Impossibile caricare i dati sul cloud. Riprova.",
          variant: ok ? "default" : "destructive",
        });
      } else if (action === "pull") {
        const ok = await forcePullCloudToLocal();
        toast({
          title: ok ? "Locale aggiornato" : "Errore",
          description: ok
            ? "I dati del cloud hanno sovrascritto il locale."
            : "Impossibile scaricare i dati dal cloud. Riprova.",
          variant: ok ? "default" : "destructive",
        });
      } else if (action === "merge") {
        const result = await explicitMergeLocalAndCloud();
        toast({
          title: result.ok ? "Merge completato" : "Errore",
          description: result.summary,
          variant: result.ok ? "default" : "destructive",
        });
      } else if (action === "sidecar") {
        const p = restoreProfileFromSidecar();
        const sn = restoreSnapshotsFromSidecar();
        toast({
          title: "Ripristino sidecar",
          description: `Profilo: ${p ? "OK" : "niente"}, Snapshot: ${sn} recuperati.`,
        });
      }
      await refresh();
    } catch (e: any) {
      toast({
        title: "Errore",
        description: e?.message || "Operazione fallita.",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
      setConfirmAction(null);
    }
  };

  const handleDownloadBackup = () => {
    const s = useAppStore.getState();
    const backup = {
      exportedAt: new Date().toISOString(),
      version: "2.1",
      state: {
        labels: s.labels,
        demos: s.demos,
        userProfile: s.userProfile,
        rankingSnapshots: s.rankingSnapshots,
        rankingsUpdatedAt: s.rankingsUpdatedAt,
        lastSavedAt: s.lastSavedAt,
        locale: s.locale,
      },
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `labelpulse_FULL_backup_${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "Backup scaricato", description: "Salva questo file in un posto sicuro." });
  };

  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          Diagnosi & Ripristino Sync
        </CardTitle>
        <CardDescription>
          Cosa c&apos;è realmente nel tuo browser, nel cloud, e nei backup di emergenza.
          Usa queste azioni se after login vedi &quot;niente classifiche&quot; o &quot;niente artisti&quot;.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!configured && (
          <div className="rounded-md bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-400">
            Cloud non configurato. Configura Supabase URL + anon key sopra
            prima di poter usare le azioni di sync.
          </div>
        )}

        {/* Diagnostica stato */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Locale */}
          <div className="rounded-md bg-secondary/30 p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <HardDrive className="h-3.5 w-3.5 text-cyan-400" />
              Locale (questo browser)
            </div>
            {loading && !localState ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : localState ? (
              <div className="space-y-1 text-xs text-muted-foreground">
                <StatRow label="Label totali" value={localState.labels} />
                <StatRow label="Label con classifiche" value={localState.labelsWithRankings} highlight={localState.labelsWithRankings === 0} />
                <StatRow label="Snapshot storici" value={localState.snapshots} highlight={localState.snapshots === 0} />
                <StatRow label="Demo" value={localState.demos} />
                <StatRow label="Artisti" value={localState.artists} highlight={localState.artists === 0} />
                <StatRow label="Profilo" value={localState.profileHasData ? "OK" : "vuoto"} highlight={!localState.profileHasData} />
                <StatRow label="Ultimo salvataggio" value={formatRelativeTime(localState.lastSavedAt)} />
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">Niente dati</div>
            )}
          </div>

          {/* Cloud */}
          <div className="rounded-md bg-secondary/30 p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <Cloud className="h-3.5 w-3.5 text-purple-400" />
              Cloud (Supabase)
            </div>
            {!configured ? (
              <div className="text-xs text-muted-foreground">Non configurato</div>
            ) : loading && !cloudState ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : cloudState ? (
              <div className="space-y-1 text-xs text-muted-foreground">
                <StatRow label="Label totali" value={cloudState.labels} />
                <StatRow label="Label con classifiche" value={cloudState.labelsWithRankings} highlight={cloudState.labelsWithRankings === 0} />
                <StatRow label="Snapshot storici" value={cloudState.snapshots} highlight={cloudState.snapshots === 0} />
                <StatRow label="Demo" value={cloudState.demos} />
                <StatRow label="Artisti (riga separata)" value={artistsCloud?.count ?? 0} highlight={(artistsCloud?.count ?? 0) === 0} />
                <StatRow label="Profilo" value={cloudState.profileHasData ? "OK" : "vuoto"} highlight={!cloudState.profileHasData} />
                <StatRow label="Ultimo sync" value={formatRelativeTime(cloudState.lastSavedAt)} />
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">Impossibile leggere</div>
            )}
          </div>

          {/* Sidecar (backup di emergenza) */}
          <div className="rounded-md bg-secondary/30 p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <Database className="h-3.5 w-3.5 text-amber-400" />
              Backup emergenza (sidecar)
            </div>
            <div className="space-y-1 text-xs text-muted-foreground">
              <StatRow label="Profilo backup" value={sidecarProfile ? "OK" : "vuoto"} highlight={!sidecarProfile} />
              <StatRow label="Snapshot backup" value={sidecarSnapshots} highlight={sidecarSnapshots === 0} />
            </div>
            <div className="text-[10px] text-muted-foreground/70 pt-1 border-t border-border/30 mt-2">
              Questi backup vivono in localStorage e sopravvivono anche se il cloud o lo store principale vengono wipeati.
            </div>
          </div>
        </div>

        {/* Azioni */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-border/30">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirmAction("merge")}
            disabled={!configured || actionLoading !== null}
            className="gap-1.5"
          >
            {actionLoading === "merge" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Unisci cloud + locale
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirmAction("push")}
            disabled={!configured || actionLoading !== null}
            className="gap-1.5"
          >
            {actionLoading === "push" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Sovrascrivi cloud con locale
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirmAction("pull")}
            disabled={!configured || actionLoading !== null}
            className="gap-1.5"
          >
            {actionLoading === "pull" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Sovrascrivi locale con cloud
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleAction("sidecar")}
            disabled={actionLoading !== null}
            className="gap-1.5"
          >
            {actionLoading === "sidecar" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Ripristina da sidecar
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleDownloadBackup}
            disabled={actionLoading !== null}
            className="gap-1.5"
          >
            <FileDown className="h-3.5 w-3.5" />
            Scarica backup JSON
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={refresh}
            disabled={loading}
            className="gap-1.5 ml-auto"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Aggiorna
          </Button>
        </div>

        {/* Help text */}
        <div className="text-[11px] text-muted-foreground/70 pt-2 border-t border-border/30">
          <p className="mb-1"><strong>Cosa fare se &quot;non vedo le classifiche&quot; dopo login:</strong></p>
          <ol className="list-decimal list-inside space-y-0.5 ml-2">
            <li>Controlla quanti &quot;Label con classifiche&quot; hai in locale vs cloud.</li>
            <li>Se cloud ne ha di più → clicca &quot;Unisci cloud + locale&quot; (NON sovrascrivere).</li>
            <li>Se cloud è vuoto → clicca &quot;Sovrascrivi cloud con locale&quot; per fare backup.</li>
            <li>Se entrambi vuoti → usa &quot;Ripristina da sidecar&quot; per recuperare dai backup di emergenza.</li>
            <li>Se ancora niente → &quot;Scarica backup JSON&quot; e mandalo al supporto, poi rifai il login.</li>
          </ol>
        </div>
      </CardContent>

      {/* Confirm dialog */}
      <AlertDialog open={confirmAction !== null} onOpenChange={(o) => !o && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === "push" && "Sovrascrivere il cloud con i dati locali?"}
              {confirmAction === "pull" && "Sovrascrivere i dati locali con il cloud?"}
              {confirmAction === "merge" && "Unire cloud e locale?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === "push" && (
                "I dati nel cloud verranno completamente sostituiti con quelli che hai adesso su questo browser. " +
                "Se su altri dispositivi hai dati più aggiornati, andranno persi. " +
                "Consigliato solo se sai che il locale ha i dati migliori."
              )}
              {confirmAction === "pull" && (
                "I dati locali verranno completamente sostituiti con quelli del cloud. " +
                "Se hai modifiche locali non ancora sincronizzate, andranno perse. " +
                "Consigliato solo se sai che il cloud ha i dati migliori."
              )}
              {confirmAction === "merge" && (
                "Verrà eseguito un merge intelligente: le label vengono unite per id, " +
                "i campi Beatport vengono mergiati per genere (locale vince per i generi che ha), " +
                "gli snapshot vengono uniti per id. Il risultato verrà poi spinto al cloud. " +
                "È l&apos;operazione più sicura — non perde dati da nessuna parte."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmAction && handleAction(confirmAction)}
              className={
                confirmAction === "merge"
                  ? "bg-cyan-500 hover:bg-cyan-600 text-white"
                  : "bg-amber-500 hover:bg-amber-600 text-white"
              }
            >
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              Conferma
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function StatRow({
  label, value, highlight,
}: { label: string; value: number | string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground/70">{label}</span>
      <span className={`font-mono ${highlight ? "text-red-400 font-semibold" : "text-foreground/90"}`}>
        {value}
      </span>
    </div>
  );
}
