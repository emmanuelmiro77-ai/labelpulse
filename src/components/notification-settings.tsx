"use client";

/**
 * NotificationSettings — UI for enabling/disabling Web Push notifications
 * and choosing which categories the user wants to receive.
 *
 * Categories:
 *   - followUp:   7-day reminder for demos awaiting reply
 *   - rankings:   notify when admin updates Beatport rankings
 *   - weeklyRecap: Monday 9am recap of the previous week's activity
 *
 * Flow:
 *   1. User clicks "Abilita notifiche" → browser shows permission prompt
 *   2. On grant: subscribe via PushManager → POST /api/push/subscribe
 *   3. master flag set to true, all 3 categories enabled by default
 *   4. User can toggle individual categories → POST /api/push/update-prefs
 *   5. "Disabilita" button → unsubscribe + POST /api/push/unsubscribe
 *   6. "Invia test" button → POST /api/push/test
 *
 * iOS note: requires app to be added to Home Screen (PWA). The UI explains
 * this if iOS is detected.
 */

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Bell, BellOff, Send, RefreshCw, AlertCircle, CheckCircle2, Smartphone, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAppStore } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isStandalonePWA(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

export function NotificationSettings() {
  const { data: session } = useSession();
  const { userProfile, setUserProfile, locale } = useAppStore();
  const { toast } = useToast();
  const isItalian = locale === "it";

  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [subscribing, setSubscribing] = useState(false);
  const [testing, setTesting] = useState(false);
  // Whether the browser currently holds an active PushSubscription.
  // This is the SOURCE OF TRUTH for UI state — NOT userProfile.notifications.master,
  // because cloud sync / sidecar restore can wipe that field via shallow merge.
  const [hasSubscription, setHasSubscription] = useState(false);

  const email = session?.user?.email;
  const notifications = userProfile.notifications || {
    master: false,
    followUp: true,
    rankings: true,
    weeklyRecap: true,
  };

  // Check actual push subscription state on mount + whenever permission changes
  const refreshSubscriptionState = async () => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setHasSubscription(false);
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setHasSubscription(!!sub);
    } catch {
      setHasSubscription(false);
    }
  };

  useEffect(() => {
    if (typeof Notification === "undefined") {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
    refreshSubscriptionState();
  }, []);

  // Don't render for unauthenticated users
  if (!email) return null;

  const isIOSDevice = isIOS();
  const isPWAMode = isStandalonePWA();
  const showIOSHint = isIOSDevice && !isPWAMode;

  const updateLocalPrefs = (
    key: "master" | "followUp" | "rankings" | "weeklyRecap",
    value: boolean
  ) => {
    setUserProfile({
      notifications: { ...notifications, [key]: value },
    });
  };

  const handleEnable = async () => {
    if (!email) return;
    if (typeof Notification === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      toast({
        title: isItalian ? "Non supportato" : "Not supported",
        description: isItalian
          ? "Il tuo browser non supporta le notifiche push. Usa Chrome, Edge, Firefox o Safari 16.4+."
          : "Your browser doesn't support web push. Use Chrome, Edge, Firefox or Safari 16.4+.",
        variant: "destructive",
      });
      return;
    }

    if (showIOSHint) {
      toast({
        title: isItalian ? "Aggiungi alla Home" : "Add to Home Screen",
        description: isItalian
          ? "Su iPhone le notifiche push funzionano solo se l'app è aggiunta alla Home Screen. Apri in Safari → Condividi → Aggiungi a Home."
          : "On iPhone, push notifications only work if the app is added to the Home Screen. Open in Safari → Share → Add to Home.",
        variant: "destructive",
      });
      return;
    }

    setSubscribing(true);
    try {
      // 1. Ask permission
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        toast({
          title: isItalian ? "Permesso negato" : "Permission denied",
          description: isItalian
            ? "Hai bloccato le notifiche. Abilitale dalle impostazioni del browser per riprovare."
            : "You blocked notifications. Enable them in your browser settings to retry.",
          variant: "destructive",
        });
        return;
      }

      // 2. Register service worker and subscribe
      const reg = await navigator.serviceWorker.ready;
      const existingSub = await reg.pushManager.getSubscription();
      const sub =
        existingSub ||
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(
            process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
          ),
        }));

      // 3. Save subscription on server
      const prefs = {
        followUp: notifications.followUp,
        rankings: notifications.rankings,
        weeklyRecap: notifications.weeklyRecap,
      };
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          subscription: {
            endpoint: sub.endpoint,
            keys: {
              p256dh: btoa(String.fromCharCode(...new Uint8Array(sub.getKey("p256dh")!))),
              auth: btoa(String.fromCharCode(...new Uint8Array(sub.getKey("auth")!))),
            },
          },
          prefs,
        }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      // 4. Update local state
      updateLocalPrefs("master", true);
      await refreshSubscriptionState();
      toast({
        title: isItalian ? "Notifiche attivate! 🔔" : "Notifications enabled! 🔔",
        description: isItalian
          ? "Riceverai notifiche per follow-up, classifiche e recap settimanale."
          : "You'll get notifications for follow-ups, rankings, and weekly recap.",
      });
    } catch (err: any) {
      console.error("[NotificationSettings] subscribe failed:", err);
      toast({
        title: isItalian ? "Errore attivazione" : "Activation failed",
        description: err?.message || String(err),
        variant: "destructive",
      });
    } finally {
      setSubscribing(false);
    }
  };

  const handleDisable = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
      }
      updateLocalPrefs("master", false);
      await refreshSubscriptionState();
      toast({
        title: isItalian ? "Notifiche disattivate" : "Notifications disabled",
      });
    } catch (err: any) {
      console.error("[NotificationSettings] unsubscribe failed:", err);
      toast({
        title: isItalian ? "Errore" : "Error",
        description: err?.message,
        variant: "destructive",
      });
    }
  };

  const handleTogglePref = async (
    key: "followUp" | "rankings" | "weeklyRecap",
    value: boolean
  ) => {
    updateLocalPrefs(key, value);
    // Mirror to server
    try {
      const newPrefs = { ...notifications, [key]: value };
      await fetch("/api/push/update-prefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, prefs: newPrefs }),
      });
    } catch (err) {
      console.error("[NotificationSettings] update-prefs failed:", err);
    }
  };

  const handleTest = async () => {
    if (!email) return;
    setTesting(true);
    try {
      const res = await fetch("/api/push/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast({
          title: isItalian ? "Test inviato! 🔔" : "Test sent! 🔔",
          description: isItalian
            ? "Dovresti vedere una notifica tra pochi secondi."
            : "You should see a notification in a few seconds.",
        });
      } else {
        toast({
          title: isItalian ? "Nessuna notifica inviata" : "No notification sent",
          description: data?.hint || data?.error || "Unknown error",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: isItalian ? "Errore" : "Error",
        description: err?.message,
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  };

  // Source of truth: actual browser PushSubscription + granted permission.
  // Falls back to userProfile.notifications.master only if the SW check
  // hasn't completed yet (hasSubscription starts false on first render).
  const isEnabled = permission === "granted" && (hasSubscription || notifications.master);

  return (
    <div className="rounded-lg border border-border/40 bg-card/30 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-amber-400" />
          <p className="text-sm font-semibold text-foreground">
            {isItalian ? "Notifiche Push" : "Push Notifications"}
          </p>
        </div>
        {isEnabled && (
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded px-1.5 py-0.5 font-medium">
            <CheckCircle2 className="h-3 w-3" /> ON
          </span>
        )}
      </div>

      {/* iOS hint */}
      {showIOSHint && (
        <div className="flex items-start gap-2 p-2.5 rounded-md bg-blue-500/10 border border-blue-500/30">
          <Smartphone className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-300 leading-snug">
            {isItalian
              ? "Su iPhone le notifiche push funzionano solo se l'app è aggiunta alla Home Screen. Apri questa pagina in Safari → pulsante Condividi → \"Aggiungi a Home\"."
              : "On iPhone, push notifications only work if the app is added to the Home Screen. Open this page in Safari → Share button → \"Add to Home\"."}
          </p>
        </div>
      )}

      {/* Unsupported browser */}
      {permission === "unsupported" && (
        <div className="flex items-start gap-2 p-2.5 rounded-md bg-amber-500/10 border border-amber-500/30">
          <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-400 leading-snug">
            {isItalian
              ? "Il tuo browser non supporta le notifiche push. Usa Chrome, Edge, Firefox o Safari 16.4+."
              : "Your browser doesn't support web push. Use Chrome, Edge, Firefox or Safari 16.4+."}
          </p>
        </div>
      )}

      {/* Permission denied */}
      {permission === "denied" && (
        <div className="flex items-start gap-2 p-2.5 rounded-md bg-red-500/10 border border-red-500/30">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-400 leading-snug">
            {isItalian
              ? "Hai bloccato le notifiche. Per riattivarle: impostazioni del browser → permessi sito → LabelPulse → consenti notifiche."
              : "You blocked notifications. To re-enable: browser settings → site permissions → LabelPulse → allow notifications."}
          </p>
        </div>
      )}

      {/* Master toggle / enable button */}
      {!isEnabled && permission !== "unsupported" && permission !== "denied" && (
        <>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {isItalian
              ? "Ricevi notifiche push sul telefono e sul desktop per restare aggiornato sui tuoi demo e sulle novità dell'app."
              : "Get push notifications on your phone and desktop to stay on top of your demos and app news."}
          </p>
          <Button
            onClick={handleEnable}
            disabled={subscribing || showIOSHint}
            className="w-full gap-2"
            size="sm"
          >
            <Bell className="h-4 w-4" />
            {subscribing
              ? isItalian ? "Attivazione..." : "Enabling..."
              : isItalian ? "Abilita notifiche" : "Enable notifications"}
          </Button>
        </>
      )}

      {/* Enabled: show categories + disable + test */}
      {isEnabled && (
        <>
          {/* Category toggles */}
          <div className="space-y-2 pt-1">
            <CategoryToggle
              label={isItalian ? "Reminder follow-up (7 giorni)" : "Follow-up reminder (7 days)"}
              desc={isItalian
                ? "Ricevi un reminder 7 giorni dopo aver inviato un demo senza risposta."
                : "Get a reminder 7 days after sending a demo without a reply."}
              checked={notifications.followUp}
              onCheckedChange={(v) => handleTogglePref("followUp", v)}
            />
            <CategoryToggle
              label={isItalian ? "Classifiche aggiornate" : "Rankings updated"}
              desc={isItalian
                ? "Ricevi una notifica quando l'admin aggiorna le classifiche Beatport."
                : "Get notified when the admin updates Beatport rankings."}
              checked={notifications.rankings}
              onCheckedChange={(v) => handleTogglePref("rankings", v)}
            />
            <CategoryToggle
              label={isItalian ? "Recap settimanale" : "Weekly recap"}
              desc={isItalian
                ? "Ogni lunedì alle 9:00, un riepilogo della settimana: demo inviati, risposte, pitch generati."
                : "Every Monday at 9:00 AM, a summary of the week: demos sent, replies, pitches generated."}
              checked={notifications.weeklyRecap}
              onCheckedChange={(v) => handleTogglePref("weeklyRecap", v)}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button
              onClick={handleTest}
              disabled={testing}
              variant="outline"
              size="sm"
              className="flex-1 gap-2"
            >
              <Send className="h-3.5 w-3.5" />
              {testing
                ? isItalian ? "Invio..." : "Sending..."
                : isItalian ? "Invia test" : "Send test"}
            </Button>
            <Button
              onClick={handleDisable}
              variant="outline"
              size="sm"
              className="flex-1 gap-2 text-amber-400 hover:text-amber-300"
            >
              <BellOff className="h-3.5 w-3.5" />
              {isItalian ? "Disabilita" : "Disable"}
            </Button>
          </div>
        </>
      )}

      {/* Privacy note */}
      <div className="flex items-start gap-2 pt-1 border-t border-border/30">
        <Info className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground/70 leading-snug">
          {isItalian
            ? "Le notifiche sono inviate tramite il Service Worker del browser. Il tuo numero di telefono non viene mai richiesto. Puoi disattivarle in qualsiasi momento."
            : "Notifications are delivered via the browser's Service Worker. Your phone number is never requested. You can disable them at any time."}
        </p>
      </div>
    </div>
  );
}

function CategoryToggle({
  label,
  desc,
  checked,
  onCheckedChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="space-y-0.5 min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground leading-snug">{desc}</p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="shrink-0 mt-0.5"
      />
    </div>
  );
}
