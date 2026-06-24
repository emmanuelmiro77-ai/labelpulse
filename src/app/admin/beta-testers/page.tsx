"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  KeyRound, Plus, RefreshCw, Copy, Check, AlertCircle, UserPlus, Clock, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

type BetaCode = {
  id: number;
  email: string;
  code: string;
  note: string | null;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  created_by: string | null;
};

const ADMIN_EMAILS = new Set(["emmanuel.miro77@gmail.com"]);

export default function AdminBetaTestersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [codes, setCodes] = useState<BetaCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adminToken, setAdminToken] = useState("");
  const [tokenInput, setTokenInput] = useState("");

  // Form state
  const [newEmail, setNewEmail] = useState("");
  const [newNote, setNewNote] = useState("");
  const [newExpiresDays, setNewExpiresDays] = useState("30");
  const [generating, setGenerating] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<{ code: string; email: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("beta_admin_token");
    if (stored) {
      setAdminToken(stored);
      setTokenInput(stored);
    }
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }
    const email = session?.user?.email?.toLowerCase().trim() || "";
    if (!ADMIN_EMAILS.has(email)) {
      router.push("/");
    }
  }, [session, status, router]);

  const fetchCodes = async () => {
    if (!adminToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/generate-beta-code", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      const data = await res.json();
      setCodes(data.codes || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (adminToken) fetchCodes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminToken]);

  const generate = async () => {
    if (!adminToken) return;
    if (!newEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      setError("Email non valida");
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/generate-beta-code", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: newEmail.trim(),
          note: newNote.trim() || null,
          expiresInDays: Number(newExpiresDays) || 30,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setLastGenerated({ code: data.code, email: data.email });
      setNewEmail("");
      setNewNote("");
      await fetchCodes();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 1500);
  };

  const saveToken = () => {
    localStorage.setItem("beta_admin_token", tokenInput.trim());
    setAdminToken(tokenInput.trim());
  };

  if (status === "loading") {
    return <div className="min-h-screen flex items-center justify-center">Caricamento…</div>;
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-4 sm:p-6 max-w-5xl mx-auto">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <KeyRound className="h-6 w-6 text-amber-400" />
            Beta Tester — Codici d'accesso
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Genera codici monouso per permettere l'accesso senza Google
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push("/admin/feedback")}>
            Bug Reports
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.push("/")}>
            ← App
          </Button>
        </div>
      </header>

      {/* Admin token setup */}
      {!adminToken ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="h-4 w-4 text-amber-400" />
            <h2 className="text-sm font-semibold">Configura il token admin</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Inserisci il <code className="bg-secondary/50 px-1 py-0.5 rounded">BETA_ADMIN_TOKEN</code> configurato nelle env vars di Vercel.
          </p>
          <div className="flex gap-2">
            <Input
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="BETA_ADMIN_TOKEN"
              onKeyDown={(e) => e.key === "Enter" && saveToken()}
            />
            <Button onClick={saveToken}>Salva</Button>
          </div>
        </div>
      ) : (
        <>
          {/* Generate new code */}
          <div className="rounded-lg border border-border/40 bg-card/50 p-4 mb-6">
            <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
              <UserPlus className="h-4 w-4" />
              Genera nuovo codice
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="new-email">Email del beta tester</Label>
                <Input
                  id="new-email"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="amico@example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-note">Nota (opzionale)</Label>
                <Input
                  id="new-note"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Es: Marco — iPhone 13"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-expires">Scadenza (giorni)</Label>
                <Input
                  id="new-expires"
                  type="number"
                  min="1"
                  max="365"
                  value={newExpiresDays}
                  onChange={(e) => setNewExpiresDays(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button onClick={generate} disabled={generating} className="w-full">
                  {generating ? "Generazione…" : (
                    <>
                      <Plus className="h-4 w-4" />
                      Genera codice
                    </>
                  )}
                </Button>
              </div>
            </div>

            {lastGenerated && (
              <div className="mt-4 rounded-md border border-green-500/30 bg-green-500/5 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-4 w-4 text-green-400" />
                  <span className="text-sm font-semibold">Codice generato per {lastGenerated.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 font-mono text-2xl tracking-[0.3em] bg-secondary/50 px-3 py-2 rounded text-center">
                    {lastGenerated.code}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(lastGenerated.code)}
                  >
                    {copied === lastGenerated.code ? (
                      <><Check className="h-3.5 w-3.5" /> Copiato</>
                    ) : (
                      <><Copy className="h-3.5 w-3.5" /> Copia</>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Invia questo codice al beta tester (via WhatsApp, Telegram, ecc.).
                  Lui dovrà aprire l'app, cliccare "Beta" in alto a destra, inserire la
                  sua email e questo codice.
                </p>
              </div>
            )}

            {error && (
              <div className="mt-3 rounded-md border border-red-500/30 bg-red-500/5 p-2 text-xs text-red-400">
                {error}
              </div>
            )}
          </div>

          {/* Existing codes */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Codici esistenti ({codes.length})</h2>
            <Button size="sm" variant="ghost" onClick={fetchCodes} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Aggiorna
            </Button>
          </div>

          {codes.length === 0 && !loading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Nessun codice generato ancora.
            </div>
          ) : (
            <div className="space-y-2">
              {codes.map((c) => {
                const isUsed = !!c.used_at;
                const isExpired = !isUsed && new Date(c.expires_at) < new Date();
                return (
                  <div
                    key={c.id}
                    className="rounded-lg border border-border/40 bg-card/50 p-3 flex items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <code className="font-mono text-base tracking-widest font-semibold">
                          {c.code}
                        </code>
                        {isUsed && (
                          <Badge variant="outline" className="bg-gray-500/15 text-gray-400 border-gray-500/30">
                            Usato
                          </Badge>
                        )}
                        {!isUsed && !isExpired && (
                          <Badge variant="outline" className="bg-green-500/15 text-green-400 border-green-500/30">
                            Attivo
                          </Badge>
                        )}
                        {isExpired && (
                          <Badge variant="outline" className="bg-red-500/15 text-red-400 border-red-500/30">
                            Scaduto
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
                        <span className="font-mono">{c.email}</span>
                        {c.note && <span>· {c.note}</span>}
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {isUsed
                            ? `usato ${new Date(c.used_at!).toLocaleDateString("it-IT")}`
                            : `scade ${new Date(c.expires_at).toLocaleDateString("it-IT")}`}
                        </span>
                      </div>
                    </div>
                    {!isUsed && !isExpired && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyToClipboard(c.code)}
                      >
                        {copied === c.code ? (
                          <><Check className="h-3.5 w-3.5" /></>
                        ) : (
                          <><Copy className="h-3.5 w-3.5" /></>
                        )}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
