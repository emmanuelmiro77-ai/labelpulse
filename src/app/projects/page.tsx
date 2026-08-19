"use client";

/**
 * /projects — Phase 2 (Home Dashboard)
 * =====================================================================
 * Trasforma la pagina Phase 1 in una "dashboard dei Project".
 *
 * 🔒 Phase 2 constraints (inalterate da Phase 1):
 * - NON è collegata al menu principale (NAV_KEYS in src/app/page.tsx non
 *   è stato modificato). Si raggiunge solo via URL diretto `/projects`.
 * - NON ha link a Demo, Release, Promotion, Pitch, Analyze Release.
 * - Nessun collegamento con dashboard, ranking, o altri moduli.
 *
 * Cambi Phase 2:
 * - Il form di creazione include il campo "What do you want to achieve?"
 *   con le 4 opzioni (PROJECT_GOALS).
 * - L'elenco mostra, per ogni Project: titolo, artista, status, goal,
 *   progress (barra) e next action (calcolata da computeNextAction).
 * - Cliccando su una card si naviga a `/projects/[id]` (Overview page).
 * =====================================================================
 */

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  FolderPlus,
  Trash2,
  Loader2,
  Folder,
  ChevronRight,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppStore } from "@/lib/store";
import {
  PROJECT_STATUSES,
  PROJECT_GOALS,
  type Project,
} from "@/types/project";
// 🔒 WP-011 — Lifecycle Engine come unica fonte di verità per Stage,
// Health e Next Action. Sostituisce il vecchio computeNextAction static
// mapping di @/types/project (Phase 2) con le funzioni centralizzate
// del Lifecycle Engine, coerenti con la Overview /projects/[id].
import {
  computeStage,
  computeHealth,
  computeNextAction,
  STAGE_LABELS,
  STAGE_STYLES,
  HEALTH_LABELS,
  HEALTH_STYLES,
} from "@/lib/project-lifecycle";

/**
 * Mappa label → colore per il badge dello status.
 * Colori coerenti con il tema dark di LabelPulse (oklch).
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

/** Colore della barra di progress in base al valore. */
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

