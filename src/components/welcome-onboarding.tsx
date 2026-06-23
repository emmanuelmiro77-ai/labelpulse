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
  Lock,
  MessageSquareHeart,
} from "lucide-react";

const ONBOARDED_KEY = "labelpulse-onboarded-v2";

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

    // Check if user has seen onboarding before.
    // ⚠️ Use a PER-EMAIL key so that:
    //   - Different users on the same device each see their own onboarding
    //   - The same user on a fresh incognito window won't see it again IF
    //     they already have profile data (heuristic: a user with profile
    //     data has clearly already been onboarded on another device)
    const email = session.user.email;
    const perUserKey = `${ONBOARDED_KEY}:${email.toLowerCase()}`;

    try {
      const seen = localStorage.getItem(perUserKey);
      if (seen) return;

      // HEURISTIC: if the user already has profile data (artistName, bio,
      // or any links), they've clearly been onboarded before — skip the
      // modal. This handles the incognito re-login case where the localStorage
      // flag is gone but the cloud-pulled profile proves prior onboarding.
      const hasProfileData =
        !!userProfile?.artistName ||
        !!userProfile?.bio ||
        !!userProfile?.email ||
        !!userProfile?.scLink ||
        !!userProfile?.photoUrl ||
        (Array.isArray(userProfile?.links) && userProfile.links.length > 0);
      if (hasProfileData) {
        // Mark as seen so we don't re-check on every render
        localStorage.setItem(perUserKey, new Date().toISOString());
        return;
      }
    } catch {
      // localStorage might be unavailable (private mode, etc.) — skip onboarding
      return;
    }

    // Show onboarding after a tiny delay so the auth banner doesn't flash
    // AND so the cloud sync has time to populate the profile (avoids
    // flashing the modal then immediately hiding it once profile loads)
    const timer = setTimeout(() => {
      // ⚠️ Read fresh state inside the timeout — the userProfile from the
      // effect closure may be stale (cloud sync may have completed in the
      // meantime). Always read the LATEST profile from the store.
      const latestProfile = useAppStore.getState().userProfile;
      const hasProfileDataNow =
        !!latestProfile?.artistName ||
        !!latestProfile?.bio ||
        !!latestProfile?.email ||
        !!latestProfile?.scLink ||
        !!latestProfile?.photoUrl ||
        (Array.isArray(latestProfile?.links) && latestProfile.links.length > 0);
      if (hasProfileDataNow) {
        try {
          localStorage.setItem(perUserKey, new Date().toISOString());
        } catch {}
        return;
      }
      setOpen(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, [status, session?.user?.email, userProfile?.artistName, userProfile?.bio, userProfile?.email, userProfile?.scLink, userProfile?.photoUrl, userProfile?.links]);

  const handleDismiss = () => {
    setOpen(false);
    try {
      if (session?.user?.email) {
        const perUserKey = `${ONBOARDED_KEY}:${session.user.email.toLowerCase()}`;
        localStorage.setItem(perUserKey, new Date().toISOString());
      }
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
        ? "Classifiche label curate dal team LabelPulse. Aggiornate periodicamente con dati Beatport. Le vedi aggiornate in tempo reale, non devi fare nulla."
        : "Label rankings curated by the LabelPulse team. Updated periodically with Beatport data. You see updates in real time, nothing to do.",
      color: "text-amber-400",
    },
    {
      icon: Send,
      title: isItalian ? "Demo" : "Demos",
      desc: isItalian
        ? "Traccia ogni demo inviato. Stato: inviato, ascoltato, firmato, rifiutato. Solo tu vedi i tuoi demo."
        : "Track every demo sent. Status: sent, listened, signed, rejected. Only you see your demos.",
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
        ? "Il tuo nome artista, bio, link. Servono per generare le email pitch. Compilalo per primo."
        : "Your artist name, bio, links. Required to generate pitch emails. Fill it in first.",
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

        <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto pr-1">
          {/* Data safety reassurance */}
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-foreground">
                {isItalian ? "I tuoi dati sono al sicuro e privati" : "Your data is safe and private"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isItalian
                  ? "Ogni modifica viene salvata automaticamente sul cloud e sincronizzata su tutti i tuoi dispositivi. I tuoi dati (note, demo, email, profilo) sono INDIPENDENTI e privati: nessun altro utente può vederli. Se chiudi il browser o cambi telefono, ritrovi tutto."
                  : "Every change is automatically saved to the cloud and synced across all your devices. Your data (notes, demos, emails, profile) is INDEPENDENT and private: no other user can see it. Close the browser or switch phones — your data is there."}
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

          {/* What you CAN and CANNOT do */}
          <div className="rounded-lg bg-secondary/30 border border-border/30 p-3 space-y-2">
            <div className="flex items-start gap-3">
              <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-medium text-foreground">
                  {isItalian ? "Cosa puoi fare" : "What you can do"}
                </p>
                <p className="text-muted-foreground mt-0.5">
                  {isItalian
                    ? "Esplorare label, inviare demo, generare pitch, scrivere note, vedere classifiche aggiornate, segnalare bug."
                    : "Explore labels, send demos, generate pitches, write notes, see updated rankings, report bugs."}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Lock className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-medium text-foreground">
                  {isItalian ? "Cosa non puoi fare (riservato all'admin)" : "What you can't do (admin-only)"}
                </p>
                <p className="text-muted-foreground mt-0.5">
                  {isItalian
                    ? "Aggiornare le classifiche Beatport, importare dati, vedere i feedback degli altri utenti. Le classifiche le vedi già aggiornate automaticamente."
                    : "Update Beatport rankings, import data, see other users' feedback. Rankings are already updated for you automatically."}
                </p>
              </div>
            </div>
          </div>

          {/* Feedback channel */}
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 flex items-start gap-3">
            <MessageSquareHeart className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-medium text-foreground">
                {isItalian ? "Hai trovato un bug o hai un'idea?" : "Found a bug or have an idea?"}
              </p>
              <p className="text-muted-foreground mt-0.5">
                {isItalian
                  ? "Usa il pulsante \"Feedback\" nel menu in alto a destra. Scegli la categoria (bug / funzionalità / altro), descrivi cosa è successo e invia. Mi arriva direttamente."
                  : "Use the \"Feedback\" button in the top-right menu. Pick a category (bug / feature / other), describe what happened and submit. It reaches me directly."}
              </p>
            </div>
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
