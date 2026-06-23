"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Bug, CheckCircle2, Eye, RefreshCw, Trash2, Inbox, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type Feedback = {
  id: number;
  email: string;
  category: "bug" | "feature" | "other";
  subject: string | null;
  message: string;
  user_agent: string | null;
  url: string | null;
  app_version: string | null;
  label_count: number;
  demo_count: number;
  locale: string | null;
  status: "new" | "read" | "resolved" | "ignored";
  created_at: string;
};

const ADMIN_EMAILS = new Set(["emmanuel.miro77@gmail.com"]);

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  bug: { label: "Bug", color: "bg-red-500/15 text-red-400 border-red-500/30" },
  feature: { label: "Feature", color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  other: { label: "Altro", color: "bg-gray-500/15 text-gray-400 border-gray-500/30" },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  new: { label: "Nuovo", color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  read: { label: "Letto", color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  resolved: { label: "Risolto", color: "bg-green-500/15 text-green-400 border-green-500/30" },
  ignored: { label: "Ignorato", color: "bg-gray-500/15 text-gray-400 border-gray-500/30" },
};

export default function AdminFeedbackPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adminToken, setAdminToken] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selected, setSelected] = useState<Feedback | null>(null);

  // Load token from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("beta_admin_token");
    if (stored) {
      setAdminToken(stored);
      setTokenInput(stored);
    }
  }, []);

  // Guard: only admin email can access
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

  const fetchFeedbacks = async () => {
    if (!adminToken) return;
    setLoading(true);
    setError(null);
    try {
      const url = filterStatus === "all"
        ? "/api/beta-feedback"
        : `/api/beta-feedback?status=${filterStatus}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status}: ${txt}`);
      }
      const data = await res.json();
      setFeedbacks(data.feedback || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (adminToken) fetchFeedbacks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminToken, filterStatus]);

  const updateStatus = async (id: number, newStatus: string) => {
    if (!adminToken) return;
    try {
      const res = await fetch(`/api/beta-feedback?id=${id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error(await res.text());
      // Refresh list
      await fetchFeedbacks();
      if (selected?.id === id) {
        setSelected({ ...selected, status: newStatus as any });
      }
    } catch (err: any) {
      alert(`Errore aggiornamento: ${err.message}`);
    }
  };

  const saveToken = () => {
    localStorage.setItem("beta_admin_token", tokenInput.trim());
    setAdminToken(tokenInput.trim());
  };

  if (status === "loading") {
    return <div className="min-h-screen flex items-center justify-center">Caricamento…</div>;
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-4 sm:p-6 max-w-6xl mx-auto">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bug className="h-6 w-6 text-amber-400" />
            Feedback & Bug Reports
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Inviati dai beta tester dall'app
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => router.push("/")}>
          ← Torna all'app
        </Button>
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
            Viene salvato solo in questo browser (localStorage).
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
          {/* Filters */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {["all", "new", "read", "resolved", "ignored"].map((s) => (
              <Button
                key={s}
                size="sm"
                variant={filterStatus === s ? "default" : "outline"}
                onClick={() => setFilterStatus(s)}
              >
                {s === "all" ? "Tutti" : (STATUS_LABELS[s]?.label || s)}
              </Button>
            ))}
            <div className="flex-1" />
            <Button size="sm" variant="ghost" onClick={fetchFeedbacks} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Aggiorna
            </Button>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-400 mb-4">
              {error}
            </div>
          )}

          {/* Feedback list */}
          {feedbacks.length === 0 && !loading ? (
            <div className="text-center py-12 text-muted-foreground">
              <Inbox className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>Nessun feedback in questa categoria.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {feedbacks.map((f) => (
                <button
                  key={f.id}
                  onClick={() => {
                    setSelected(f);
                    if (f.status === "new") updateStatus(f.id, "read");
                  }}
                  className="w-full text-left rounded-lg border border-border/40 bg-card/50 p-3 hover:bg-card transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge variant="outline" className={CATEGORY_LABELS[f.category]?.color}>
                          {CATEGORY_LABELS[f.category]?.label}
                        </Badge>
                        <Badge variant="outline" className={STATUS_LABELS[f.status]?.color}>
                          {STATUS_LABELS[f.status]?.label}
                        </Badge>
                        {f.subject && (
                          <span className="text-sm font-medium truncate">
                            {f.subject}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-1.5">
                        {f.message}
                      </p>
                      <div className="text-[11px] text-muted-foreground/70 flex items-center gap-3">
                        <span className="font-mono">{f.email}</span>
                        <span>{new Date(f.created_at).toLocaleString("it-IT")}</span>
                        {f.app_version && <span>{f.app_version}</span>}
                        {f.locale && <span className="uppercase">{f.locale}</span>}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Detail modal */}
          {selected && (
            <div
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
              onClick={() => setSelected(null)}
            >
              <div
                className="bg-background border border-border/40 rounded-lg max-w-2xl w-full max-h-[85vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={CATEGORY_LABELS[selected.category]?.color}>
                        {CATEGORY_LABELS[selected.category]?.label}
                      </Badge>
                      <Badge variant="outline" className={STATUS_LABELS[selected.status]?.color}>
                        {STATUS_LABELS[selected.status]?.label}
                      </Badge>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
                      ✕
                    </Button>
                  </div>

                  {selected.subject && (
                    <h3 className="text-lg font-semibold mb-2">{selected.subject}</h3>
                  )}
                  <pre className="whitespace-pre-wrap text-sm font-sans bg-secondary/30 rounded-md p-3 mb-4">
                    {selected.message}
                  </pre>

                  <div className="grid grid-cols-2 gap-3 text-xs mb-4">
                    <Field label="Da" value={selected.email} mono />
                    <Field label="Data" value={new Date(selected.created_at).toLocaleString("it-IT")} />
                    <Field label="Versione app" value={selected.app_version || "—"} />
                    <Field label="Lingua" value={(selected.locale || "—").toUpperCase()} />
                    <Field label="N. label" value={String(selected.label_count)} />
                    <Field label="N. demo" value={String(selected.demo_count)} />
                    <Field label="URL" value={selected.url || "—"} mono />
                    <Field label="User agent" value={selected.user_agent || "—"} mono />
                  </div>

                  {/* Status actions */}
                  <div className="flex flex-wrap gap-2 pt-3 border-t border-border/30">
                    <Button size="sm" variant="outline" onClick={() => updateStatus(selected.id, "new")}>
                      <Eye className="h-3.5 w-3.5" /> Nuovo
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => updateStatus(selected.id, "read")}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Letto
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => updateStatus(selected.id, "resolved")}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Risolto
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => updateStatus(selected.id, "ignored")}>
                      <Trash2 className="h-3.5 w-3.5" /> Ignora
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-muted-foreground mb-0.5">{label}</div>
      <div className={`text-foreground break-all ${mono ? "font-mono text-[10px]" : ""}`}>
        {value}
      </div>
    </div>
  );
}
