"use client";

/**
 * 🔒 Task 1: Reset del badge notifiche iOS
 *
 * Su iOS, quando l'app viene salvata sulla Home, l'icona mostra un badge
 * numerico rosso che non scompare mai. Questo componente lo azzera
 * all'avvio e ogni volta che l'app torna in primo piano.
 */

import { useEffect } from "react";

export function BadgeClearer() {
  useEffect(() => {
    const clearBadge = async () => {
      if (typeof navigator !== "undefined" && "clearAppBadge" in navigator) {
        try {
          // @ts-ignore - clearAppBadge potrebbe non essere tipizzato in vecchie versioni TS
          await navigator.clearAppBadge();
        } catch (error) {
          console.error("[BadgeClearer] Errore pulizia badge:", error);
        }
      }
    };

    clearBadge();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        clearBadge();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  return null;
}
