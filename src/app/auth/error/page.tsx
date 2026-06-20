"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Bug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Suspense } from "react";

/**
 * Custom NextAuth error page.
 *
 * NextAuth redirects here with ?error=<ErrorCode> when something goes wrong
 * during the OAuth flow. The default signin page just shows "Try signing in
 * with a different account" for almost every error — useless for debugging.
 *
 * This page surfaces the ACTUAL error code so we can diagnose.
 */

const ERROR_MEANINGS: Record<string, { title: string; desc: string; fix: string }> = {
  Configuration: {
    title: "Errore di configurazione server",
    desc: "Manca una variabile d'ambiente (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NEXTAUTH_SECRET o NEXTAUTH_URL) oppure il codice non è aggiornato.",
    fix: "Visita /api/auth-config-check per vedere quale variabile manca. Se tutto è OK, fai Redeploy su Vercel.",
  },
  AccessDenied: {
    title: "Accesso negato da Google",
    desc: "Hai negato il consenso, oppure Google ha bloccato l'accesso.",
    fix: "Riprova cliccando Accedi e accetta tutte le richieste di permesso.",
  },
  Verification: {
    title: "Link di login scaduto",
    desc: "Il token di stato è scaduto (max 15 minuti).",
    fix: "Riprova a cliccare Accedi. Non lasciare la pagina aperta troppo a lungo prima di completare il login Google.",
  },
  OAuthSignin: {
    title: "Impossibile iniziare il login Google",
    desc: "NextAuth non è riuscito a contattare Google per iniziare il flusso OAuth.",
    fix: "Verifica la connessione internet. Se persiste, controlla i log su Vercel → Functions → Logs.",
  },
  OAuthCallback: {
    title: "Errore durante il ritorno da Google",
    desc: "Google ha rimandato qui il browser, ma NextAuth non è riuscito a completare lo scambio del token. Cause tipiche: cookie bloccati dal browser (iOS Safari, modalità privata, PWA standalone), anticookie di terze parti, orologio sbagliato.",
    fix: "1) Prova da browser normale (non PWA / non modalità privata). 2) Abilita i cookie per questo sito. 3) Se sei su iPhone, prova da Safari (non da una WebView).",
  },
  OAuthCreateAccount: {
    title: "Errore creazione account",
    desc: "NextAuth non è riuscito a creare l'account utente dopo il login Google.",
    fix: "Verifica i log su Vercel → Functions → Logs per il dettaglio.",
  },
  EmailCreateAccount: {
    title: "Errore creazione email",
    desc: "Problema interno con la creazione dell'email.",
    fix: "Verifica i log su Vercel → Functions → Logs.",
  },
  Callback: {
    title: "Errore generico callback",
    desc: "Errore durante la fase di callback OAuth. Può essere un cookie mancante, un mismatch di stato, o un problema di rete.",
    fix: "Cancella i cookie del sito, riprova. Se persiste, prova da un altro browser/dispositivo.",
  },
  Default: {
    title: "Errore sconosciuto",
    desc: "NextAuth ha restituito un errore non specificato.",
    fix: "Verifica i log su Vercel → Functions → Logs.",
  },
};

function ErrorContent() {
  const params = useSearchParams();
  const errorCode = params.get("error") || "Default";
  const info = ERROR_MEANINGS[errorCode] || ERROR_MEANINGS.Default;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="max-w-md w-full rounded-2xl border border-border/50 bg-card p-6 shadow-xl space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-destructive/15 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-destructive" />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">{info.title}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Codice errore:{" "}
              <code className="px-1.5 py-0.5 rounded bg-secondary text-foreground font-mono">
                {errorCode}
              </code>
            </p>
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <p className="text-foreground/90">{info.desc}</p>
        </div>

        <div className="rounded-lg bg-secondary/40 p-3 border border-border/30">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1">
            <Bug className="w-3.5 h-3.5" />
            COME RISOLVERE
          </div>
          <p className="text-sm text-foreground/90">{info.fix}</p>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <Link href="/" className="w-full">
            <Button className="w-full gap-2">
              <ArrowLeft className="w-4 h-4" />
              Torna all'app
            </Button>
          </Link>
          <Link href="/api/auth-config-check" target="_blank" className="w-full">
            <Button variant="outline" className="w-full gap-2 text-xs">
              <Bug className="w-3.5 h-3.5" />
              Verifica configurazione server
            </Button>
          </Link>
        </div>

        <p className="text-xs text-muted-foreground text-center pt-2 border-t border-border/30">
          Se l'errore persiste, mandaci il codice errore mostrato sopra.
        </p>
      </div>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-sm text-muted-foreground">Caricamento…</div>
        </div>
      }
    >
      <ErrorContent />
    </Suspense>
  );
}
