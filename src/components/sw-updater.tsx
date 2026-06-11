"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";
import { t } from "@/lib/i18n";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SWUpdater() {
  const { locale } = useAppStore();
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    // Register service worker
    navigator.serviceWorker.register("/sw.js").then((reg) => {
      setRegistration(reg);

      // Check if there's already a waiting service worker
      if (reg.waiting) {
        setUpdateAvailable(true);
      }

      // Listen for new service workers
      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            // New version available!
            setUpdateAvailable(true);
          }
        });
      });

      // Check for updates every 30 minutes
      const interval = setInterval(() => {
        reg.update();
      }, 30 * 60 * 1000);

      return () => clearInterval(interval);
    }).catch((err) => {
      console.log("SW registration failed:", err);
    });

    // Also listen for controller change (when new SW takes over)
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }, []);

  const handleUpdate = () => {
    if (registration?.waiting) {
      // Tell the waiting service worker to activate
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    } else {
      // Fallback: just reload
      window.location.reload();
    }
  };

  if (!updateAvailable) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom-4">
      <div className="flex items-center gap-3 bg-card border border-primary/30 rounded-lg px-4 py-3 shadow-lg shadow-primary/10">
        <RefreshCw className="h-4 w-4 text-primary shrink-0" />
        <span className="text-sm text-foreground">{t(locale, "update.available")}</span>
        <Button size="sm" onClick={handleUpdate} className="glow-purple shrink-0">
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          {t(locale, "update.updateNow")}
        </Button>
      </div>
    </div>
  );
}
