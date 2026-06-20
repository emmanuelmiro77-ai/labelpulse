"use client";

import { useState } from "react";
import { Bug, Send, X, Loader2 } from "lucide-react";
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

/**
 * Beta Feedback Button
 *
 * Small button visible in the header (only when authenticated) that opens a
 * modal where beta testers can:
 *   - Describe a bug
 *   - Suggest a feature
 *   - Give general feedback
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

  // Don't show the button if the user is not logged in — we need their email
  // to follow up. The unauthenticated banner already tells them to log in.
  if (!session?.user?.email) return null;

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
          email: session.user.email,
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

  return (
    <>
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
              <span className="font-mono text-foreground">{session.user.email}</span>
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
    </>
  );
}
