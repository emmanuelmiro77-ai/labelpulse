"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useSession } from "next-auth/react";
import { useAppStore } from "@/lib/store";
import {
  Sparkles,
  Music2,
  BarChart3,
  Send,
  Megaphone,
  User,
  ArrowRight,
  Cloud,
  ShieldCheck,
} from "lucide-react";

const ONBOARDED_KEY = "labelpulse-onboarded-v1";

/**
 * Welcome Onboarding Modal
 *
 * Shown automatically the FIRST TIME a user logs in (or any time their
 * local browser hasn't seen the onboarding before).
 *
 * Goals:
 *   1. Make the user feel welcomed — they're not landing in a blank app.
 *   2. Quickly explain the 5 main sections so they know what to do.
 *   3. Reassure them that their data is automatically synced to the cloud
 *      and they don't need to do anything special.
 *   4. Direct them to the Profilo tab first (set artist name, etc.) since
 *      that's the prerequisite for using the Pitch Generator.
 *
 * Dismiss state is stored in localStorage under ONBOARDED_KEY. Once dismissed,
 * it won't show again on this device. If the user clears localStorage, it
 * will show again — that's fine.
 *
 * Note: this is shown to LOGGED-IN users only. Unauthenticated users see
 * the "Please log in" banner instead.
 */
export function WelcomeOnboarding() {
  const { data: session, status } = useSession();
  const { locale, setActiveTab, labels, userProfile } = useAppStore();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (!session?.user?.email) return;

    // Check if user has seen onboarding before
    try {
      const seen = localStorage.getItem(ONBOARDED_KEY);
      if (seen) return;
    } catch {
      // localStorage might be unavailable (private mode, etc.) — skip onboarding
      return;
    }

    // Show onboarding after a tiny delay so the auth banner doesn't flash
    const timer = setTimeout(() => setOpen(true), 800);
    return () => clearTimeout(timer);
  }, [status, session?.user?.email]);

  const handleDismiss = () => {
    setOpen(false);
    try {
      localStorage.setItem(ONBOARDED_KEY, new Date().toISOString());
    } catch {
      // Ignore — we already skipped showing it
    }
  };

  const handleGoToProfile = () => {
    handleDismiss();
    setActiveTab("profile");
  };

  // Don't render if not authenticated
  if (status !== "authenticated") return null;

  const isItalian = locale === "it";

  const sections = [
    {
      icon: Music2,
      title: isItalian ? "Label" : "Labels",
      desc: isItalian
        ? "Cerca tra 1200+ label di musica elettronica. Filtra per genere, paese, ranking."
        : "Search 1200+ electronic music labels. Filter by genre, country, ranking.",
      color: "text-cyan-400",
    },
    {
      icon: BarChart3,
      title: isItalian ? "Classifiche" : "Rankings",
      desc: isItalian
        ? "Classifiche label curate dal team LabelPulse. Aggiornate periodicamente con dati Beatport."
        : "Label rankings curated by the LabelPulse team. Updated periodically with Beatport data.",
      color: "text-amber-400",
    },
    {
      icon: Send,
      title: isItalian ? "Demo" : "Demos",
      desc: isItalian
        ? "Traccia ogni demo inviato. Stato: inviato, ascoltato, firmato, rifiutato."
        : "Track every demo sent. Status: sent, listened, signed, rejected.",
      color: "text-emerald-400",
    },
    {
      icon: Megaphone,
      title: isItalian ? "Pitch" : "Pitch",
      desc: isItalian
        ? "Genera email A&R professionali con un click. Personalizza per ogni label."
        : "Generate pro A&R emails with one click. Personalize for each label.",
      color: "text-purple-400",
    },
    {
      icon: User,
      title: isItalian ? "Profilo" : "Profile",
      desc: isItalian
        ? "Il tuo nome artista, bio, link. Servono per generare le email pitch."
        : "Your artist name, bio, links. Required to generate pitch emails.",
      color: "text-pink-400",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleDismiss()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="h-5 w-5 text-amber-400" />
            {isItalian ? "Benvenuto in LabelPulse!" : "Welcome to LabelPulse!"}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {isItalian
              ? `Ciao ${session?.user?.name?.split(" ")[0] || ""}, sei loggato come ${session?.user?.email}. Ecco cosa puoi fare.`
              : `Hi ${session?.user?.name?.split(" ")[0] || ""}, you're logged in as ${session?.user?.email}. Here's what you can do.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Data safety reassurance */}
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-foreground">
                {isItalian ? "I tuoi dati sono al sicuro" : "Your data is safe"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isItalian
                  ? "Ogni modifica viene salvata automaticamente sul cloud e sincronizzata su tutti i tuoi dispositivi. Se chiudi il browser o cambi telefono, ritrovi tutto."
                  : "Every change is automatically saved to the cloud and synced across all your devices. Close the browser or switch phones — your data is there."}
              </p>
            </div>
          </div>

          {/* Section list */}
          <div className="space-y-2">
            {sections.map((s) => {
              const Icon = s.icon;
              return (
                <div
                  key={s.title}
                  className="flex items-start gap-3 p-2 rounded-md hover:bg-secondary/30 transition-colors"
                >
                  <Icon className={`h-4 w-4 ${s.color} shrink-0 mt-0.5`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{s.title}</p>
                    <p className="text-xs text-muted-foreground">{s.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Cloud sync note */}
          <div className="rounded-lg bg-secondary/30 border border-border/30 p-3 flex items-start gap-3">
            <Cloud className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
            <div className="text-xs text-muted-foreground">
              {isItalian
                ? "Vedi l'icona cloud in alto a destra? Verde = sincronizzato. Giallo = in corso. Rosso = errore. Cliccalo per vedere lo stato del sync."
                : "See the cloud icon top-right? Green = synced. Yellow = syncing. Red = error. Click it to see sync status."}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleGoToProfile} className="w-full gap-2">
            {isItalian ? "Inizia dal Profilo" : "Start with Profile"}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </DialogFooter>

        <p className="text-[10px] text-muted-foreground/50 text-center -mt-2">
          {isItalian
            ? "Questo messaggio non comparirà più su questo dispositivo."
            : "This message won't show again on this device."}
        </p>
      </DialogContent>
    </Dialog>
  );
}
