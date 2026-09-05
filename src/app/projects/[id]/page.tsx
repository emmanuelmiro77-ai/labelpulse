"use client";

/**
 * /projects/[id] — Lifecycle Engine Foundation
 * =====================================================================
 * Pagina Overview di un singolo Project.
 *
 * 🔒 Lifecycle Engine Foundation constraints:
 * - TUTTI i valori decisionali (Stage, Goal, Health, Blocking Issues,
 *   Next Action) provengono ESCLUSIVAMENTE dal Lifecycle Engine
 *   (`@/lib/project-lifecycle`). La UI si limita a visualizzarli.
 * - Nessun calcolo decisionale inline nel componente.
 * - Nessun link a Demo / Release / Promotion / Pitch.
 * - Il pulsante "Continue" NON attiva alcun workflow: in questa fase è
 *   un placeholder che torna alla lista `/projects`.
 *
 * Se il project non esiste (id non trovato nello store), mostra uno
 * stato vuoto con link per tornare alla lista.
 * =====================================================================
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Folder,
  Target,
  Loader2,
  ChevronRight,
  AlertCircle,
  AlertTriangle,
  ShieldAlert,
  Activity,
  ArrowRight,
  CheckCircle2,
  LayoutGrid,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAppStore } from "@/lib/store";
import {
  computeStage,
  computeHealth,
  computeBlockingIssues,
  computeNextAction,
  getVisibleWorkspace,
  STAGE_LABELS,
  STAGE_STYLES,
  HEALTH_LABELS,
  HEALTH_STYLES,
  type BlockingIssue,
} from "@/lib/project-lifecycle";
// 🔒 WP-002 — Riutilizzo dei componenti esistenti per il workspace Targets.
// Nessuna modifica ai componenti stessi: solo import + render.
import { LabelFinder } from "@/components/label-finder";
import ArtistExplorer from "@/components/artist-explorer";
import { ErrorBoundary } from "@/components/error-boundary";
// 🔒 WP-003 — Project Context: provider che espone il Project corrente
// a tutti i componenti figli. Nessun consumer ancora introdotto.
import { ProjectProvider } from "@/context/project-context";
// 🔒 WP-007 — Icone per la sezione Target Labels.
// 🔒 WP-010 — UserIcon per la sezione Target Artists.
import { Trash2, Target as TargetIcon, User as UserIcon } from "lucide-react";

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

/**
 * Icona per la severity di una blocking issue.
 */
function BlockingIssueIcon({ severity }: { severity: BlockingIssue["severity"] }) {
  if (severity === "critical") {
    return <ShieldAlert className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />;
  }
  return <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />;
}

/**
 * 🔒 WP-001 — Workspace dinamico.
 * Mappa statica (section id → { label, description }) usata dalla UI per
 * renderizzare le card del Workspace. Le section id provengono da
 * `getVisibleWorkspace(stage, goal)` nel Lifecycle Engine.
 *
 * Nessun modulo reale è importato qui: la mappa contiene solo label e
 * descrizioni human-readable. Il badge "Coming next" indica che il
 * modulo concreto sarà collegato in fasi successive (WP-002+).
 */
const SECTION_META: Record<string, { label: string; description: string }> = {
  summary: {
    label: "Summary",
    description:
      "Riepilogo finale del project: risultati, metriche e note per future reference.",
  },
  setup: {
    label: "Setup",
    description:
      "Configura titolo, artista, goal e source URL del project per sbloccare le azioni successive.",
  },
  targets: {
    label: "Targets",
    description:
      "Costruisci la lista di label o DJ target per questo project.",
  },
  pitch_draft: {
    label: "Pitch draft",
    description:
      "Bozza del pitch personalizzato per ogni target label.",
  },
  outreach: {
    label: "Outreach",
    description:
      "Invia promozioni e DM ai DJ target. Traccia follow-up e risposte.",
  },
  performance: {
    label: "Performance",
    description:
      "Monitora chart positions, streaming e supporto DJ per il rilascio.",
  },
  submissions: {
    label: "Submissions",
    description:
      "Demo e pitch inviati alle label. Traccia stato e risposte.",
  },
  responses: {
    label: "Responses",
    description:
      "Risposte ricevute da label e DJ. Classifica e gestisci i feedback.",
  },
};

/**
 * Etichetta fallback per section id non riconosciuti (defensivo: se il
 * Lifecycle Engine aggiunge una nuova section, la UI non si rompe).
 */
function sectionMeta(sectionId: string): { label: string; description: string } {
  return (
    SECTION_META[sectionId] ?? {
      label: sectionId,
      description: "Sezione del workspace.",
    }
  );
}

