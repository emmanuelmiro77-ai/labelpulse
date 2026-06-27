"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ShieldAlert, AlertTriangle, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";

type WithdrawalState = "form" | "confirm" | "success" | "error";

export default function WithdrawalPage() {
  const { data: session } = useSession();
  const [state, setState] = useState<WithdrawalState>("form");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const userEmail = session?.user?.email || "";

  async function handleSubmit() {
    setLoading(true);
    try {
      const res = await fetch("/api/account/withdrawal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: userEmail,
          reason: reason || "Nessuna motivazione fornita",
          timestamp: new Date().toISOString(),
        }),
      });

      if (res.ok) {
        setState("success");
      } else {
        setState("error");
      }
    } catch {
      setState("error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-1">
              <ArrowLeft className="h-4 w-4" />
              Torna all&apos;app
            </Button>
          </Link>
          <h1 className="font-semibold text-lg">Diritto di Recesso</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {state === "form" && (
          <div className="space-y-6">
            {/* Info box */}
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-primary" />
                <h2 className="font-semibold">Il tuo diritto di recesso</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Ai sensi dell&apos;art. 52 e seguenti del Codice del Consumo (D.Lgs. 206/2005),
                hai il diritto di recedere dal contratto entro <strong>14 giorni</strong> dalla
                sua conclusione, senza dover fornire alcuna motivazione.
              </p>
              <p className="text-sm text-muted-foreground">
                In conformità con l&apos;art. 59 lett. i del Codice del Consumo, <strong>dal 19 giugno 2026</strong>,
                i fornitori di contenuti digitali devono offrire un <strong>pulsante di recesso elettronico</strong>
                che consenta al consumatore di esercitare il diritto di recesso in modo semplice e diretto.
              </p>
            </div>

            {/* What happens */}
            <div className="rounded-lg border border-border p-4 space-y-2">
              <h3 className="font-medium text-sm">Cosa succede dopo il recesso</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Riceverai una email di conferma entro 24 ore</li>
                <li>• Il tuo account e i tuoi dati saranno eliminati entro <strong>30 giorni</strong> (GDPR art. 17)</li>
                <li>• I dati locali (localStorage) rimarranno sul tuo dispositivo fino a cancellazione manuale</li>
                <li>• Perderai l&apos;accesso a tutte le funzionalità beta e all&apos;offerta Early Adopter</li>
                <li>• Se hai pagato un abbonamento, verrà rimborsato entro 14 giorni (non applicabile durante la beta gratuita)</li>
              </ul>
            </div>

            {/* Reason (optional) */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Motivo del recesso <span className="text-muted-foreground">(opzionale)</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Aiutaci a migliorare — dicci perché stai recedendo (opzionale)..."
                className="w-full min-h-[80px] rounded-lg border border-border bg-card px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            {/* Account info */}
            {userEmail && (
              <div className="text-sm text-muted-foreground">
                Account: <span className="font-mono">{userEmail}</span>
              </div>
            )}

            {/* Submit button */}
            <Button
              onClick={() => setState("confirm")}
              className="w-full bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              Voglio esercitare il diritto di recesso
            </Button>
          </div>
        )}

        {state === "confirm" && (
          <div className="space-y-6">
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <h2 className="font-semibold text-destructive">Conferma recesso</h2>
              </div>
              <p className="text-sm">
                Stai per esercitare il tuo diritto di recesso. Questa azione:
              </p>
              <ul className="text-sm space-y-1">
                <li>• <strong>Eliminerà il tuo account</strong> e tutti i dati associati</li>
                <li>• <strong>Rimuoverà l&apos;accesso</strong> all&apos;app LabelPulse</li>
                <li>• È <strong>irreversibile</strong> dopo 30 giorni</li>
              </ul>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setState("form")}
                className="flex-1"
              >
                Annulla
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              >
                {loading ? "Elaborazione..." : "Confermo il recesso"}
              </Button>
            </div>
          </div>
        )}

        {state === "success" && (
          <div className="space-y-6 text-center py-8">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
            <div>
              <h2 className="text-xl font-semibold mb-2">Recesso registrato</h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Il tuo diritto di recesso è stato registrato con successo.
                Riceverai una email di conferma a <span className="font-mono">{userEmail}</span> entro 24 ore.
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Il tuo account e i tuoi dati saranno eliminati entro 30 giorni come richiesto dal GDPR.
              </p>
            </div>
            <Link href="/">
              <Button variant="outline">Torna alla home</Button>
            </Link>
          </div>
        )}

        {state === "error" && (
          <div className="space-y-6 text-center py-8">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
            <div>
              <h2 className="text-xl font-semibold mb-2">Errore</h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Si è verificato un errore nella registrazione del recesso.
                Riprova o contatta direttamente pulse.label.official@gmail.com.
              </p>
            </div>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={() => setState("form")}>
                Riprova
              </Button>
              <a href="mailto:pulse.label.official@gmail.com?subject=Diritto di recesso">
                <Button>Invia email</Button>
              </a>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-12">
        <div className="max-w-2xl mx-auto px-4 py-4 text-xs text-muted-foreground">
          Riferimento normativo: D.Lgs. 206/2005 (Codice del Consumo), art. 52 e ss. e art. 59 lett. i.
          <br />
          Contatto: pulse.label.official@gmail.com
        </div>
      </footer>
    </div>
  );
}
