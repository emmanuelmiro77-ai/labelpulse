"use client";

import { useState, useEffect, useCallback } from "react";
import { Bug, Send, X, Loader2, MessageCircle, Reply, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useSession } from "next-auth/react";
import { useAppStore } from "@/lib/store";

type MyReply = {
  id: number;
  category: "bug" | "feature" | "praise" | "complaint" | "other";
  subject: string | null;
  message: string;
  status: string;
  created_at: string;
  admin_reply: string;
  admin_replied_at: string;
  admin_reply_seen_at: string | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  bug: "Bug",
  feature: "Funzione",
  praise: "Apprezzamento",
  complaint: "Lamento",
  other: "Altro",
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "ora";
  if (min < 60) return `${min}m fa`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h fa`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}g fa`;
  return new Date(iso).toLocaleDateString("it-IT");
}

/**
 * Beta Feedback Button
 *
 * Small button visible in the header (only when authenticated) that opens a
 * modal where beta testers can:
 *   - Describe a bug
 *   - Suggest a feature
 *   - Give general feedback
 *   - Read replies from the admin
 *
 * The feedback is sent to a Supabase table `beta_feedback` (auto-created on
 * first submission via the API route). Each submission includes:
 *   - User email (from session)
 *   - User agent (browser/OS)
 *   - Current URL
 *   - App version
 *   - Number of labels/demos (to gauge usage level)
 *   - Timestamp
 *   - The feedback text + category
 *
 * This is critical for beta testing: without a feedback channel, you have no
 * way to know what's broken for users.
 */
