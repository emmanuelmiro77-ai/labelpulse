"use client";

/**
 * BugsnagErrorBoundary — thin client-side wrapper around Bugsnag's
 * React ErrorBoundary.
 *
 * - If Bugsnag is configured (API key present + production stage), wraps
 *   children with the real ErrorBoundary that captures render errors.
 * - If Bugsnag is NOT configured (dev without API key), renders children
 *   as-is (no wrapping). This keeps dev experience frictionless.
 *
 * Usage:
 *   <BugsnagErrorBoundary>{children}</BugsnagErrorBoundary>
 *
 * The FallbackComponent is intentionally minimal — just shows a generic
 * "something went wrong" message with a reload button. Detailed error info
 * is sent to Bugsnag automatically; no need to expose stack traces to users.
 */

import { Fragment, type ReactNode } from "react";
import { getErrorBoundary } from "@/lib/bugsnag";

interface BugsnagErrorBoundaryProps {
  children: ReactNode;
}

interface FallbackProps {
  clearError: () => void;
}

function DefaultFallback({ clearError }: FallbackProps) {
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "1.5rem",
        fontFamily: "system-ui, -apple-system, sans-serif",
        textAlign: "center",
        color: "#e5e7eb",
        background: "#0a0a0a",
      }}
    >
      <h1
        style={{
          fontSize: "1.5rem",
          fontWeight: 600,
          marginBottom: "0.75rem",
          color: "#fafafa",
        }}
      >
        Something went wrong
      </h1>
      <p
        style={{
          fontSize: "0.95rem",
          color: "#a1a1aa",
          marginBottom: "1.5rem",
          maxWidth: "32rem",
        }}
      >
        LabelPulse hit an unexpected error. Our team has been notified.
        Reloading the page usually fixes things — your data is saved locally
        and won&apos;t be lost.
      </p>
      <button
        type="button"
        onClick={clearError}
        style={{
          padding: "0.625rem 1.25rem",
          background: "#a855f7",
          color: "white",
          border: "none",
          borderRadius: "0.5rem",
          fontSize: "0.95rem",
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        Reload app
      </button>
    </div>
  );
}

export function BugsnagErrorBoundary({ children }: BugsnagErrorBoundaryProps) {
  const ErrorBoundary = getErrorBoundary();

  // No Bugsnag configured (e.g., dev without API key) → render children as-is
  if (!ErrorBoundary) {
    return <Fragment>{children}</Fragment>;
  }

  return (
    <ErrorBoundary FallbackComponent={DefaultFallback}>
      {children}
    </ErrorBoundary>
  );
}
