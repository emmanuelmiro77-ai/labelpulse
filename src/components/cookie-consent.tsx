"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Cookie, X, Settings } from "lucide-react";

const CONSENT_KEY = "labelpulse-cookie-consent";

type ConsentState = "accepted" | "rejected" | null;

interface ConsentData {
  status: ConsentState;
  timestamp: number;
  version: string;
}

const CURRENT_VERSION = "1";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CONSENT_KEY);
      if (stored) {
        const data: ConsentData = JSON.parse(stored);
        // Re-show if version changed (policy update)
        if (data.version === CURRENT_VERSION) {
          applyConsent(data.status);
          return;
        }
      }
      // No consent yet or version changed → show banner
      setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  function applyConsent(status: ConsentState) {
    if (typeof window === "undefined") return;

    // Integrate with PostHog
    try {
      const posthog = (window as unknown as { posthog?: { opt_in_capturing?: () => void; opt_out_capturing?: () => void } }).posthog;
      if (posthog) {
        if (status === "accepted") {
          posthog.opt_in_capturing?.();
        } else {
          posthog.opt_out_capturing?.();
        }
      }
    } catch {
      // PostHog not loaded, ignore
    }
  }

  function saveConsent(status: ConsentState) {
    const data: ConsentData = {
      status,
      timestamp: Date.now(),
      version: CURRENT_VERSION,
    };
    localStorage.setItem(CONSENT_KEY, JSON.stringify(data));
    applyConsent(status);
    setVisible(false);
  }

  function handleAccept() {
    saveConsent("accepted");
  }

  function handleReject() {
    saveConsent("rejected");
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] p-3 md:p-4">
      <div className="mx-auto max-w-2xl rounded-xl border border-border bg-card/95 backdrop-blur-sm shadow-2xl p-4 md:p-5">
        {showDetails ? (
          <>
            <div className="flex items-center gap-2 mb-3">
              <Settings className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-sm">Preferenze Cookie</h3>
            </div>
            <div className="space-y-3 text-xs text-muted-foreground mb-4">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 h-4 w-4 rounded border border-green-500 bg-green-500/20 flex items-center justify-center text-[10px]">✓</span>
                <div>
                  <p className="font-medium text-foreground">Cookie necessari</p>
                  <p>Autenticazione, stato app, funzionamento PWA. Sempre attivi, non richiedono consenso.</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 h-4 w-4 rounded border border-muted-foreground/30 bg-muted flex items-center justify-center text-[10px]">?</span>
                <div>
                  <p className="font-medium text-foreground">Cookie analitici (PostHog)</p>
                  <p>Eventi di utilizzo, session recording (10% sample), miglioramento prodotto. Dati anonimizzati, ospitati su PostHog.</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 h-4 w-4 rounded border border-muted-foreground/30 bg-muted flex items-center justify-center text-[10px]">?</span>
                <div>
                  <p className="font-medium text-foreground">Monitoraggio errori (Bugsnag)</p>
                  <p>Stack traces, contesto errore, performance. Necessario per stabilità del servizio. Nessun dato personale nei log.</p>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAccept} className="flex-1">
                Accetta tutto
              </Button>
              <Button size="sm" variant="outline" onClick={handleReject} className="flex-1">
                Solo necessari
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <Cookie className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm mb-1">
                  Utilizziamo cookie per il funzionamento dell&apos;app e, con il tuo consenso, per analisi di utilizzo (PostHog) e monitoraggio errori (Bugsnag).
                </p>
                <p className="text-xs text-muted-foreground">
                  <a href="/legal" className="underline hover:text-foreground transition-colors">Privacy Policy</a>
                  {" · "}
                  <a href="/legal" className="underline hover:text-foreground transition-colors">Termini di Servizio</a>
                </p>
              </div>
              <button onClick={handleReject} className="shrink-0 p-1 hover:bg-muted rounded transition-colors" aria-label="Chiudi">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={handleAccept} className="flex-1">
                Accetta
              </Button>
              <Button size="sm" variant="outline" onClick={handleReject} className="flex-1">
                Rifiuta
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowDetails(true)} className="shrink-0">
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