export default function ProjectsPage() {
  const router = useRouter();
  const projects = useAppStore((s) => s.projects);
  const loadProjects = useAppStore((s) => s.loadProjects);
  const addProject = useAppStore((s) => s.addProject);
  const deleteProject = useAppStore((s) => s.deleteProject);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Form state
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [status, setStatus] = useState<string>("idea");
  const [goal, setGoal] = useState<string>("");
  const [sourceUrl, setSourceUrl] = useState("");

  // Carica i projects dal cloud al mount. Il load è idempotente: se lo store
  // ha già dati persistiti localmente (partialize), l'utente li vede subito;
  // poi il cloud riallinea.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        await loadProjects();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadProjects]);

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const trimmed = title.trim();
      if (!trimmed) return;
      setSubmitting(true);
      try {
        addProject({
          title: trimmed,
          artist: artist.trim() || undefined,
          status,
          goal: goal || undefined,
          source_url: sourceUrl.trim() || undefined,
        });
        // Reset form (mantieni status e goal selezionati: l'utente spesso
        // crea più project dello stesso tipo in sequenza).
        setTitle("");
        setArtist("");
        setSourceUrl("");
      } finally {
        setSubmitting(false);
      }
    },
    [title, artist, status, goal, sourceUrl, addProject],
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent, id: string, projectTitle: string) => {
      // Ferma la propagazione: il click va sul bottone delete, non sulla card.
      e.stopPropagation();
      e.preventDefault();
      const ok = window.confirm(
        `Eliminare il project "${projectTitle}"? L'operazione è irreversibile.`,
      );
      if (!ok) return;
      deleteProject(id);
    },
    [deleteProject],
  );

  const handleCardClick = useCallback(
    (id: string) => {
      router.push(`/projects/${encodeURIComponent(id)}`);
    },
    [router],
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-1">
              <ArrowLeft className="h-4 w-4" />
              Torna all&apos;app
            </Button>
          </Link>
          <h1 className="font-semibold text-lg flex items-center gap-2">
            <Folder className="h-5 w-5 text-primary" />
            Projects
          </h1>
          <span className="ml-auto text-xs text-muted-foreground font-mono">
            Phase 2 · Home
          </span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Form: nuovo Project */}
        <Card className="bg-card/60 border-border/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
              <FolderPlus className="h-4 w-4" />
              Nuovo Project
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleSubmit}
              className="grid sm:grid-cols-2 gap-3"
            >
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="proj-title" className="text-xs">
                  Titolo <span className="text-red-400">*</span>
                </Label>
                <Input
                  id="proj-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Es. Nuovo EP techno"
                  required
                  maxLength={200}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proj-artist" className="text-xs">
                  Artista
                </Label>
                <Input
                  id="proj-artist"
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                  placeholder="Es. DJ Name"
                  maxLength={200}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proj-status" className="text-xs">
                  Stato
                </Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger id="proj-status">
                    <SelectValue placeholder="Seleziona stato" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROJECT_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s.replace("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="proj-goal" className="text-xs flex items-center gap-1">
                  <Target className="h-3 w-3" />
                  What do you want to achieve?
                </Label>
                <Select value={goal} onValueChange={setGoal}>
                  <SelectTrigger id="proj-goal">
                    <SelectValue placeholder="Seleziona un obiettivo (opzionale)" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROJECT_GOALS.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="proj-source" className="text-xs">
                  Source URL (opzionale)
                </Label>
                <Input
                  id="proj-source"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="https://..."
                  type="url"
                />
              </div>
              <div className="sm:col-span-2 flex justify-end">
                <Button type="submit" disabled={submitting || !title.trim()}>
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <FolderPlus className="h-4 w-4 mr-1" />
                  )}
                  Crea Project
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Elenco Projects — card dashboard */}
        <Card className="bg-card/60 border-border/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Folder className="h-4 w-4" />
                I tuoi Projects
              </span>
              <span className="text-xs text-muted-foreground/70 font-mono">
                {projects.length} totali
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Caricamento…
              </div>
            ) : projects.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground/60">
                <Folder className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Nessun project ancora creato.</p>
                <p className="text-xs mt-1">
                  Usa il form qui sopra per aggiungerne il primo.
                </p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {projects.map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    onClick={() => handleCardClick(p.id)}
                    onDelete={(e) => handleDelete(e, p.id, p.title)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

// ==================== Sub-component: ProjectCard ====================

interface ProjectCardProps {
  project: Project;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
}

function ProjectCard({ project, onClick, onDelete }: ProjectCardProps) {
  const p = project;
  // 🔒 WP-011 — Tutti i valori decisionali provengono dal Lifecycle Engine.
  // computeStage / computeHealth / computeNextAction sono funzioni pure
  // centralizzate in @/lib/project-lifecycle — stessa fonte usata dalla
  // Overview /projects/[id]. Nessuna logica decisionale inline.
  const stage = computeStage(p);
  const health = computeHealth(p);
  const nextAction = computeNextAction(p);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="group relative text-left rounded-xl border border-border/30 bg-card/40 hover:bg-card/70 hover:border-primary/40 transition-all cursor-pointer p-4 focus:outline-none focus:ring-2 focus:ring-primary/40"
    >
      {/* Header card: titolo + status badge + chevron */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-foreground truncate">
            {p.title}
          </h3>
          <p className="text-xs text-muted-foreground truncate">
            {p.artist || "—"}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary/60 transition-colors shrink-0 mt-1" />
      </div>

      {/* 🔒 WP-011 — Stage + Health badges dal Lifecycle Engine.
          Sostituiscono il vecchio badge status statico. Stage e Health
          sono derivati (non persistiti): vengono calcolati da
          computeStage(p) e computeHealth(p) ad ogni render. */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${STAGE_STYLES[stage]}`}
        >
          {STAGE_LABELS[stage]}
        </span>
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${HEALTH_STYLES[health]}`}
        >
          {HEALTH_LABELS[health]}
        </span>
        {p.goal ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium bg-primary/10 text-primary border-primary/30">
            <Target className="h-3 w-3" />
            {p.goal}
          </span>
        ) : null}
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span>Progress</span>
          <span className="font-mono">{p.progress}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-secondary/40 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${progressColorClass(
              p.progress,
            )}`}
            style={{ width: `${p.progress}%` }}
          />
        </div>
      </div>

      {/* 🔒 WP-011 — Next Action dal Lifecycle Engine.
          computeNextAction(p) ritorna un oggetto strutturato
          { label, description, kind }. Mostriamo la label (frase breve)
          come already faceva la vecchia implementazione static mapping. */}
      <div className="rounded-lg bg-secondary/20 border border-border/20 px-3 py-2">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono mb-0.5">
          Next action
        </p>
        <p className="text-sm text-foreground/90 leading-snug">
          {nextAction.label}
        </p>
      </div>

      {/* Footer: data + delete */}
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/20">
        <span className="text-xs text-muted-foreground font-mono">
          {formatDate(p.createdAt)}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground/60 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={onDelete}
          title="Elimina project"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
