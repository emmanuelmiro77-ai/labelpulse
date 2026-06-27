"use client";

/**
 * /debug page — Bugsnag integration testing.
 *
 * 🔒 H-8 FIX: Auth-protected — only authenticated users can access.
 * Unauthenticated users see a "login required" message with a link to the app.
 */

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Bugsnag from "@/lib/bugsnag";

type EventType = "handled" | "unhandled-render" | "unhandled-handler" | "breadcrumb" | "metadata";

const EVENT_DESCRIPTIONS: Record<EventType, string> = {
  handled: "Calls Bugsnag.notify() directly. Should appear in Bugsnag as 'handled' error.",
  "unhandled-render": "Throws during component render. Should be caught by ErrorBoundary and appear as 'unhandled'.",
  "unhandled-handler": "Throws inside an onClick handler. Should be caught by Bugsnag's global handler and appear as 'unhandled'.",
  breadcrumb: "Leaves a breadcrumb, then notifies an error. Breadcrumb should appear in the error event details.",
  metadata: "Notifies an error with custom metadata. Metadata should appear in the error event 'context' tab.",
};

export default function DebugPage() {
  const { data: session, status } = useSession();
  const [lastAction, setLastAction] = useState<string>("Ready.");
  const [throwInRender, setThrowInRender] = useState(false);
  // Track whether Bugsnag is active on the CLIENT only.
  // SSR returns false (no window), client returns true after hydration.
  // Using useEffect + setState avoids React hydration mismatch (#418).
  const [bugsnagActive, setBugsnagActive] = useState<boolean | null>(null);

  useEffect(() => {
    setBugsnagActive(
      typeof window !== "undefined" &&
        !!(window as unknown as { Bugsnag?: unknown }).Bugsnag
    );
  }, []);

  // 🔒 H-8: Require authentication for debug page
  if (status === "loading") {
    return (
      <main style={{ minHeight: "100vh", padding: "2rem", background: "#0a0a0a", color: "#e5e7eb", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <p>Loading...</p>
      </main>
    );
  }

  if (!session?.user?.email) {
    return (
      <main style={{ minHeight: "100vh", padding: "2rem", background: "#0a0a0a", color: "#e5e7eb", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "1rem", color: "#fafafa" }}>🔒 Login richiesto</h1>
        <p style={{ color: "#a1a1aa" }}>Questa pagina è riservata agli utenti autenticati.</p>
        <a href="/" style={{ color: "#a855f7", textDecoration: "underline" }}>Torna all&apos;app</a>
      </main>
    );
  }

  if (throwInRender) {
    // This will trigger the ErrorBoundary
    throw new Error("Synthetic render error from /debug (test ErrorBoundary)");
  }

  const triggerHandled = () => {
    Bugsnag.notify(new Error("Test handled error from /debug"));
    setLastAction("✅ Handled error sent. Check Bugsnag Inbox.");
  };

  const triggerUnhandledHandler = () => {
    // Throw inside async callback — Bugsnag's global handler catches this
    setTimeout(() => {
      throw new Error("Synthetic unhandled error from /debug setTimeout handler");
    }, 0);
    setLastAction("✅ Unhandled handler error queued. Check Bugsnag Inbox.");
  };

  const triggerBreadcrumb = () => {
    Bugsnag.leaveBreadcrumb("Debug button clicked", { button: "breadcrumb-test" }, "state");
    Bugsnag.notify(new Error("Test error with preceding breadcrumb"));
    setLastAction("✅ Breadcrumb + error sent. Check Bugsnag event details.");
  };

  const triggerMetadata = () => {
    Bugsnag.notify(new Error("Test error with custom metadata"), (event) => {
      event.addMetadata("debug", {
        testId: `debug-${Date.now()}`,
        source: "/debug page",
        triggeredBy: "manual button click",
      });
    });
    setLastAction("✅ Error with metadata sent. Check Bugsnag 'debug' tab on the event.");
  };

  const triggerRender = () => {
    setLastAction("⏳ Triggering render error on next render cycle...");
    setTimeout(() => setThrowInRender(true), 100);
  };

  const buttons: Array<{ type: EventType; label: string; onClick: () => void }> = [
    { type: "handled", label: "Trigger handled error", onClick: triggerHandled },
    { type: "unhandled-handler", label: "Trigger unhandled handler error", onClick: triggerUnhandledHandler },
    { type: "breadcrumb", label: "Trigger error with breadcrumb", onClick: triggerBreadcrumb },
    { type: "metadata", label: "Trigger error with metadata", onClick: triggerMetadata },
    { type: "unhandled-render", label: "Trigger render error (ErrorBoundary)", onClick: triggerRender },
  ];

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "2rem",
        fontFamily: "system-ui, -apple-system, sans-serif",
        background: "#0a0a0a",
        color: "#e5e7eb",
      }}
    >
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "0.5rem", color: "#fafafa" }}>
        Bugsnag Debug Page
      </h1>
      <p style={{ fontSize: "0.875rem", color: "#a1a1aa", marginBottom: "2rem" }}>
        Use these buttons to verify Bugsnag is receiving events in this environment.
        Events should appear in your Bugsnag dashboard within ~30 seconds.
      </p>

      <div
        style={{
          marginBottom: "1rem",
          padding: "0.75rem 1rem",
          background: "#18181b",
          borderRadius: "0.5rem",
          border: "1px solid #27272a",
          fontSize: "0.875rem",
        }}
      >
        <strong style={{ color: "#a855f7" }}>Bugsnag status:</strong>{" "}
        {bugsnagActive === null
          ? "⏳ Checking..."
          : bugsnagActive
            ? "✅ Active (window.Bugsnag available)"
            : "❌ Not active (window.Bugsnag undefined)"}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: "40rem" }}>
        {buttons.map(({ type, label, onClick }) => (
          <div
            key={type}
            style={{
              padding: "1rem",
              background: "#18181b",
              borderRadius: "0.5rem",
              border: "1px solid #27272a",
            }}
          >
            <button
              type="button"
              onClick={onClick}
              style={{
                padding: "0.5rem 1rem",
                background: "#a855f7",
                color: "white",
                border: "none",
                borderRadius: "0.375rem",
                fontSize: "0.875rem",
                fontWeight: 500,
                cursor: "pointer",
                marginBottom: "0.5rem",
              }}
            >
              {label}
            </button>
            <p style={{ fontSize: "0.75rem", color: "#71717a", margin: 0 }}>
              {EVENT_DESCRIPTIONS[type]}
            </p>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: "2rem",
          padding: "0.75rem 1rem",
          background: "#18181b",
          borderRadius: "0.5rem",
          border: "1px solid #27272a",
          fontSize: "0.875rem",
        }}
      >
        <strong style={{ color: "#a855f7" }}>Last action:</strong> {lastAction}
      </div>
    </main>
  );
}