export function BetaFeedbackButton() {
  const { data: session } = useSession();
  const { locale, labels, demos } = useAppStore();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<"bug" | "feature" | "other">("bug");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  // Replies state
  const [repliesOpen, setRepliesOpen] = useState(false);
  const [replies, setReplies] = useState<MyReply[]>([]);
  const [unseenCount, setUnseenCount] = useState(0);
  const [loadingReplies, setLoadingReplies] = useState(false);

  // Don't show the button if the user is not logged in — we need their email
  // to follow up. The unauthenticated banner already tells them to log in.
  const email = session?.user?.email;

  const fetchReplies = useCallback(async (includeSeen: boolean = false, markSeen: boolean = false) => {
    if (!email) return;
    try {
      const params = new URLSearchParams();
      if (includeSeen) params.set("includeSeen", "true");
      if (markSeen) params.set("markSeen", "true");
      const url = `/api/beta-feedback/my-replies${params.toString() ? `?${params.toString()}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      setReplies(data.items || []);
      setUnseenCount(data.unseenCount || 0);
    } catch (err) {
      console.error("fetchReplies failed:", err);
    }
  }, [email]);

  // Poll for unseen replies on mount + every 60s while logged in
  useEffect(() => {
    if (!email) return;
    fetchReplies(false, false);
    const interval = setInterval(() => {
      fetchReplies(false, false);
    }, 60000);
    return () => clearInterval(interval);
  }, [email, fetchReplies]);

  // When opening the replies dialog, fetch all (seen + unseen) and mark as seen
  useEffect(() => {
    if (repliesOpen && email) {
      setLoadingReplies(true);
      fetchReplies(true, true).finally(() => setLoadingReplies(false));
    }
  }, [repliesOpen, email, fetchReplies]);

  const handleSubmit = async () => {
    if (!message.trim()) {
      toast({
        title: locale === "it" ? "Messaggio vuoto" : "Empty message",
        description:
          locale === "it"
            ? "Scrivi qualcosa prima di inviare."
            : "Please write something before sending.",
        variant: "destructive",
      });
      return;
    }

    setSending(true);
    try {
      const res = await fetch("/api/beta-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          category,
          subject: subject.trim(),
          message: message.trim(),
          userAgent: navigator.userAgent,
          url: window.location.href,
          appVersion: "v2.1",
          labelCount: labels.length,
          demoCount: demos.length,
          locale,
        }),
      });

      if (!res.ok) throw new Error("Failed to submit feedback");

      toast({
        title: locale === "it" ? "Feedback inviato!" : "Feedback sent!",
        description:
          locale === "it"
            ? "Grazie. Lo esamineremo il prima possibile."
            : "Thank you. We'll review it as soon as possible.",
      });
      // Track feedback submitted for funnel analytics
      void import("@/lib/analytics").then(({ trackEvent }) => {
        trackEvent("feedback_submitted", { category });
      });
      setSubject("");
      setMessage("");
      setCategory("bug");
      setOpen(false);
    } catch (err) {
      console.error("Feedback submission failed:", err);
      toast({
        title: locale === "it" ? "Errore invio" : "Send error",
        description:
          locale === "it"
            ? "Impossibile inviare il feedback. Riprova più tardi."
            : "Could not send feedback. Please try again later.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  if (!email) return null;

  return (
    <>
      <div className="flex items-center gap-1">
        {/* Replies bell — only render if user has any replies (seen or unseen) */}
        {(unseenCount > 0 || replies.length > 0) && (
          <Button
            variant="ghost"
            size="sm"
            className="relative gap-1.5 text-xs text-muted-foreground hover:text-primary"
            onClick={() => setRepliesOpen(true)}
            title={locale === "it" ? "Risposte dall'admin" : "Admin replies"}
          >
            <Bell className="h-3.5 w-3.5" />
            {unseenCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold bg-primary text-primary-foreground">
                {unseenCount}
              </span>
            )}
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-xs text-muted-foreground hover:text-amber-400"
          onClick={() => setOpen(true)}
          title={locale === "it" ? "Segnala un problema o suggerisci una funzione" : "Report a bug or suggest a feature"}
        >
          <Bug className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">
            {locale === "it" ? "Feedback" : "Feedback"}
          </span>
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bug className="h-5 w-5 text-amber-400" />
              {locale === "it" ? "Segnala un problema" : "Report an issue"}
            </DialogTitle>
            <DialogDescription>
              {locale === "it"
                ? "Hai trovato un bug? Hai un'idea per migliorare l'app? Scrivici — leggiamo tutto."
                : "Found a bug? Have an idea to improve the app? Write us — we read everything."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{locale === "it" ? "Tipo" : "Type"}</Label>
              <div className="flex gap-2">
                {([
                  { id: "bug", label: locale === "it" ? "Bug" : "Bug" },
                  { id: "feature", label: locale === "it" ? "Funzione" : "Feature" },
                  { id: "other", label: locale === "it" ? "Altro" : "Other" },
                ] as const).map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setCategory(opt.id)}
                    className={`flex-1 px-3 py-2 rounded-md text-xs font-medium transition-colors border ${
                      category === opt.id
                        ? "bg-primary/15 border-primary text-primary"
                        : "bg-transparent border-border/50 text-muted-foreground hover:bg-secondary/50"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="feedback-subject">
                {locale === "it" ? "Oggetto (opzionale)" : "Subject (optional)"}
              </Label>
              <Input
                id="feedback-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={
                  locale === "it"
                    ? "Es: Login non funziona su iPhone"
                    : "E.g.: Login doesn't work on iPhone"
                }
                maxLength={100}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="feedback-message">
                {locale === "it" ? "Descrizione" : "Description"} *
              </Label>
              <Textarea
                id="feedback-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={
                  locale === "it"
                    ? "Cosa è successo? Cosa ti aspettavi? Su che dispositivo/browser?"
                    : "What happened? What did you expect? On which device/browser?"
                }
                rows={5}
                maxLength={2000}
              />
              <p className="text-xs text-muted-foreground">
                {message.length}/2000
              </p>
            </div>

            <div className="rounded-md bg-secondary/30 p-3 text-xs text-muted-foreground border border-border/30">
              {locale === "it" ? "Inviato da:" : "Sent from:"}{" "}
              <span className="font-mono text-foreground">{email}</span>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>
              <X className="h-4 w-4" />
              {locale === "it" ? "Annulla" : "Cancel"}
            </Button>
            <Button onClick={handleSubmit} disabled={sending || !message.trim()}>
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {locale === "it" ? "Invia" : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Replies dialog — shows admin replies to user's feedback */}
      <Dialog open={repliesOpen} onOpenChange={setRepliesOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Reply className="h-5 w-5 text-primary" />
              {locale === "it" ? "Risposte dall'admin" : "Admin replies"}
            </DialogTitle>
            <DialogDescription>
              {locale === "it"
                ? "Le risposte ai tuoi feedback, in ordine cronologico."
                : "Replies to your feedback, in chronological order."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {loadingReplies ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : replies.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">
                  {locale === "it"
                    ? "Nessuna risposta ancora. Quando l'admin risponderà ai tuoi feedback, le troverai qui."
                    : "No replies yet. When the admin responds to your feedback, you'll find them here."}
                </p>
              </div>
            ) : (
              replies.map((r) => (
                <div
                  key={r.id}
                  className={`rounded-md border p-3 space-y-2 ${
                    !r.admin_reply_seen_at
                      ? "border-primary/40 bg-primary/5"
                      : "border-border/40 bg-card/50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] uppercase px-1.5 py-0.5 rounded border border-border/40 text-muted-foreground">
                        {CATEGORY_LABELS[r.category] || r.category}
                      </span>
                      {!r.admin_reply_seen_at && (
                        <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-primary text-primary-foreground font-semibold">
                          Nuova
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {formatRelative(r.admin_replied_at)}
                    </span>
                  </div>

                  {r.subject && (
                    <p className="text-sm font-medium text-foreground">
                      {r.subject}
                    </p>
                  )}
                  <div className="rounded bg-secondary/20 p-2 text-xs text-muted-foreground">
                    <span className="opacity-60">Tu: </span>
                    <span className="line-clamp-3">{r.message}</span>
                  </div>
                  <div className="rounded bg-primary/10 border border-primary/20 p-2.5 text-sm text-foreground whitespace-pre-wrap">
                    <span className="text-[10px] text-primary font-semibold uppercase block mb-1">Admin</span>
                    {r.admin_reply}
                  </div>
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRepliesOpen(false)}>
              {locale === "it" ? "Chiudi" : "Close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
