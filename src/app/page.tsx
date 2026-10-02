"use client";

import { useAppStore, loadFromCloud, forceCloudSync, loadArtistsOnBoot, loadFromNewTables } from "@/lib/store";
import { useRealtimeSync } from "@/hooks/use-realtime-sync";
import { t, LOCALE_NAMES, LOCALE_FLAGS, type Locale } from "@/lib/i18n";
import { useAuthEffect } from "@/lib/use-auth";
import { useProfileAutosave } from "@/lib/use-profile-autosave";
import { useSession } from "next-auth/react";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  BarChart3,
  Music2,
  History,
  User,
  Menu,
  X,
  HelpCircle,
  Globe,
  Loader2,
  AlertTriangle,
  CloudOff,
  Disc3,
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { LabelFinder } from "@/components/label-finder";
import { HelpModal } from "@/components/help-modal";
import { DataBackup } from "@/components/data-backup";
import { AutoSave } from "@/components/auto-save";
import { RankingsPage } from "@/components/rankings-page";
import { ProducerProfile } from "@/components/producer-profile";
import { CloudSyncButton } from "@/components/cloud-sync-button";
import { BackupIndicator } from "@/components/backup-indicator";
import { AuthButton } from "@/components/auth-button";

const NAV_KEYS = [
  { id: "rankings" as const, labelKey: "nav.rankings" as const, icon: BarChart3 },
  { id: "history" as const, labelKey: "nav.rankings" as const, icon: History },
  { id: "labels" as const, labelKey: "nav.labels" as const, icon: Music2 },
  { id: "profile" as const, labelKey: "nav.profile" as const, icon: User },
];

const SECTION_TITLES = {
  rankings: "rankings.title",
  history: "rankings.title",
  labels: "labels.title",
  profile: "profile.title",
} as const;

const SECTION_SUBTITLES = {
  rankings: "rankings.subtitle",
  history: "rankings.subtitle",
  labels: "labels.subtitle",
  profile: "profile.subtitle",
} as const;