/**
 * 🔒 WP-002 — Workspace Targets.
 * Renderizza i componenti reali Label Finder e Artist Explorer,
 * già esistenti nel repository. Nessuna modifica a tali componenti:
 * vengono solo importati e montati.
 *
 * Entrambi i componenti sono self-contained (leggono dallo store Zustand).
 * ErrorBoundary separato per ognuno: un errore in uno non deve bloccare
 * l'altro né l'intera pagina Overview.
 */
function TargetsWorkspace() {
  return (
    <div className="space-y-4">
      <ErrorBoundary>
        <LabelFinder />
      </ErrorBoundary>
      <ErrorBoundary>
        <ArtistExplorer />
      </ErrorBoundary>
    </div>
  );
}

interface OverviewPageProps {
  params: Promise<{ id: string }>;
}

export default function ProjectOverviewPage({ params }: OverviewPageProps) {
  const projects = useAppStore((s) => s.projects);
  const loadProjects = useAppStore((s) => s.loadProjects);
  const updateProject = useAppStore((s) => s.updateProject);
  // 🔒 WP-007 — Target Labels: stato e azioni per la sezione dedicata.
  const projectTargetLabels = useAppStore((s) => s.projectTargetLabels);
  const allLabels = useAppStore((s) => s.labels);
  const loadProjectTargetLabels = useAppStore((s) => s.loadProjectTargetLabels);
  const deleteProjectTargetLabel = useAppStore((s) => s.deleteProjectTargetLabel);
  // 🔒 WP-010 — Target Artists: stato e azioni per la sezione dedicata.
  // Pattern speculare a Target Labels (WP-007).
  const projectTargetArtists = useAppStore((s) => s.projectTargetArtists);
  const allArtists = useAppStore((s) => s.artists);
  const loadProjectTargetArtists = useAppStore((s) => s.loadProjectTargetArtists);
  const deleteProjectTargetArtist = useAppStore((s) => s.deleteProjectTargetArtist);

  const [projectId, setProjectId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  // 🔒 Ricerca testuale per filtrare le Target Labels per nome.
  const [targetLabelSearch, setTargetLabelSearch] = useState("");

  // 🔒 WP-001: ref per scroll-to-workspace. Il pulsante Continue non
  // naviga più a /projects: scorre alla sezione Workspace.
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  // 🔒 Navigazione rapida: ref per scroll diretto alle sezioni Target
  // Labels e Target Artists, così l'utente non deve scorrere 1200+ label
  // per raggiungerle.
  const targetLabelsRef = useRef<HTMLDivElement | null>(null);
  const targetArtistsRef = useRef<HTMLDivElement | null>(null);

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

  // 🔒 WP-007 — Carica le target labels del project corrente dal cloud.
  // Si attiva quando projectId diventa disponibile. È idempotente: se lo
  // store ha già dati (persistiti in IndexedDB), l'utente li vede subito;
  // poi il cloud riallinea.
  useEffect(() => {
    if (!projectId) return;
    loadProjectTargetLabels(projectId).catch((err) =>
      console.error("[project-target-labels] load on mount failed:", err),
    );
  }, [projectId, loadProjectTargetLabels]);

  // 🔒 WP-010 — Carica le target artists del project corrente dal cloud.
  // Pattern speculare a WP-007 (target labels).
  useEffect(() => {
    if (!projectId) return;
    loadProjectTargetArtists(projectId).catch((err) =>
      console.error("[project-target-artists] load on mount failed:", err),
    );
  }, [projectId, loadProjectTargetArtists]);

  const project = useMemo(() => {
    if (!projectId) return null;
    return projects.find((p) => p.id === projectId) ?? null;
  }, [projects, projectId]);

  // 🔒 TUTTI i valori decisionali provengono dal Lifecycle Engine.
  // La UI non fa NESSUN calcolo decisionale: solo memoizzazione dei
  // risultati dell'engine per evitare recompute inutili.
  // 🔒 WP-001: include anche il workspace visibile, derivato da
  // getVisibleWorkspace(stage, goal).
  const lifecycle = useMemo(() => {
    if (!project) return null;
    const stage = computeStage(project);
    // Project.goal è stringa libera nel tipo; castiamo al tipo union
    // ProjectGoal atteso da getVisibleWorkspace. I goal non noti
    // ("") cadono nel branch default dell'engine, che ritorna solo
    // ["setup"].
    const goal = (project.goal || "") as Parameters<typeof getVisibleWorkspace>[1];
    const workspace = getVisibleWorkspace(stage, goal);
    return {
      stage,
      health: computeHealth(project),
      blockingIssues: computeBlockingIssues(project),
      nextAction: computeNextAction(project),
      workspace,
    };
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
  if (!project || !lifecycle) {
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

  const { stage, health, blockingIssues, nextAction, workspace } = lifecycle;

  // ---- Render: overview ----
  // 🔒 WP-003 — Wrap dell'intero contenuto con ProjectProvider per
  // esporre il Project corrente a tutti i componenti figli via context.
  // Nessun consumer ancora introdotto; la UI è funzionalmente invariata.
  return (
    <ProjectProvider value={project}>
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
        {/* Card: Overview principale — Stage / Goal / Health */}
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

            {/* Stage + Health (dal Lifecycle Engine) */}
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground/70 font-mono mb-1">
                  Stage
                </p>
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-medium ${STAGE_STYLES[stage]}`}
                >
                  {STAGE_LABELS[stage]}
                </span>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground/70 font-mono mb-1">
                  Health
                </p>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${HEALTH_STYLES[health]}`}
                >
                  <Activity className="h-3 w-3" />
                  {HEALTH_LABELS[health]}
                </span>
              </div>
            </div>

            {/* Goal + Status (dal Project, non decisionali) */}
            <div className="grid sm:grid-cols-2 gap-3">
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
            </div>

            {/* Progress (dal Project, non decisionale) */}
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

        {/* Card: Next Action (dal Lifecycle Engine) */}
        <Card className="bg-card/60 border-primary/30">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                <ArrowRight className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono mb-0.5">
                  Next action
                </p>
                <p className="text-sm font-semibold text-foreground">
                  {nextAction.label}
                </p>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  {nextAction.description}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card: Blocking Issues (dal Lifecycle Engine) */}
        <Card className="bg-card/60 border-border/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center justify-between">
              <span>Blocking issues</span>
              <span className="text-xs text-muted-foreground/70 font-mono">
                {blockingIssues.length}{" "}
                {blockingIssues.length === 1 ? "issue" : "issues"}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {blockingIssues.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-emerald-300/80 py-2">
                <CheckCircle2 className="h-4 w-4" />
                <span>Nessun blocco rilevato. Il project è sano.</span>
              </div>
            ) : (
              <ul className="space-y-2.5">
                {blockingIssues.map((issue) => (
                  <li
                    key={issue.id}
                    className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 ${
                      issue.severity === "critical"
                        ? "border-red-500/30 bg-red-500/5"
                        : "border-amber-500/30 bg-amber-500/5"
                    }`}
                  >
                    <BlockingIssueIcon severity={issue.severity} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground/90 leading-snug">
                        {issue.message}
                      </p>
                      {issue.field ? (
                        <p className="text-[10px] text-muted-foreground/60 font-mono mt-0.5 uppercase tracking-wider">
                          field: {issue.field}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* 🔒 WP-001 — Sezione Workspace dinamica.
            Le sezioni sono decise dal Lifecycle Engine tramite
            getVisibleWorkspace(stage, goal). Ogni section è una card
            con nome, descrizione e badge "Coming next". Nessun modulo
            reale è collegato. */}
        <div ref={workspaceRef} className="scroll-mt-20">
          <Card className="bg-card/60 border-border/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                <LayoutGrid className="h-4 w-4" />
                Workspace
                <span className="text-xs text-muted-foreground/70 font-mono ml-auto">
                  {workspace.sections.length}{" "}
                  {workspace.sections.length === 1 ? "sezione" : "sezioni"}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {workspace.sections.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground/60 text-sm">
                  Nessuna sezione disponibile per questo stage.
                </div>
              ) : (
                <div className="space-y-4">
                  {workspace.sections.map((sectionId) => {
                    // 🔒 WP-002 — Workspace Targets: renderizza i componenti
                    // reali (Label Finder + Artist Explorer) invece della
                    // card placeholder. Gli altri section id restano
                    // placeholder con badge "Coming next".
                    if (sectionId === "targets") {
                      // 🔒 WP-007 — Filtra le target labels del project
                      // corrente. `projectTargetLabels` è un array piatto
                      // nello store; filtriamo per projectId qui.
                      const projectTargets = project
                        ? projectTargetLabels.filter(
                            (tl) => tl.projectId === project.id,
                          )
                        : [];
                      // 🔒 WP-010 — Filtra le target artists del project
                      // corrente. Pattern speculare a WP-007.
                      const projectTargetArtistsList = project
                        ? projectTargetArtists.filter(
                            (ta) => ta.projectId === project.id,
                          )
                        : [];
                      return (
                        <div key={sectionId} className="space-y-4">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-foreground text-sm">
                              {sectionMeta(sectionId).label}
                            </h3>
                            {workspace.primary === sectionId ? (
                              <span className="text-[10px] uppercase tracking-wider text-primary font-mono">
                                Primary
                              </span>
                            ) : null}
                          </div>

                          {/* 🔒 Navigazione rapida: pulsanti per saltare
                              direttamente alle sezioni Target Labels e
                              Target Artists senza scorrere tutta la lista
                              di label/artisti di Label Finder / Artist
                              Explorer (che può essere 1200+ elementi). */}
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1.5 text-xs"
                              onClick={() =>
                                targetLabelsRef.current?.scrollIntoView({
                                  behavior: "smooth",
                                  block: "start",
                                })
                              }
                              title="Vai alle Target Labels"
                            >
                              <TargetIcon className="h-3.5 w-3.5" />
                              Target Labels ({projectTargets.length})
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1.5 text-xs"
                              onClick={() =>
                                targetArtistsRef.current?.scrollIntoView({
                                  behavior: "smooth",
                                  block: "start",
                                })
                              }
                              title="Vai ai Target Artists"
                            >
                              <UserIcon className="h-3.5 w-3.5" />
                              Target Artists ({projectTargetArtistsList.length})
                            </Button>
                          </div>

                          <TargetsWorkspace />

                          {/* 🔒 WP-007 — Sezione "Target Labels".
                              Mostra le label aggiunte al project corrente
                              tramite il pulsante "Add to Project" di Label
                              Finder. Legge esclusivamente dallo store
                              (projectTargetLabels filtrate per project.id).
                              Nessuna nuova API chiamata qui: il load avviene
                              nell'useEffect al mount della pagina. */}
                          <div ref={targetLabelsRef} className="scroll-mt-20 rounded-xl border border-border/30 bg-card/40 p-4">
                            <div className="flex items-center gap-2 mb-3">
                              <TargetIcon className="h-4 w-4 text-primary" />
                              <h4 className="font-semibold text-foreground text-sm">
                                Target Labels
                              </h4>
                              <span className="text-xs text-muted-foreground/70 font-mono ml-auto">
                                {projectTargets.length}{" "}
                                {projectTargets.length === 1
                                  ? "label"
                                  : "labels"}
                              </span>
                            </div>
                            {projectTargets.length === 0 ? (
                              <div className="text-center py-6 text-muted-foreground/60 text-sm">
                                <TargetIcon className="h-8 w-8 mx-auto mb-2 opacity-40" />
                                <p>
                                  Nessuna target label ancora aggiunta.
                                </p>
                                <p className="text-xs mt-1">
                                  Usa il pulsante{" "}
                                  <span className="text-primary">
                                    &ldquo;Add to Project&rdquo;
                                  </span>{" "}
                                  nelle card sopra per aggiungere label a
                                  questo project.
                                </p>
                              </div>
                            ) : (
                              <>
                                {/* Ricerca testuale Target Labels:
                                    filtra in tempo reale per nome label.
                                    Sempre visibile quando ci sono target. */}
                                <Input
                                  value={targetLabelSearch}
                                  onChange={(e) => setTargetLabelSearch(e.target.value)}
                                  placeholder="Cerca label..."
                                  className="mb-3 h-8 text-xs"
                                />
                                {targetLabelSearch.trim() === "" ? (
                                  <div className="text-center py-6 text-muted-foreground/60 text-sm">
                                    <p className="font-medium">
                                      Cerca una label per iniziare
                                    </p>
                                    <p className="text-xs mt-1">
                                      Inserisci il nome della label da cercare.
                                    </p>
                                  </div>
                                ) : (
                                  <ul className="space-y-1.5">
                                    {projectTargets
                                      .filter((tl) => {
                                        const label = allLabels.find(
                                          (l) => l.id === tl.labelId,
                                        );
                                        const labelName = label?.name ?? tl.labelId;
                                        return labelName.toLowerCase().includes(
                                          targetLabelSearch.toLowerCase(),
                                        );
                                      })
                                      .map((tl) => {
                                        const label = allLabels.find(
                                          (l) => l.id === tl.labelId,
                                        );
                                        const labelName = label?.name ?? tl.labelId;
                                        return (
                                          <li
                                            key={tl.id}
                                            className="flex items-center justify-between gap-2 rounded-lg border border-border/20 bg-secondary/20 px-3 py-2"
                                          >
                                            <div className="flex-1 min-w-0">
                                              <p className="text-sm font-medium text-foreground truncate">
                                                {labelName}
                                              </p>
                                              <p className="text-[10px] text-muted-foreground/70 font-mono">
                                                Aggiunta il{" "}
                                                {formatDate(tl.createdAt)}
                                              </p>
                                            </div>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                                              onClick={() =>
                                                deleteProjectTargetLabel(tl.id)
                                              }
                                              title="Rimuovi dal project"
                                            >
                                              <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                          </li>
                                        );
                                      })}
                                  </ul>
                                )}
                              </>
                            )}
                          </div>

                          {/* 🔒 WP-010 — Sezione "Target Artists".
                              Mostra gli artisti aggiunti al project corrente
                              tramite il pulsante "Add to Project" di Artist
                              Explorer. Legge esclusivamente dallo store
                              (projectTargetArtists filtrate per project.id).
                              Nessuna nuova API chiamata qui: il load avviene
                              nell'useEffect al mount della pagina.
                              Pattern speculare a Target Labels (WP-007). */}
                          <div ref={targetArtistsRef} className="scroll-mt-20 rounded-xl border border-border/30 bg-card/40 p-4">
                            <div className="flex items-center gap-2 mb-3">
                              <UserIcon className="h-4 w-4 text-primary" />
                              <h4 className="font-semibold text-foreground text-sm">
                                Target Artists
                              </h4>
                              <span className="text-xs text-muted-foreground/70 font-mono ml-auto">
                                {projectTargetArtistsList.length}{" "}
                                {projectTargetArtistsList.length === 1
                                  ? "artist"
                                  : "artists"}
                              </span>
                            </div>
                            {projectTargetArtistsList.length === 0 ? (
                              <div className="text-center py-6 text-muted-foreground/60 text-sm">
                                <UserIcon className="h-8 w-8 mx-auto mb-2 opacity-40" />
                                <p>
                                  Nessun target artist ancora aggiunto.
                                </p>
                                <p className="text-xs mt-1">
                                  Usa il pulsante{" "}
                                  <span className="text-primary">
                                    &ldquo;Add to Project&rdquo;
                                  </span>{" "}
                                  nelle card sopra per aggiungere artisti a
                                  questo project.
                                </p>
                              </div>
                            ) : (
                              <ul className="space-y-1.5">
                                {projectTargetArtistsList.map((ta) => {
                                  // Risolvi artist_id → nome artista leggendo
                                  // dall'array `artists` nello store (globale,
                                  // popolato da IndexedDB + scraper Beatport).
                                  const artist = allArtists.find(
                                    (a) => a.id === ta.artistId,
                                  );
                                  const artistName = artist?.name ?? ta.artistId;
                                  return (
                                    <li
                                      key={ta.id}
                                      className="flex items-center justify-between gap-2 rounded-lg border border-border/20 bg-secondary/20 px-3 py-2"
                                    >
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-foreground truncate">
                                          {artistName}
                                        </p>
                                        <p className="text-[10px] text-muted-foreground/70 font-mono">
                                          Aggiunto il{" "}
                                          {formatDate(ta.createdAt)}
                                        </p>
                                      </div>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                                        onClick={() =>
                                          deleteProjectTargetArtist(ta.id)
                                        }
                                        title="Rimuovi dal project"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </div>
                        </div>
                      );
                    }
                    const meta = sectionMeta(sectionId);
                    const isPrimary = workspace.primary === sectionId;
                    return (
                      <div
                        key={sectionId}
                        className={`rounded-xl border p-4 transition-colors ${
                          isPrimary
                            ? "border-primary/40 bg-primary/5"
                            : "border-border/30 bg-card/40"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0">
                            <h3 className="font-semibold text-foreground text-sm truncate">
                              {meta.label}
                            </h3>
                            {isPrimary ? (
                              <span className="text-[10px] uppercase tracking-wider text-primary font-mono">
                                Primary
                              </span>
                            ) : null}
                          </div>
                          <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium bg-amber-500/10 text-amber-300 border-amber-500/30">
                            <Sparkles className="h-3 w-3" />
                            Coming next
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {meta.description}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Card: azioni — Continue scrolla alla sezione Workspace */}
        <Card className="bg-card/60 border-border/30">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">
                Pronto a continuare?
              </p>
              <p className="text-xs text-muted-foreground">
                Vai al Workspace per vedere le sezioni attive di questo project.
              </p>
            </div>
            <Button
              onClick={() => {
                if (stage === "intake" && project.status === "idea") {
                  updateProject(project.id, { status: "in_progress" });
                } else {
                  workspaceRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                }
              }}
              className="gap-1"
            >
              Continue
              <ChevronRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </main>
      </div>
    </ProjectProvider>
  );
}
