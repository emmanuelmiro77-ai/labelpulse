"use client";

import { useAppStore } from "@/lib/store";
import { t, LOCALE_NAMES, LOCALE_FLAGS, type Locale } from "@/lib/i18n";
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

const NAV_KEYS = [
  { id: "dashboard" as const, labelKey: "nav.dashboard" as const, icon: LayoutDashboard },
  { id: "labels" as const, labelKey: "nav.labels" as const, icon: Music2 },
  { id: "demos" as const, labelKey: "nav.demos" as const, icon: Send },
  { id: "pitch" as const, labelKey: "nav.pitch" as const, icon: Megaphone },
];

const SECTION_TITLES = {
  dashboard: "dash.title",
  labels: "labels.title",
  demos: "demos.title",
  pitch: "campaign.title",
} as const;

const SECTION_SUBTITLES = {
  dashboard: "dash.subtitle",
  labels: "labels.subtitle",
  demos: "demos.subtitle",
  pitch: "campaign.subtitle",
} as const;

export default function Home() {
  const { activeTab, setActiveTab, locale, setLocale } = useAppStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // Wait for Zustand persist to rehydrate from localStorage before rendering
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
          <span className="text-sm text-muted-foreground font-mono">Loading LabelPulse...</span>
        </div>
      </div>
    );
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
            {/* Language Switcher */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                  <Globe className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{LOCALE_FLAGS[locale]} {LOCALE_NAMES[locale]}</span>
                  <span className="sm:hidden">{LOCALE_FLAGS[locale]}</span>
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

            {/* Gmail Connection */}
            <GmailSettings />

            {/* Data Backup */}
            <DataBackup />

            {/* Auto-Save */}
            <AutoSave />

            {/* Help Button */}
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-amber-400"
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
              <button
                onClick={() => { setHelpOpen(true); setMobileMenuOpen(false); }}
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-amber-400 hover:bg-secondary/50"
              >
                <HelpCircle className="h-4 w-4" />
                {t(locale, "nav.help")}
              </button>
            </div>
          </nav>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 px-4 sm:px-6 py-6 max-w-7xl w-full mx-auto">
        {/* Section Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            {activeTab === "dashboard" && <LayoutDashboard className="h-5 w-5 text-primary" />}
            {activeTab === "labels" && <Music2 className="h-5 w-5 text-primary" />}
            {activeTab === "demos" && <Send className="h-5 w-5 text-primary" />}
            {activeTab === "pitch" && <Megaphone className="h-5 w-5 text-primary" />}
            <h2 className="text-xl font-bold text-foreground">
              {t(locale, SECTION_TITLES[activeTab])}
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">
            {t(locale, SECTION_SUBTITLES[activeTab])}
          </p>
        </div>

        {activeTab === "dashboard" && <Dashboard />}
        {activeTab === "labels" && <LabelFinder />}
        {activeTab === "demos" && <DemoTracker />}
        {activeTab === "pitch" && <PitchGenerator />}
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
    </div>
  );
}
