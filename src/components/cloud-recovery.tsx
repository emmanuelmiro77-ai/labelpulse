"use client";

/**
 * CloudRecovery — Diagnostica sync cloud (v2 — post migrazione FASE C/D).
 *
 * 🔒 PERCHÉ RISCRITTO (2026-07-02):
 * La versione precedente leggeva lo stato cloud da `getMainCloudSyncInfo()` /
 * `getArtistsCloudSyncInfo()` in src/lib/supabase.ts, che interrogano la riga
 * PERSONALE della vecchia tabella `app_state`. Quella riga non viene più
 * scritta da FASE D in poi (vedi OLD_APP_STATE_SYNC_DISABLED in store.ts) —
 * quindi il pannello mostrava SEMPRE "0" su tutto lato cloud, anche quando i
 * dati reali erano sani e al sicuro nelle 5 tabelle dedicate. Falso allarme,
 * e i pulsanti "Sovrascrivi cloud/locale" agivano sul sistema morto: inutili
 * nella migliore delle ipotesi, fuorvianti nella peggiore.
 *
 * Ora il pannello legge `/api/sync-status`, che interroga le tabelle vere
 * (demo_submissions, label_personal_data, pitch_campaigns, user_profiles,
 * user_releases) — la sola fonte di verità secondo REGOLA ZERO.
 */

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  RefreshCw, CheckCircle2,
  Database, Cloud, HardDrive, Loader2, RotateCcw, FileDown, UploadCloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  useAppStore, restoreProfileFromSidecar, restoreSnapshotsFromSidecar,
  restoreArtistsFromSidecar, loadFromNewTables,
} from "@/lib/store";
import { isSupabaseConfigured } from "@/lib/supabase";

interface LocalState {
  labels: number;
  labelsWithRankings: number;
  snapshots: number;
  demos: number;
  artists: number;
  profileHasData: boolean;
  lastSavedAt: string | null;
}

