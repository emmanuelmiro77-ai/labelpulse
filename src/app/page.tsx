"use client";

import { useAppStore, loadFromCloud, forceCloudSync, loadArtistsOnBoot } from "@/lib/store";
import { t, LOCALE_NAMES, LOCALE_FLAGS, type Locale } from "@/lib/i18n";
import { useAuthEffect } from "@/lib/use-auth";
import { useSession } from "next-auth/react";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  LayoutDashboard,
  Music2,
  Send,
  Megaphone,
  Disc3,
  Menu,
  X,
  HelpCircle,
  Globe,
  Loader2,
  User,
  Users,
  AlertTriangle,
  CloudOff,
} from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Dashboard } from "@/components/dashboard";
import { LabelFinder } from "@/components/label-finder";
import { DemoTracker } from "@/components/demo-tracker";
import { PitchGenerator } from "@/components/pitch-generator";
import { HelpModal } from "@/components/help-modal";
import { GmailSettings } from "@/components/gmail-settings";
import { DataBackup } from "@/components/data-backup";
import { AutoSave } from "@/components/auto-save";
import { RankingsPage } from "@/components/rankings-page";
import { ProducerProfile } from "@/components/producer-profile";
import { CloudSyncButton } from "@/components/cloud-sync-button";
import { AuthButton } from "@/components/auth-button";
import { BetaFeedbackButton } from "@/components/beta-feedback-button";
import { WelcomeOnboarding } from "@/components/welcome-onboarding";
import { BarChart3, LogIn } from "lucide-react";
import ArtistExplorer from "@/components/artist-explorer";

const NAV_KEYS = [
  { id: "dashboard" as const, labelKey: "nav.dashboard" as const, icon: LayoutDashboard },
  { id: "labels" as const, labelKey: "nav.labels" as const, icon: Music2 },
  { id: "artists" as const, labelKey: "nav.artists" as const, icon: Users },
  { id: "rankings" as const, labelKey: "nav.rankings" as const, icon: BarChart3 },
  { id: "demos" as const, labelKey: "nav.demos" as const, icon: Send },
  { id: "pitch" as const, labelKey: "nav.pitch" as const, icon: Megaphone },
  { id: "profile" as const, labelKey: "nav.profile" as const, icon: User },
];

const SECTION_TITLES = {
  dashboard: "dash.title",
  labels: "labels.title",
  artists: "artists.title",
  rankings: "rankings.title",
  demos: "demos.title",
  pitch: "campaign.title",
  profile: "profile.title",
} as const;

const SECTION_SUBTITLES = {
  dashboard: "dash.subtitle",
  labels: "labels.subtitle",
  artists: "artists.subtitle",
  rankings: "rankings.subtitle",
  demos: "demos.subtitle",
  pitch: "campaign.subtitle",
  profile: "profile.subtitle",
} as const;

