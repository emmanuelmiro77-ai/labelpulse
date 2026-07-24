"use client";

/**
 * /projects/[id] — Phase 2 (Project Overview)
 * =====================================================================
 * Pagina Overview di un singolo Project, raggiungibile cliccando su una
 * card della dashboard `/projects`.
 *
 * 🔒 Phase 2 constraints:
 * - Mostra ESCLUSIVAMENTE: titolo, artista, status, goal, progress,
 *   next action + pulsante "Continue".
 * - Il pulsante "Continue" NON attiva alcun workflow: in Phase 2 è un
 *   placeholder che torna alla lista `/projects`. Le fasi successive
 *   lo collegheranno al workflow appropriato in base al goal.
 * - Nessun link a Demo / Release / Promotion / Pitch.
 * - Nessun edit inline: questa è una vista di lettura.
 *
 * Se il project non esiste (id non trovato nello store), mostra uno
 * stato vuoto con link per tornare alla lista.
 * =====================================================================
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Folder,
  Target,
  Loader2,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAppStore } from "@/lib/store";
import { computeNextAction } from "@/types/project";

/**
 * Mappa label → colore per il badge dello status (speculare alla lista).
 */
const STATUS_STYLES: Record<string, string> = {
  idea: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  in_progress: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  ready: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  submitted: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  released: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  archived: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
};

function statusBadgeClass(status: string): string {
  return (
    STATUS_STYLES[status] ??
    "bg-secondary/30 text-muted-foreground border-border/40"
  );
}

function progressColorClass(progress: number): string {
  if (progress >= 75) return "bg-emerald-500";
  if (progress >= 50) return "bg-cyan-500";
  if (progress >= 25) return "bg-amber-500";
  if (progress > 0) return "bg-purple-500";
  return "bg-zinc-600";
}

/** Formatta una data ISO in formato leggibile (it-IT). */
function formatDate(iso: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

interface OverviewPageProps {
  params: Promise<{ id: string }>;
}

export default function ProjectOverviewPage({ params }: OverviewPageProps) {
  const router = useRouter();
  const projects = useAppStore((s) => s.projects);
  const loadProjects = useAppStore((s) => s.loadProjects);

  const [projectId, setProjectId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Next.js 16: params è una Promise. Risolviamola al mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const resolved = await params;
      if (!cancelled) {
        setProjectId(resolved.id);
        // Carica i projects dal cloud se non sono già presenti (es.
        // l'utente apre /projects/<id> direttamente via URL senza passare
        // dalla lista). È idempotente: se lo store ha già dati, li
        // sovrascrive con la versione cloud.
        try {
          await loadProjects();
        } finally {
          if (!cancelled) setIsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params, loadProjects]);

  const project = useMemo(() => {
    if (!projectId) return null;
    return projects.find((p) => p.id === projectId) ?? null;
  }, [projects, projectId]);

  const nextAction = useMemo(() => {
    if (!project) return "";
    return computeNextAction(project.goal, project.progress);
  }, [project]);

  // ---- Render: loading ----
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 text-primary animate-spin" />
          <span className="text-sm text-muted-foreground font-mono">
            Caricamento project…
          </span>
        </div>
      </div>
    );
  }

  // ---- Render: project non trovato ----
  if (!project) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <header className="sticky top-0 z-10 border-b border-border bg-card/80 backdrop-blur-sm">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
            <Link href="/projects">
              <Button variant="ghost" size="sm" className="gap-1">
                <ArrowLeft className="h-4 w-4" />
                Projects
              </Button>
            </Link>
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-4 py-12">
          <Card className="bg-card/60 border-amber-500/30">
            <CardContent className="p-8 text-center">
              <AlertCircle className="h-10 w-10 text-amber-400 mx-auto mb-3" />
              <h2 className="text-lg font-semibold text-foreground mb-1">
                Project non trovato
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                Il project cercato non esiste o è stato eliminato.
              </p>
              <Link href="/projects">
                <Button variant="outline" size="sm">
                  Torna alla lista
                </Button>
              </Link>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  // ---- Render: overview ----
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/projects">
            <Button variant="ghost" size="sm" className="gap-1">
              <ArrowLeft className="h-4 w-4" />
              Projects
            </Button>
          </Link>
          <h1 className="font-semibold text-lg flex items-center gap-2 truncate">
            <Folder className="h-5 w-5 text-primary shrink-0" />
            <span className="truncate">{project.title}</span>
          </h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {/* Card: Overview principale */}
        <Card className="bg-card/60 border-border/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground">
              Overview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Titolo + artista */}
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground/70 font-mono mb-0.5">
                Titolo
              </p>
              <p className="text-xl font-bold text-foreground">
                {project.title}
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {project.artist || "—"}
              </p>
            </div>

            {/* Status + Goal */}
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground/70 font-mono mb-1">
                  Status
                </p>
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-medium ${statusBadgeClass(
                    project.status,
                  )}`}
                >
                  {project.status.replace("_", " ")}
                </span>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground/70 font-mono mb-1">
                  Goal
                </p>
                {project.goal ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium bg-primary/10 text-primary border-primary/30">
                    <Target className="h-3 w-3" />
                    {project.goal}
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground/60 italic">
                    Non impostato
                  </span>
                )}
              </div>
            </div>

            {/* Progress */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs uppercase tracking-wider text-muted-foreground/70 font-mono">
                  Progress
                </p>
                <span className="text-sm font-mono text-foreground">
                  {project.progress}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-secondary/40 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${progressColorClass(
                    project.progress,
                  )}`}
                  style={{ width: `${project.progress}%` }}
                />
              </div>
            </div>

            {/* Next action */}
            <div className="rounded-lg bg-secondary/20 border border-border/20 px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono mb-1">
                Next action
              </p>
              <p className="text-sm text-foreground/90 leading-relaxed">
                {nextAction}
              </p>
            </div>

            {/* Metadata footer */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/20 text-xs text-muted-foreground font-mono">
              <div>
                <span className="text-muted-foreground/60">Creato: </span>
                {formatDate(project.createdAt)}
              </div>
              <div className="text-right">
                <span className="text-muted-foreground/60">Aggiornato: </span>
                {formatDate(project.updatedAt)}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card: azioni */}
        <Card className="bg-card/60 border-border/30">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">
                Pronto a continuare?
              </p>
              <p className="text-xs text-muted-foreground">
                Il workflow sarà disponibile nelle prossime fasi.
              </p>
            </div>
            <Button
              onClick={() => router.push("/projects")}
              className="gap-1"
            >
              Continue
              <ChevronRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
