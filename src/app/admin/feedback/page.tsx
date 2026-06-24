"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Bug, CheckCircle2, Eye, RefreshCw, Trash2, Inbox, AlertCircle, Reply, Send, Loader2, Check, Pencil } from "lucide-react";
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
  admin_reply?: string | null;
  admin_replied_at?: string | null;
  admin_reply_seen_at?: string | null;
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
  const [replyMode, setReplyMode] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [notifStatus, setNotifStatus] = useState<{
    push?: { sent: number; gone: number } | null;
    email?: { ok: boolean; error?: string } | null;
  } | null>(null);

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

  const sendReply = async () => {
    if (!selected || !adminToken) return;
    if (!replyText.trim()) {
      alert("Scrivi qualcosa prima di inviare.");
      return;
    }
    setSendingReply(true);
    setNotifStatus(null);
    const replyContent = replyText.trim();
    try {
      const res = await fetch(`/api/beta-feedback?id=${selected.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ adminReply: replyContent }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json().catch(() => ({}));
      const pushResult: { sent: number; gone: number } | null = data.push ?? null;

      // Send email from admin's Gmail (best-effort — admin is logged in via Google OAuth)
      let emailResult: { ok: boolean; error?: string } | null = null;
      try {
        const emailSubject = selected.subject
          ? `LabelPulse — Risposta al tuo feedback: ${selected.subject}`
          : "LabelPulse — Risposta al tuo feedback";
        const emailBody = [
          `Ciao,`,
          ``,
          `Hai ricevuto una risposta al tuo feedback su LabelPulse.`,
          ``,
          `--- Il tuo feedback ---`,
          selected.subject ? `Oggetto: ${selected.subject}` : "",
          selected.subject ? `` : null,
          selected.message,
          `-----------------------`,
          ``,
          `--- Risposta ---`,
          replyContent,
          `-----------------`,
          ``,
          `Apri l'app per rispondere o inviare un nuovo feedback:`,
          `https://labelpulse.vercel.app/`,
          ``,
          `— Team LabelPulse`,
        ].filter(Boolean).join("\n");

        const emailRes = await fetch("/api/gmail/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: selected.email,
            subject: emailSubject,
            body: emailBody,
          }),
        });
        if (emailRes.ok) {
          emailResult = { ok: true };
        } else {
          const errData = await emailRes.json().catch(() => ({}));
          emailResult = { ok: false, error: errData.error || `HTTP ${emailRes.status}` };
        }
      } catch (err: any) {
        emailResult = { ok: false, error: err.message || "Network error" };
      }

      setNotifStatus({ push: pushResult, email: emailResult });

      // Refresh list + update selected
      await fetchFeedbacks();
      const now = new Date().toISOString();
      setSelected({
        ...selected,
        admin_reply: replyContent,
        admin_replied_at: selected.admin_replied_at || now,
        admin_reply_seen_at: null,
        status: selected.status === "new" || selected.status === "read" ? "resolved" : selected.status,
      });
      setReplyMode(false);
      setReplyText("");
    } catch (err: any) {
      alert(`Errore invio risposta: ${err.message}`);
    } finally {
      setSendingReply(false);
    }
  };

  const openReplyEditor = () => {
    setReplyText(selected?.admin_reply || "");
    setReplyMode(true);
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
                    setNotifStatus(null);
                    setReplyMode(false);
                    setReplyText("");
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
                        {(f as any).admin_reply && (
                          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-[10px]">
                            <Reply className="h-2.5 w-2.5 mr-1" /> Risposto
                          </Badge>
                        )}
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

                  {/* Admin reply section */}
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Reply className="h-4 w-4 text-primary" />
                        <h4 className="text-sm font-semibold">Risposta all'utente</h4>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        {selected.admin_replied_at && (
                          <span>
                            {new Date(selected.admin_replied_at).toLocaleString("it-IT")}
                          </span>
                        )}
                        {selected.admin_reply && selected.admin_reply_seen_at && (
                          <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-400 border-green-500/30">
                            <Check className="h-3 w-3 mr-1" /> Vista
                          </Badge>
                        )}
                        {selected.admin_reply && !selected.admin_reply_seen_at && (
                          <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/30">
                            Non letta
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Existing reply (read-only) */}
                    {selected.admin_reply && !replyMode && (
                      <div className="space-y-2">
                        <div className="whitespace-pre-wrap text-sm font-sans bg-background/50 rounded-md p-2.5 border border-border/30">
                          {selected.admin_reply}
                        </div>
                        <Button size="sm" variant="outline" onClick={openReplyEditor}>
                          <Pencil className="h-3.5 w-3.5" /> Modifica risposta
                        </Button>
                      </div>
                    )}

                    {/* Reply editor (new or edit) */}
                    {(replyMode || !selected.admin_reply) && (
                      <div className="space-y-2">
                        <textarea
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="Scrivi qui la tua risposta all'utente. La vedrà nella sua app la prossima volta che apre il pulsante Feedback."
                          rows={5}
                          maxLength={5000}
                          className="w-full text-sm font-sans bg-background/50 rounded-md p-2.5 border border-border/40 focus:outline-none focus:border-primary resize-y min-h-[100px]"
                          disabled={sendingReply}
                        />
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] text-muted-foreground">
                            {replyText.length}/5000
                          </span>
                          <div className="flex gap-2">
                            {selected.admin_reply && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setReplyMode(false);
                                  setReplyText("");
                                }}
                                disabled={sendingReply}
                              >
                                Annulla
                              </Button>
                            )}
                            <Button
                              size="sm"
                              onClick={sendReply}
                              disabled={sendingReply || !replyText.trim()}
                            >
                              {sendingReply ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Send className="h-3.5 w-3.5" />
                              )}
                              {selected.admin_reply ? "Aggiorna" : "Invia risposta"}
                            </Button>
                          </div>
                        </div>
                        <p className="text-[11px] text-muted-foreground/80 leading-snug">
                          {selected.admin_reply
                            ? "L'utente vedrà il messaggio aggiornato e riceverà di nuovo il badge \"nuova risposta\"."
                            : "Quando invii, lo status passa automaticamente a \"Risolto\" e l'utente vede un badge nella sua app."}
                        </p>
                      </div>
                    )}

                    {/* Notification status — shown after a reply is sent */}
                    {notifStatus && (
                      <div className="rounded-md border border-border/30 bg-background/40 p-2.5 space-y-1.5 text-xs">
                        <p className="font-semibold text-foreground flex items-center gap-1.5">
                          <Send className="h-3 w-3" /> Notifiche inviate
                        </p>
                        <div className="flex items-start gap-2">
                          <span className="text-muted-foreground shrink-0 w-14">Email:</span>
                          {notifStatus.email?.ok ? (
                            <span className="text-green-400">✓ Inviata a {selected.email}</span>
                          ) : (
                            <span className="text-amber-400">
                              ⚠ Non inviata{notifStatus.email?.error ? ` — ${notifStatus.email.error}` : ""}
                              <span className="block text-[10px] text-muted-foreground/70 mt-0.5">
                                (La risposta è comunque visibile nell'app. Per inviare email, assicurati di aver fatto login con Gmail.)
                              </span>
                            </span>
                          )}
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-muted-foreground shrink-0 w-14">Push:</span>
                          {notifStatus.push == null ? (
                            <span className="text-muted-foreground">— Non tentata</span>
                          ) : notifStatus.push.sent > 0 ? (
                            <span className="text-green-400">
                              ✓ Consegnata a {notifStatus.push.sent} dispositivo/i
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              — L'utente non ha attivato le notifiche push (badge in-app rimane attivo)
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

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