export default function Home() {
  const { activeTab, setActiveTab, locale, setLocale, hasRehydrated } = useAppStore();
  const { data: session, status: authStatus } = useSession();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // Bridge NextAuth session ↔ cloud sync. Mounts the email-based row id,
  // triggers loadFromCloud() on login, and resets state on logout.
  useAuthEffect();

  // Carica i dati dal cloud dopo la reidratazione da localStorage
  useEffect(() => {
    if (hasRehydrated) {
      loadFromCloud();
      // Load artists from IndexedDB (Phase 2 — scraper v2 data is too large
      // for localStorage, persisted in IDB instead)
      loadArtistsOnBoot();
    }
  }, [hasRehydrated]);

  // Sincronizza con il cloud quando la pagina viene chiusa o nascosta
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        forceCloudSync();
      }
    };

    const handleBeforeUnload = () => {
      forceCloudSync();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  // Wait for Zustand rehydration before rendering.
  // hasRehydrated is set to true AFTER the store has loaded persisted data from localStorage.
  // This prevents the UI from rendering with seed data before user data is loaded,
  // and prevents user actions from writing seed data over persisted data.
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

  // ⚠️ CLOUD-FIRST SAFETY GATE (2026-06-23):
  // Se Supabase non è configurato (env vars mancanti), l'app NON deve
  // funzionare in "modalità offline" — era quello che causava la perdita
  // dati silenziosa. Invece, blocchiamo con una schermata chiara che
  // spiega all'utente come configurare .env.local.
  if (!isSupabaseConfigured()) {
    return <CloudNotConfiguredScreen />;
  }

  const handleNav = (tab: typeof activeTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
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
                DJ & Producer Demo Manager
              </p>
            </div>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_KEYS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
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
                  {t(locale, item.labelKey)}
                </button>
              );
            })}
          </nav>

          {/* Right side: Language + Help + Mobile menu */}
          <div className="flex items-center gap-2">
            {/* Language Switcher — desktop only (mobile gets it in the hamburger menu) */}
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

            {/* Gmail Connection — desktop only (mobile: hamburger menu) */}
            <div className="hidden md:block">
              <GmailSettings />
            </div>

            {/* Cloud Sync — desktop only (mobile: hamburger menu) */}
            <div className="hidden md:block">
              <CloudSyncButton />
            </div>

            {/* Auth (Google login — multi-device profile)
                ALWAYS visible — on mobile it's the primary CTA, on desktop
                it sits inline with the other utility buttons. */}
            <AuthButton />

            {/* Beta Feedback (only shows when authenticated) — desktop only */}
            <div className="hidden md:block">
              <BetaFeedbackButton />
            </div>

            {/* Data Backup — desktop only */}
            <div className="hidden md:block">
              <DataBackup />
            </div>

            {/* Auto-Save — desktop only */}
            <div className="hidden md:block">
              <AutoSave />
            </div>

            {/* Help Button — desktop only (mobile: hamburger menu) */}
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-amber-400 hidden md:inline-flex"
              onClick={() => setHelpOpen(true)}
              title={t(locale, "nav.help")}
            >
              <HelpCircle className="h-5 w-5" />
            </Button>

            {/* Mobile Menu Button */}
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
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNav(item.id)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                      isActive ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {t(locale, item.labelKey)}
                  </button>
                );
              })}

              {/* Divider before utility tools */}
              <div className="my-2 border-t border-border/30" />

              {/* Utility tools — visible on mobile only via this menu.
                  Each component renders its own button which opens its own
                  popover/dialog. They are full-width rows here so the user
                  has a tap target. */}
              <div className="flex flex-col gap-1 px-2 py-1">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground px-2 pb-1">
                  {locale === "it" ? "Strumenti e account" : "Tools & account"}
                </div>

                {/* Language switcher row (mobile-only entry that opens the
                    same popover as the desktop Globe button). */}
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

                {/* Gmail, Cloud Sync, Backup, AutoSave — render the same
                    components as in the desktop header, but full-width here
                    inside the mobile menu. They keep their own state and
                    popover behavior. */}
                <div className="w-full [&>button]:w-full [&>button]:justify-start [&>button]:gap-3 [&>button]:px-4 [&>button]:py-3 [&>button]:rounded-lg [&>button]:text-sm [&>button]:font-medium [&>button]:text-muted-foreground [&>button:hover]:text-foreground [&>button:hover]:bg-secondary/50">
                  <GmailSettings />
                  <CloudSyncButton />
                  <DataBackup />
                  <AutoSave />
                  <BetaFeedbackButton />
                </div>

                {/* Help */}
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

      {/* Auth banner — shown only when user is not logged in.
          Reminds them that their data is local-only and won't sync to other
          devices until they click "Accedi" in the top right. */}
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
            {activeTab === "dashboard" && <LayoutDashboard className="h-5 w-5 text-primary" />}
            {activeTab === "labels" && <Music2 className="h-5 w-5 text-primary" />}
            {activeTab === "artists" && <Users className="h-5 w-5 text-primary" />}
            {activeTab === "rankings" && <BarChart3 className="h-5 w-5 text-primary" />}
            {activeTab === "demos" && <Send className="h-5 w-5 text-primary" />}
            {activeTab === "pitch" && <Megaphone className="h-5 w-5 text-primary" />}
            {activeTab === "profile" && <User className="h-5 w-5 text-primary" />}
            <h2 className="text-xl font-bold text-foreground">
              {t(locale, SECTION_TITLES[activeTab])}
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">
            {t(locale, SECTION_SUBTITLES[activeTab])}
          </p>
        </div>

        {activeTab === "dashboard" && <Dashboard />}
        {activeTab === "artists" && <ArtistExplorer />}
        {activeTab === "demos" && <DemoTracker />}
        {activeTab === "pitch" && <PitchGenerator />}
        {activeTab === "profile" && <ProducerProfile />}
        {/*
          Rankings + Labels are ALWAYS mounted (one visible, one hidden via
          CSS) so that opening a label sheet FROM the Rankings page works as
          an overlay rather than a tab switch.

          WHY: When the user clicks a label name inside RankingsPage, we set
          `selectedLabelId` in the store but DO NOT call setActiveTab("labels").
          The always-mounted LabelFinder (hidden behind RankingsPage) sees
          the selectedLabelId change, runs its useEffect, and opens the
          detail <Dialog>. Because Radix Dialog renders through a portal at
          document.body, the dialog appears on top of RankingsPage — exactly
          what the user expects: the ranking (with selected genre + scroll
          position) stays visible underneath, and closing the sheet returns
          them to the exact same view.

          Both components stay mounted across tab switches, so navigating
          Rankings → Labels → Rankings preserves each page's state (filters,
          scroll position, search query, etc.).
        */}
        <div className={activeTab === "rankings" ? "" : "hidden"}>
          <RankingsPage />
        </div>
        <div className={activeTab === "labels" ? "" : "hidden"}>
          <LabelFinder />
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-border/20 py-4 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
            <Disc3 className="h-3.5 w-3.5" />
            <span className="font-mono">LabelPulse v2.1</span>
          </div>
          <p className="text-[10px] text-muted-foreground/30 font-mono">
            {t(locale, "footer.dataStored")}
          </p>
        </div>
      </footer>

      {/* Help Modal */}
      <HelpModal open={helpOpen} onOpenChange={setHelpOpen} />

      {/* Welcome onboarding (shows once per device on first login) */}
      <WelcomeOnboarding />
    </div>
  );
}

