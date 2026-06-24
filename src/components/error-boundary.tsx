"use client";

import * as React from "react";
import { AlertTriangle, RotateCcw, X } from "lucide-react";

/**
 * ErrorBoundary
 *
 * Catches render errors in the wrapped subtree and shows an inline
 * error UI instead of letting the error propagate to Next.js's root
 * error page (which would show the dreaded "This page couldn't load"
 * full-page error and force the user to reload).
 *
 * WHY THIS EXISTS
 * --------------
 * Before this component was added, ANY render error anywhere in the
 * LabelPulse tree (a null deref, a `toLocaleString()` on undefined,
 * a `new Date(invalidString)` that returns Invalid Date and then
 * throws on `.toLocaleDateString()`, an unexpected API response shape,
 * etc.) would crash the WHOLE page. The user would lose all in-flight
 * work — unsaved notes, half-typed URLs, open dialogs — and have to
 * reload and start over.
 *
 * Now, errors are caught at the boundary. The user sees a small inline
 * "Qualcosa è andato storto in questo pannello" card with a "Riprova"
 * button that resets the boundary's internal state and re-mounts the
 * subtree. The rest of the page keeps working.
 *
 * USAGE
 * -----
 *   <ErrorBoundary>
 *     <HeavyDialog content={maybeNull} />
 *   </ErrorBoundary>
 *
 * Optionally pass `resetKey` to auto-reset when a key changes (useful
 * for resetting when the user opens a different item in the same
 * dialog):
 *
 *   <ErrorBoundary resetKey={detailLabel?.id}>
 *     <LabelDetail label={detailLabel} />
 *   </ErrorBoundary>
 *
 * PROPS
 * -----
 * - `children`: the subtree to protect
 * - `resetKey`: when this value changes, the boundary auto-resets
 * - `label`: a short label shown in the error UI (e.g. "Dialog label")
 * - `onError`: optional callback fired when an error is caught
 * - `minimal`: if true, renders a smaller error UI (for tight spaces)
 */

interface ErrorBoundaryProps {
  children: React.ReactNode;
  resetKey?: string | number | null;
  label?: string;
  onError?: (error: Error, info: React.ErrorInfo) => void;
  minimal?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Log to console for debugging. In the future we could ship this
    // to an error reporting service (Sentry, etc.).
    console.error("[ErrorBoundary] Caught render error:", error, info);
    if (this.props.onError) {
      try {
        this.props.onError(error, info);
      } catch {
        /* ignore callback errors */
      }
    }
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    // Auto-reset when resetKey changes — this lets the user navigate
    // to a different item without manually clicking "Riprova".
    if (
      this.state.hasError &&
      prevProps.resetKey !== this.props.resetKey &&
      this.props.resetKey !== undefined
    ) {
      this.setState({ hasError: false, error: null });
    }
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    if (!this.state.hasError) return this.props.children;

    const { label, minimal } = this.props;
    const errorMsg = this.state.error?.message || "Errore sconosciuto";
    const safeMsg = String(errorMsg).slice(0, 200);

    if (minimal) {
      return (
        <div className="flex items-center gap-2 p-3 rounded-md border border-amber-500/30 bg-amber-500/5 text-xs text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 truncate">
            {label ? `${label}: ` : ""}Errore di caricamento
          </span>
          <button
            onClick={this.handleReset}
            className="shrink-0 px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 transition-colors"
            title="Riprova"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center gap-3 p-6 rounded-lg border border-amber-500/30 bg-amber-500/5 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/20">
          <AlertTriangle className="h-5 w-5 text-amber-400" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            {label ? `Errore in ${label}` : "Qualcosa è andato storto in questo pannello"}
          </p>
          <p className="text-[11px] text-muted-foreground font-mono break-all max-w-md">
            {safeMsg}
          </p>
          <p className="text-[10px] text-muted-foreground/70">
            Il resto dell&apos;app continua a funzionare. Puoi riprovare o chiudere.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={this.handleReset}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            Riprova
          </button>
        </div>
      </div>
    );
  }
}

/**
 * Convenience wrapper that renders the error UI inside a Dialog-shaped
 * container, so when an error happens INSIDE a dialog, the dialog itself
 * stays open and the user can dismiss it normally.
 */
export function DialogErrorFallback({
  label,
  onReset,
  onClose,
}: {
  label?: string;
  onReset: () => void;
  onClose?: () => void;
}): React.ReactElement {
  return (
    <div className="flex flex-col items-center gap-3 p-6 rounded-lg border border-amber-500/30 bg-amber-500/5 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/20">
        <AlertTriangle className="h-5 w-5 text-amber-400" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">
          {label ? `Errore in ${label}` : "Qualcosa è andato storto"}
        </p>
        <p className="text-[11px] text-muted-foreground">
          Il pannello ha smesso di rispondere. Puoi chiudere e riaprire la scheda della label.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onReset}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
        >
          <RotateCcw className="h-3 w-3" />
          Riprova
        </button>
        {onClose && (
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-medium hover:bg-accent transition-colors"
          >
            <X className="h-3 w-3" />
            Chiudi
          </button>
        )}
      </div>
    </div>
  );
}