export default function Home() {
  const { activeTab, setActiveTab, locale, setLocale, hasRehydrated, rankingsUpdatedAt } = useAppStore();
  const { status: authStatus } = useSession();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useAuthEffect();
  useProfileAutosave();
  useRealtimeSync();

  useEffect(() => {
    if (hasRehydrated) {
      loadArtistsOnBoot();
    }
  }, [hasRehydrated]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") forceCloudSync();
    };
    const handleBeforeUnload = () => forceCloudSync();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  if (!hasRehydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
          <span className="text-sm text-muted-foreground font-mono">Loading LabelPulse...</span>
        </div>
      </div>
    );
  }

  if (!isSupabaseConfigured()) {
    return <CloudNotConfiguredScreen />;
  }

  // Default to "rankings" tab if current tab is no longer in NAV_KEYS
  const validTabs = NAV_KEYS.map((n) => n.id);
  const currentTab = validTabs.includes(activeTab as any) ? activeTab : "rankings";

  const handleNav = (tab: typeof activeTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch { return "—"; }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/30 bg-background/80 backdrop-blur-xl">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3">
          <div className="flex items-center gap-3">
            {/* VU Meter */}
            <div className="flex items-end gap-[3px] h-7 w-7 shrink-0">
              <div className="vu-bar w-[4px] rounded-sm bg-primary" style={{ animationDuration: "1.1s" }} />
              <div className="vu-bar w-[4px] rounded-sm bg-primary/80" style={{ animationDuration: "0.8s" }} />
              <div className="vu-bar w-[4px] rounded-sm bg-cyan-glow" style={{ animationDuration: "1s" }} />
              <div className="vu-bar w-[4px] rounded-sm bg-primary/80" style={{ animationDuration: "0.7s" }} />
              <div className="vu-bar w-[4px] rounded-sm bg-primary" style={{ animationDuration: "0.9s" }} />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-foreground">
                LabelPulse
              </h1>
              <p className="text-[10px] text-muted-foreground font-mono tracking-widest uppercase -mt-0.5">
                Beatport Rankings Tracker
              </p>
            </div>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_KEYS.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNav(item.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? "bg-primary/15 text-primary glow-purple"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.id === "history"
                    ? (locale === "it" ? "Storico" : "History")
                    : t(locale, item.labelKey)}
                </button>
              );
            })}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground hover:text-foreground hidden md:inline-flex">
                  <Globe className="h-3.5 w-3.5" />
                  <span>{LOCALE_FLAGS[locale]} {LOCALE_NAMES[locale]}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-1" align="end">
                {(Object.keys(LOCALE_NAMES) as Locale[]).map((loc) => (
                  <button
                    key={loc}
                    onClick={() => setLocale(loc)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                      locale === loc
                        ? "bg-primary/15 text-primary font-semibold"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                    }`}
                  >
                    <span className="text-base">{LOCALE_FLAGS[loc]}</span>
                    {LOCALE_NAMES[loc]}
                  </button>
                ))}
              </PopoverContent>
            </Popover>

            <div className="hidden md:flex items-center gap-2">
              <BackupIndicator />
              <CloudSyncButton />
            </div>

            <AuthButton />

            <div className="hidden md:block">
              <DataBackup />
            </div>

            <div className="hidden md:block">
              <AutoSave />
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-amber-400 hidden md:inline-flex"
              onClick={() => setHelpOpen(true)}
              title={t(locale, "nav.help")}
            >
              <HelpCircle className="h-5 w-5" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Nav */}
        {mobileMenuOpen && (
          <nav className="md:hidden border-t border-border/30 bg-background/95 backdrop-blur-xl">
            <div className="flex flex-col p-2">
              {NAV_KEYS.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNav(item.id)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                      isActive ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.id === "history"
                      ? (locale === "it" ? "Storico" : "History")
                      : t(locale, item.labelKey)}
                  </button>
                );
              })}

              <div className="my-2 border-t border-border/30" />

              <div className="flex flex-col gap-1 px-2 py-1">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground px-2 pb-1">
                  {locale === "it" ? "Strumenti e account" : "Tools & account"}
                </div>

                <Popover>
                  <PopoverTrigger asChild>
                    <button className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50">
                      <Globe className="h-4 w-4" />
                      {LOCALE_FLAGS[locale]} {LOCALE_NAMES[locale]}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-1" align="start">
                    {(Object.keys(LOCALE_NAMES) as Locale[]).map((loc) => (
                      <button
                        key={loc}
                        onClick={() => setLocale(loc)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                          locale === loc
                            ? "bg-primary/15 text-primary font-semibold"
                            : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                        }`}
                      >
                        <span className="text-base">{LOCALE_FLAGS[loc]}</span>
                        {LOCALE_NAMES[loc]}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>

                <div className="w-full [&>button]:w-full [&>button]:justify-start [&>button]:gap-3 [&>button]:px-4 [&>button]:py-3 [&>button]:rounded-lg [&>button]:text-sm [&>button]:font-medium [&>button]:text-muted-foreground [&>button:hover]:text-foreground [&>button:hover]:bg-secondary/50">
                  <div className="px-4 py-2">
                    <BackupIndicator />
                  </div>
                  <CloudSyncButton />
                  <DataBackup />
                  <AutoSave />
                </div>

                <button
                  onClick={() => { setHelpOpen(true); setMobileMenuOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-amber-400 hover:bg-secondary/50"
                >
                  <HelpCircle className="h-4 w-4" />
                  {t(locale, "nav.help")}
                </button>
              </div>
            </div>
          </nav>
        )}
      </header>

      {/* Auth banner */}
      {authStatus === "unauthenticated" && hasRehydrated && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 sm:px-6 py-2">
          <div className="max-w-7xl mx-auto flex items-center gap-2 text-xs">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <span className="text-amber-400 flex-1">
              {locale === "it"
                ? "Non sei loggato. I tuoi dati sono salvati solo su questo dispositivo. Clicca \"Accedi\" in alto a destra per sincronizzarli su tutti i tuoi dispositivi."
                : "You are not logged in. Your data is stored only on this device. Click \"Login\" in the top right to sync across all your devices."}
            </span>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 px-4 sm:px-6 py-6 max-w-7xl w-full mx-auto">
        {/* Section Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            {currentTab === "rankings" && <BarChart3 className="h-5 w-5 text-primary" />}
            {currentTab === "history" && <History className="h-5 w-5 text-primary" />}
            {currentTab === "labels" && <Music2 className="h-5 w-5 text-primary" />}
            {currentTab === "profile" && <User className="h-5 w-5 text-primary" />}
            <h2 className="text-xl font-bold text-foreground">
              {currentTab === "history"
                ? (locale === "it" ? "Storico Classifiche" : "Ranking History")
                : t(locale, SECTION_TITLES[currentTab as keyof typeof SECTION_TITLES] || "rankings.title")}
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">
            {currentTab === "history"
              ? (locale === "it" ? "Movimenti delle classifiche nel tempo" : "Chart movements over time")
              : t(locale, SECTION_SUBTITLES[currentTab as keyof typeof SECTION_SUBTITLES] || "rankings.subtitle")}
          </p>
        </div>

        {/* Rankings tab */}
        <div className={currentTab === "rankings" ? "" : "hidden"}>
          <RankingsPage />
        </div>

        {/* History tab — uses rankingSnapshots from store */}
        {currentTab === "history" && (
          <RankingHistoryView />
        )}

        {/* Labels tab — always mounted for overlay dialog support */}
        <div className={currentTab === "labels" ? "" : "hidden"}>
          <LabelFinder />
        </div>

        {/* Profile tab */}
        {currentTab === "profile" && <ProducerProfile />}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-border/20 py-4 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
            <Disc3 className="h-3.5 w-3.5" />
            <span className="font-mono">LabelPulse v2.5</span>
            <span className="text-muted-foreground/20">·</span>
            <a href="/legal" className="hover:text-muted-foreground transition-colors">Privacy</a>
            <a href="/legal" className="hover:text-muted-foreground transition-colors">Termini</a>
            <a href="/legal" className="hover:text-muted-foreground transition-colors">Cookie</a>
            <a href="/account/withdrawal" className="hover:text-muted-foreground transition-colors">Recesso</a>
          </div>
          <p className="text-[10px] text-muted-foreground/30 font-mono">
            {t(locale, "footer.dataStored")}
          </p>
        </div>
      </footer>

      <HelpModal open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}

// ==================== Ranking History View ====================
// Uses rankingSnapshots from the store to display chart movements over time.
// Reuses existing snapshot data — no new persistence layer.

function RankingHistoryView() {
  const { rankingSnapshots, labels, locale } = useAppStore();
  const [selectedSnapshot, setSelectedSnapshot] = useState<string | null>(null);
  const [labelSearch, setLabelSearch] = useState("");

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("it-IT", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
    } catch { return iso; }
  };

  const sortedSnapshots = [...(rankingSnapshots || [])].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  // Find movements for a specific label across snapshots
  const labelMovements = useMemo(() => {
    if (!labelSearch.trim()) return [];
    const search = labelSearch.toLowerCase().trim();
    const movements: { timestamp: string; source: string; genre: string; rank: number; points: number }[] = [];

    for (const snap of sortedSnapshots) {
      for (const [genre, labels] of Object.entries(snap.genres || {})) {
        for (const [labelName, data] of Object.entries(labels)) {
          if (labelName.toLowerCase().includes(search)) {
            movements.push({
              timestamp: snap.timestamp,
              source: snap.source,
              genre,
              rank: (data as any).rank,
              points: (data as any).points || 0,
            });
          }
        }
      }
    }
    return movements.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [labelSearch, sortedSnapshots]);

  if (sortedSnapshots.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground/60">
        <History className="h-12 w-12 mx-auto mb-3 opacity-40" />
        <p className="text-sm">
          {locale === "it" ? "Nessuno storico disponibile." : "No history available."}
        </p>
        <p className="text-xs mt-1">
          {locale === "it"
            ? "Importa le classifiche per iniziare a costruire lo storico."
            : "Import rankings to start building chart history."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Snapshot list */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-3">
          {locale === "it" ? "Aggiornamenti registrati" : "Recorded updates"}
          <span className="ml-2 text-xs text-muted-foreground/70 font-mono">
            {sortedSnapshots.length}
          </span>
        </h3>
        <div className="grid sm:grid-cols-2 gap-2">
          {sortedSnapshots.map((snap) => (
            <div
              key={snap.id}
              className="rounded-lg border border-border/30 bg-card/40 p-3 cursor-pointer hover:border-primary/40 transition-colors"
              onClick={() => setSelectedSnapshot(selectedSnapshot === snap.id ? null : snap.id)}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {formatDate(snap.timestamp)}
                  </p>
                  <p className="text-xs text-muted-foreground/70">
                    {snap.source} · {Object.keys(snap.genres || {}).length} {locale === "it" ? "generi" : "genres"}
                  </p>
                </div>
              </div>
              {selectedSnapshot === snap.id && (
                <div className="mt-3 space-y-1 max-h-48 overflow-y-auto">
                  {Object.entries(snap.genres || {}).slice(0, 10).map(([genre, labelMap]) => (
                    <div key={genre} className="text-xs">
                      <span className="text-primary/70 font-medium">{genre}:</span>{" "}
                      <span className="text-muted-foreground">
                        {Object.keys(labelMap).length} {locale === "it" ? "label" : "labels"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Label search for movements */}
      <div className="rounded-xl border border-border/30 bg-card/40 p-4">
        <h3 className="text-sm font-semibold text-muted-foreground mb-3">
          {locale === "it" ? "Cerca movimenti label" : "Search label movements"}
        </h3>
        <input
          type="text"
          value={labelSearch}
          onChange={(e) => setLabelSearch(e.target.value)}
          placeholder={locale === "it" ? "Nome label..." : "Label name..."}
          className="w-full h-8 px-3 rounded-md border border-border/40 bg-background/60 text-sm mb-3"
        />
        {labelMovements.length > 0 && (
          <div className="space-y-1.5 max-h-96 overflow-y-auto">
            {labelMovements.map((m, i) => {
              const prev = i > 0 ? labelMovements[i - 1] : null;
              const movement = prev && prev.genre === m.genre ? prev.rank - m.rank : null;
              return (
                <div key={i} className="flex items-center justify-between gap-2 rounded-lg border border-border/20 bg-secondary/20 px-3 py-2 text-xs">
                  <div className="flex-1 min-w-0">
                    <span className="text-muted-foreground font-mono">{formatDate(m.timestamp)}</span>
                    {" · "}
                    <span className="text-primary/70">{m.genre}</span>
                    {" · "}
                    <span className="text-muted-foreground">#{m.rank}</span>
                  </div>
                  <div className="shrink-0">
                    {movement !== null && movement > 0 && (
                      <span className="text-emerald-400 font-mono">↑{movement}</span>
                    )}
                    {movement !== null && movement < 0 && (
                      <span className="text-red-400 font-mono">↓{Math.abs(movement)}</span>
                    )}
                    {movement === 0 && (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                    {movement === null && (
                      <span className="text-muted-foreground/50">new</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {labelSearch.trim() && labelMovements.length === 0 && (
          <p className="text-xs text-muted-foreground/60 py-2">
            {locale === "it" ? "Nessun movimento trovato per questa label." : "No movements found for this label."}
          </p>
        )}
      </div>
    </div>
  );
}

function CloudNotConfiguredScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-2xl w-full">
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-full bg-amber-500/15 border border-amber-500/40 flex items-center justify-center">
              <CloudOff className="h-6 w-6 text-amber-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Cloud non configurato</h1>
              <p className="text-xs text-muted-foreground font-mono">LabelPulse richiede il cloud per funzionare</p>
            </div>
          </div>
          <div className="mb-6 p-4 rounded-lg bg-secondary/30 border border-border/40">
            <p className="text-sm text-foreground/90 leading-relaxed">
              <strong>Perché vedi questa schermata?</strong> L'app è
              cloud-first: ogni salvataggio viene pushato a Supabase in
              tempo reale, e al login da qualsiasi dispositivo il cloud è
              la source of truth. Senza credenziali Supabase, i dati
              restano bloccati nel browser corrente.
            </p>
          </div>
          <div className="space-y-3 mb-6">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
              Come configurare
            </h2>
            <ol className="space-y-2.5 text-sm text-muted-foreground">
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center">1</span>
                <span>Vai su <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">supabase.com</a> e fai login o sign up</span>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center">2</span>
                <span>Crea un nuovo progetto (Free tier). Aspetta 2 minuti.</span>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center">3</span>
                <span>Vai in <strong>Project Settings → API</strong> e copia URL + anon key.</span>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center">4</span>
                <span>Esegui <code className="px-1.5 py-0.5 rounded bg-secondary/50 text-foreground text-xs">supabase-schema.sql</code> nel SQL Editor.</span>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center">5</span>
                <span>Configura <code className="px-1.5 py-0.5 rounded bg-secondary/50 text-foreground text-xs">.env.local</code> con le credenziali.</span>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center">6</span>
                <span>Riavvia l'app.</span>
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
