"use client";

import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
import { t } from "@/lib/i18n";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * SWUpdater — shows the "new version available" banner and handles the
 * "Aggiorna" button click.
 *
 * ⚠️ BUG FIXED (2026-06-25): the previous implementation broke when the
 * service worker had `self.skipWaiting()` in its install handler (which
 * is the case for LabelPulse v5). The flow that failed was:
 *
 *   1. Browser downloads new SW → install handler calls skipWaiting()
 *   2. New SW activates immediately → registration.waiting becomes null
 *   3. updatefound listener still fires → banner shows
 *   4. User clicks "Aggiorna"
 *   5. `registration.waiting` is null → fallback to window.location.reload()
 *   6. Reload serves the OLD cached HTML from the SW cache → same banner
 *
 * FIX: when the user clicks "Aggiorna", we:
 *   - If registration.waiting exists → postMessage SKIP_WAITING (normal flow)
 *   - ALWAYS also clear SW caches + unregister all SWs + hard reload
 *   - This guarantees a clean state regardless of SW lifecycle timing
 */
export function SWUpdater() {
  const { locale } = useAppStore();
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const refreshingRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let interval: ReturnType<typeof setInterval> | null = null;

    const setup = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", {
          // Always check for updates on register
          updateViaCache: "none",
        });
        registrationRef.current = reg;

        // Check if there's already a waiting service worker
        if (reg.waiting) {
          setUpdateAvailable(true);
        }

        // Listen for new service workers
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            // "installed" + has controller = update available
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              setUpdateAvailable(true);
            }
          });
        });

        // Check for updates periodically (every 30 min)
        interval = setInterval(() => {
          reg.update().catch(() => {});
        }, 30 * 60 * 1000);
      } catch (err) {
        console.log("[SWUpdater] registration failed:", err);
      }
    };

    setup();

    // Listen for controller change (new SW takes over) → reload once
    const onControllerChange = () => {
      if (refreshingRef.current) return;
      refreshingRef.current = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    return () => {
      if (interval) clearInterval(interval);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange
      );
    };
  }, []);

  const handleUpdate = async () => {
    if (isUpdating) return; // Prevent double-click
    setIsUpdating(true);

    const reg = registrationRef.current;

    // Path A: there's a waiting worker — tell it to activate.
    // The controllerchange listener will reload the page.
    if (reg?.waiting) {
      try {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
      } catch (err) {
        console.warn("[SWUpdater] postMessage failed:", err);
      }
      // Fallback: if controllerchange doesn't fire within 2.5s, force clean reload
      setTimeout(() => {
        if (!refreshingRef.current) {
          hardReloadWithCleanCache();
        }
      }, 2500);
      return;
    }

    // Path B: no waiting worker (new SW already active, or banner is stale).
    // Force a clean reload that bypasses the SW cache.
    await hardReloadWithCleanCache();
  };

  /**
   * Hard reload with clean SW state:
   *   1. Unregister all service workers
   *   2. Delete all caches
   *   3. Reload the page with a cache-busting query param
   *
   * This guarantees the user sees the latest version even if the SW
   * lifecycle is in a weird state.
   */
  const hardReloadWithCleanCache = async () => {
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch (err) {
      console.warn("[SWUpdater] cleanup failed:", err);
    } finally {
      // Force reload bypassing cache — use location.replace so back button
      // doesn't get stuck on the old version
      const url = new URL(window.location.href);
      url.searchParams.set("_sw-refresh", String(Date.now()));
      window.location.replace(url.toString());
    }
  };

  if (!updateAvailable) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom-4">
      <div className="flex items-center gap-3 bg-card border border-primary/30 rounded-lg px-4 py-3 shadow-lg shadow-primary/10">
        <RefreshCw className={`h-4 w-4 text-primary shrink-0 ${isUpdating ? "animate-spin" : ""}`} />
        <span className="text-sm text-foreground">{t(locale, "update.available")}</span>
        <Button
          size="sm"
          onClick={handleUpdate}
          disabled={isUpdating}
          className="glow-purple shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isUpdating ? "animate-spin" : ""}`} />
          {t(locale, "update.updateNow")}
        </Button>
      </div>
    </div>
  );
}