interface CloudSyncStatus {
  demos: number;
  labelPersonalData: number;
  pitchDrafts: number;
  pitchSent: number;
  releases: number;
  profileHasData: boolean;
  lastUpdatedAt: string | null;
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

export function CloudRecovery({ isAdmin = false }: { isAdmin?: boolean }) {
  const { toast } = useToast();
  const [localState, setLocalState] = useState<LocalState | null>(null);
  const [cloudState, setCloudState] = useState<CloudSyncStatus | null>(null);
  const [sidecarProfile, setSidecarProfile] = useState<boolean>(false);
  const [sidecarSnapshots, setSidecarSnapshots] = useState<number>(0);
  const [sidecarArtists, setSidecarArtists] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const { data: session, status } = useSession();
  const email = session?.user?.email || null;

  const configured = isSupabaseConfigured();

  const refresh = useCallback(async () => {
    setLoading(true);
    setCloudError(null);
    try {
      // Stato locale
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

      // Sidecar (backup di emergenza locali)
      try {
        const sideProfileRaw = localStorage.getItem("labelpulse-profile-backup");
        const sideSnapsRaw = localStorage.getItem("labelpulse-snapshots-backup");
        const sideArtistsRaw = localStorage.getItem("labelpulse-artists-backup");
        if (sideProfileRaw) {
          try {
            const p = JSON.parse(sideProfileRaw);
            const prof = p?.userProfile || p?.state?.userProfile;
            setSidecarProfile(!!prof && (!!prof.artistName || !!prof.email || !!prof.bio));
          } catch { setSidecarProfile(false); }
        } else setSidecarProfile(false);
        if (sideSnapsRaw) {
          try {
            const sn = JSON.parse(sideSnapsRaw);
            const arr = Array.isArray(sn) ? sn : (sn?.rankingSnapshots || sn?.state?.rankingSnapshots || []);
            setSidecarSnapshots(Array.isArray(arr) ? arr.length : 0);
          } catch { setSidecarSnapshots(0); }
        } else setSidecarSnapshots(0);
        if (sideArtistsRaw) {
          try {
            const ar = JSON.parse(sideArtistsRaw);
            const arr = ar?.artists;
            setSidecarArtists(Array.isArray(arr) ? arr.length : 0);
          } catch { setSidecarArtists(0); }
        } else setSidecarArtists(0);
      } catch {
        setSidecarProfile(false);
        setSidecarSnapshots(0);
        setSidecarArtists(0);
      }

      // Stato cloud VERO — dalle 5 tabelle dedicate
      if (configured && email && status === "authenticated") {
        try {
          const res = await fetch("/api/sync-status");
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          setCloudState({
            demos: data.demos ?? 0,
            labelPersonalData: data.labelPersonalData ?? 0,
            pitchDrafts: data.pitchDrafts ?? 0,
            pitchSent: data.pitchSent ?? 0,
            releases: data.releases ?? 0,
            profileHasData: !!data.profileHasData,
            lastUpdatedAt: data.lastUpdatedAt ?? null,
          });
          setCloudError(null);
        } catch (err: any) {
          setCloudState(null);
          setCloudError(err?.message || String(err));
        }
      } else {
        setCloudState(null);
        if (configured && status !== "authenticated") {
          setCloudError("Utente non autenticato. Accedi con Google per leggere il cloud.");
        } else {
          setCloudError(null);
        }
      }
    } catch (e) {
      console.warn("[CloudRecovery] refresh failed:", e);
    } finally {
      setLoading(false);
    }
  }, [configured, email, status]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleForceReloadFromCloud = async () => {
    setActionLoading("reload");
    try {
      await loadFromNewTables();
      toast({
        title: "Ricaricato dal cloud",
        description: "Demo, label personalizzate, pitch, profilo e release sono stati ricaricati dalle tabelle Supabase — questa è sempre la versione più aggiornata.",
      });
      await refresh();
    } catch (e: any) {
      toast({ title: "Errore", description: e?.message || "Ricaricamento fallito.", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleSidecarRestore = async () => {
    setActionLoading("sidecar");
    try {
      const p = restoreProfileFromSidecar();
      const sn = restoreSnapshotsFromSidecar();
      const ar = restoreArtistsFromSidecar();
      toast({
        title: "Ripristino sidecar",
        description: `Profilo: ${p ? "OK" : "niente"}, Snapshot: ${sn} recuperati, Artisti: ${ar} recuperati.`,
      });
      await refresh();
    } catch (e: any) {
      toast({ title: "Errore", description: e?.message || "Operazione fallita.", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handlePushRankings = async () => {
    setActionLoading("push-rankings");
    try {
      const state = useAppStore.getState();
      const labelsWithRank = state.labels.filter(
        (l: any) => l.rankByGenre && Object.keys(l.rankByGenre).length > 0
      );

      if (labelsWithRank.length === 0) {
        toast({
          title: "Niente da pushare",
          description: "Non ci sono label con classifiche nello store locale.",
          variant: "destructive",
        });
        return;
      }

      const res = await fetch("/api/admin/push-rankings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          labels: labelsWithRank,
          rankingSnapshots: state.rankingSnapshots,
          rankingsUpdatedAt: state.rankingsUpdatedAt || new Date().toISOString(),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({
          title: `Push fallito (HTTP ${res.status})`,
          description: err?.error || "Errore sconosciuto. Verifica SUPABASE_SERVICE_ROLE_KEY su Vercel.",
          variant: "destructive",
        });
        return;
      }

      const data = await res.json();
      toast({
        title: "✅ Classifiche pushate al cloud",
        description: `${data.labelsPushed} label + ${data.snapshotsPushed} snapshot salvati nella riga globale.`,
      });
      await refresh();
    } catch (e: any) {
      toast({ title: "Errore di rete", description: e?.message || "Operazione fallita.", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDownloadBackup = () => {
    const s = useAppStore.getState();
    const backup = {
      exportedAt: new Date().toISOString(),
      version: "2.4",
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
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          Diagnosi Sync Cloud
        </CardTitle>
        <CardDescription>
          Il cloud (Supabase) è l&apos;unica fonte di verità: qualsiasi modifica fatta su un dispositivo
          arriva qui e viene ricaricata su ogni altro dispositivo collegato con la stessa email.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!configured && (
          <div className="rounded-md bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-400">
            Cloud non configurato. Configura Supabase URL + anon key prima di poter usare le azioni di sync.
          </div>
        )}

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
                <StatRow label="Profilo" value={localState.profileHasData ? "OK" : "vuoto"} highlight={!localState.profileHasData} />
                <StatRow label="Ultima modifica" value={formatRelativeTime(localState.lastSavedAt)} />
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">Niente dati</div>
            )}
          </div>

          {/* Cloud — VERO, dalle 5 tabelle dedicate */}
          <div className="rounded-md bg-secondary/30 p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <Cloud className="h-3.5 w-3.5 text-purple-400" />
              Cloud (Supabase — fonte di verità)
            </div>
            {!configured ? (
              <div className="text-xs text-muted-foreground">Non configurato</div>
            ) : loading && !cloudState ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : cloudState ? (
              <div className="space-y-1 text-xs text-muted-foreground">
                <StatRow label="Demo" value={cloudState.demos} />
                <StatRow label="Label personalizzate" value={cloudState.labelPersonalData} />
                <StatRow label="Pitch (bozze)" value={cloudState.pitchDrafts} />
                <StatRow label="Pitch (inviati)" value={cloudState.pitchSent} />
                <StatRow label="Release / EP" value={cloudState.releases} />
                <StatRow label="Profilo" value={cloudState.profileHasData ? "OK" : "vuoto"} highlight={!cloudState.profileHasData} />
                <StatRow label="Ultima modifica cloud" value={formatRelativeTime(cloudState.lastUpdatedAt)} />
              </div>
            ) : cloudError ? (
              <div className="text-xs text-destructive-foreground whitespace-pre-wrap break-words">
                Errore cloud: {cloudError}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">Impossibile leggere</div>
            )}
          </div>

          {/* Sidecar (backup di emergenza, solo classifiche/artisti/profilo — non i dati personali cloud) */}
          <div className="rounded-md bg-secondary/30 p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <Database className="h-3.5 w-3.5 text-amber-400" />
              Backup emergenza (sidecar)
            </div>
            <div className="space-y-1 text-xs text-muted-foreground">
              <StatRow label="Profilo backup" value={sidecarProfile ? "OK" : "vuoto"} highlight={!sidecarProfile} />
              <StatRow label="Snapshot backup" value={sidecarSnapshots} highlight={sidecarSnapshots === 0} />
              <StatRow label="Artisti backup" value={sidecarArtists} highlight={sidecarArtists === 0} />
            </div>
            <div className="text-[10px] text-muted-foreground/70 pt-1 border-t border-border/30 mt-2">
              Backup di emergenza SOLO per classifiche/artisti/profilo (riga globale). I tuoi dati
              personali (demo, pitch, label personalizzate) vivono esclusivamente nelle tabelle cloud qui sopra.
            </div>
          </div>
        </div>

        {/* Azioni */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-border/30">
          <Button
            size="sm"
            variant="outline"
            onClick={handleForceReloadFromCloud}
            disabled={!configured || actionLoading !== null}
            className="gap-1.5"
          >
            {actionLoading === "reload" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Ricarica dal cloud (versione più recente)
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleSidecarRestore}
            disabled={actionLoading !== null}
            className="gap-1.5"
          >
            {actionLoading === "sidecar" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Ripristina classifiche/artisti da sidecar
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handlePushRankings}
            disabled={actionLoading !== null}
            className="gap-1.5 border-emerald-500/40 text-emerald-400"
          >
            {actionLoading === "push-rankings" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />}
            Push classifiche al cloud (admin)
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

        <div className="text-[11px] text-muted-foreground/70 pt-2 border-t border-border/30">
          <p className="mb-1"><strong>Come funziona ora:</strong></p>
          <ol className="list-decimal list-inside space-y-0.5 ml-2">
            <li>Ogni modifica che fai (demo, pitch, note su una label, profilo, release) viene inviata subito al cloud.</li>
            <li>Il cloud è sempre la versione ufficiale: al login su un altro dispositivo, o cliccando &quot;Ricarica dal cloud&quot;, vedi sempre l&apos;ultima modifica fatta, da qualunque dispositivo sia arrivata.</li>
            <li>Se una modifica non riesce al primo tentativo (rete assente), vedrai un toast di errore esplicito: ritenta manualmente appena possibile.</li>
          </ol>
        </div>
      </CardContent>
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