/**
 * CloudNotConfiguredScreen
 *
 * Schermata di BLOCCO mostrata quando le credenziali Supabase non sono
 * configurate in .env.local. L'app NON funziona in modalità offline
 * — era quello che causava la perdita dati silenziosa.
 *
 * Spiega all'utente come configurare .env.local e riavviare l'app.
 */
function CloudNotConfiguredScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-2xl w-full">
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-8">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-full bg-amber-500/15 border border-amber-500/40 flex items-center justify-center">
              <CloudOff className="h-6 w-6 text-amber-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">
                Cloud non configurato
              </h1>
              <p className="text-xs text-muted-foreground font-mono">
                LabelPulse richiede il cloud per funzionare
              </p>
            </div>
          </div>

          {/* Why */}
          <div className="mb-6 p-4 rounded-lg bg-secondary/30 border border-border/40">
            <p className="text-sm text-foreground/90 leading-relaxed">
              <strong>Perché vedi questa schermata?</strong> L'app è
              cloud-first: ogni salvataggio viene pushato a Supabase in
              tempo reale, e al login da qualsiasi dispositivo il cloud è
              la source of truth. Senza credenziali Supabase, i dati
              restano bloccati nel browser corrente — e cambiando PC,
              telefono, o pulendo la cache, sono persi.
            </p>
          </div>

          {/* Steps */}
          <div className="space-y-3 mb-6">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
              Come configurare (2 minuti, gratis)
            </h2>
            <ol className="space-y-2.5 text-sm text-muted-foreground">
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center">1</span>
                <span>
                  Vai su <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">supabase.com</a> e fai login o sign up (gratis con GitHub/Google)
                </span>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center">2</span>
                <span>Crea un nuovo progetto (Free tier va benissimo). Aspetta 2 minuti che si provisioni.</span>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center">3</span>
                <span>
                  Vai in <strong>Project Settings → API</strong> e copia:
                  <ul className="mt-1 ml-4 space-y-0.5 text-xs">
                    <li>• <strong>Project URL</strong> (es. https://abc123.supabase.co)</li>
                    <li>• <strong>anon public</strong> key (una stringa JWT lunga)</li>
                  </ul>
                </span>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center">4</span>
                <span>
                  Vai in <strong>SQL Editor → New query</strong>, incolla tutto il
                  contenuto di <code className="px-1.5 py-0.5 rounded bg-secondary/50 text-foreground text-xs">supabase-schema.sql</code> (nella root del progetto) e premi <strong>Run</strong>.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center">5</span>
                <span>
                  Apri il file <code className="px-1.5 py-0.5 rounded bg-secondary/50 text-foreground text-xs">/home/z/my-project/.env.local</code> e incolla le credenziali nei campi
                  <code className="px-1.5 py-0.5 rounded bg-secondary/50 text-foreground text-xs ml-1">NEXT_PUBLIC_SUPABASE_URL</code> e
                  <code className="px-1.5 py-0.5 rounded bg-secondary/50 text-foreground text-xs ml-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center">6</span>
                <span>
                  Riavvia l'app: <code className="px-1.5 py-0.5 rounded bg-secondary/50 text-foreground text-xs">bash run-server.sh</code>
                </span>
              </li>
            </ol>
          </div>

          {/* Tip */}
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
            <p className="text-xs text-emerald-400 leading-relaxed">
              <strong>💡 Se avevi già un progetto Supabase</strong> (usato con
              il vecchio sistema "inserisci credenziali nel Profilo"), RIUSA
              QUELLO. I tuoi dati precedenti sono ancora lì — basta
              incollare le stesse credenziali in .env.local.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
