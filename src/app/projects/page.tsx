"use client";

/**
 * /projects — Phase 1 Foundation
 * =====================================================================
 * Pagina STANDALONE per la nuova entità "Project".
 *
 * 🔒 Phase 1 constraints:
 * - NON è collegata al menu principale (NAV_KEYS in src/app/page.tsx non
 *   è stato modificato). Si raggiunge solo via URL diretto `/projects`.
 * - NON ha link a Demo, Release, Promotion, Pitch, Analyze Release.
 * - Chiama `loadProjects()` dallo store al mount, poi mostra un elenco
 *   read-only con: titolo, artista, stato, data creazione.
 * - Espone un form minimale per creare un nuovo Project (titolo obbligatorio,
 *   artista / status / source_url opzionali) e un pulsante di delete per
 *   ciascuna riga. Nessun edit inline complesso: questa è Phase 1.
 * - Nessun collegamento con dashboard, ranking, o altri moduli.
 * =====================================================================
 */

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, FolderPlus, Trash2, Loader2, Folder } from "lucide-react";
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
import { PROJECT_STATUSES } from "@/types/project";

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
          source_url: sourceUrl.trim() || undefined,
        });
        // Reset form (mantieni lo status selezionato: l'utente spesso
        // crea più project dello stesso status in sequenza).
        setTitle("");
        setArtist("");
        setSourceUrl("");
      } finally {
        setSubmitting(false);
      }
    },
    [title, artist, status, sourceUrl, addProject],
  );

  const handleDelete = useCallback(
    (id: string, projectTitle: string) => {
      const ok = window.confirm(
        `Eliminare il project "${projectTitle}"? L'operazione è irreversibile.`,
      );
      if (!ok) return;
      deleteProject(id);
    },
    [deleteProject],
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
            Phase 1 · Foundation
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

        {/* Elenco Projects */}
        <Card className="bg-card/60 border-border/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Folder className="h-4 w-4" />
                Elenco Projects
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
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b border-border/30">
                      <th className="px-2 py-2 font-medium">Titolo</th>
                      <th className="px-2 py-2 font-medium">Artista</th>
                      <th className="px-2 py-2 font-medium">Stato</th>
                      <th className="px-2 py-2 font-medium whitespace-nowrap">
                        Creato
                      </th>
                      <th className="px-2 py-2 font-medium text-right">
                        <span className="sr-only">Azioni</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map((p) => (
                      <tr
                        key={p.id}
                        className="border-b border-border/20 last:border-0 hover:bg-secondary/20 transition-colors"
                      >
                        <td className="px-2 py-3">
                          <div className="font-medium text-foreground">
                            {p.title}
                          </div>
                          {p.sourceUrl ? (
                            <a
                              href={p.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary/70 hover:text-primary truncate block max-w-[220px]"
                              title={p.sourceUrl}
                            >
                              {p.sourceUrl}
                            </a>
                          ) : null}
                        </td>
                        <td className="px-2 py-3 text-muted-foreground">
                          {p.artist || "—"}
                        </td>
                        <td className="px-2 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${statusBadgeClass(
                              p.status,
                            )}`}
                          >
                            {p.status.replace("_", " ")}
                          </span>
                        </td>
                        <td className="px-2 py-3 text-muted-foreground text-xs whitespace-nowrap font-mono">
                          {formatDate(p.createdAt)}
                        </td>
                        <td className="px-2 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                            onClick={() => handleDelete(p.id, p.title)}
                            title="Elimina project"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
