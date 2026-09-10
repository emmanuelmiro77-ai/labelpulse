"use client";

/**
 * FindALabelWizard — Guided track-to-label matching flow.
 * =====================================================================
 * When a Project has goal="Find a label" and 0 target labels, this
 * wizard replaces the generic TargetsWorkspace. It guides the user
 * through 4 steps:
 *
 * 1. Upload track → analyzeAudioFile() extracts BPM + key
 * 2. Pick genre   → from getGenres() (existing store data)
 * 3. Track profile → compact summary with edit capability
 * 4. Label results → findSimilarLabelsAndArtists() ranks labels
 *                    by compatibility; user can "Add to Project"
 *
 * Reuses EXISTING modules:
 * - src/lib/audio-analysis.ts → analyzeAudioFile()
 * - src/lib/demo-matcher.ts   → findSimilarLabelsAndArtists(), profileFromAnalysis()
 * - src/lib/store.ts          → getGenres(), labels, artists, addProjectTargetLabel(),
 *                                projectTargetLabels, getLabelTier()
 *
 * Does NOT modify any of those modules.
 * =====================================================================
 */

import { useState, useMemo, useRef, useCallback } from "react";
import {
  Upload,
  Music,
  Loader2,
  Check,
  Target,
  ChevronRight,
  Edit3,
  ArrowLeft,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { useAppStore, getLabelTier } from "@/lib/store";
import type { AudioAnalysisResult, AnalysisProgress } from "@/lib/audio-analysis";
import {
  findSimilarLabelsAndArtists,
  profileFromAnalysis,
  explainMatch,
  type TrackProfile,
  type MatchResult,
} from "@/lib/demo-matcher";
import type { Project } from "@/types/project";

type WizardStep = "upload" | "genre" | "profile" | "results";

interface FindALabelWizardProps {
  project: Project;
}

export function FindALabelWizard({ project }: FindALabelWizardProps) {
  const labels = useAppStore((s) => s.labels);
  const artists = useAppStore((s) => s.artists);
  const getGenres = useAppStore((s) => s.getGenres);
  const projectTargetLabels = useAppStore((s) => s.projectTargetLabels);
  const addProjectTargetLabel = useAppStore((s) => s.addProjectTargetLabel);

  const [step, setStep] = useState<WizardStep>("upload");
  const [analysis, setAnalysis] = useState<AudioAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null);
  const [genre, setGenre] = useState<string>("");
  const [manualBpm, setManualBpm] = useState<string>("");
  const [manualKey, setManualKey] = useState<string>("");
  const [isEditing, setIsEditing] = useState(false);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [isMatching, setIsMatching] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const genres = useMemo(() => getGenres() || [], [getGenres]);

  const targetLabelIds = useMemo(
    () =>
      new Set(
        projectTargetLabels
          .filter((tl) => tl.projectId === project.id)
          .map((tl) => tl.labelId),
      ),
    [projectTargetLabels, project.id],
  );

  // ---- Step 1: Upload + Analyze ----

  const handleFileUpload = useCallback(async (file: File) => {
    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisProgress({ stage: "fetching", message: `Lettura ${file.name}...`, progress: 0.2 });
    try {
      const { analyzeAudioFile } = await import("@/lib/audio-analysis");
      const timeoutMs = 120_000;
      const result = await Promise.race([
        analyzeAudioFile(file, (p) => setAnalysisProgress(p)),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Timeout: analisi troppo lunga (>120s). Prova con un file più corto.")),
            timeoutMs,
          ),
        ),
      ]);
      setAnalysis(result);
      setManualBpm(String(result.bpm));
      if (result.key.confidence > 0) {
        setManualKey(result.key.camelot);
      }
      setAnalysisProgress({ stage: "done", message: "Analisi completata!", progress: 1 });
      setTimeout(() => setAnalysisProgress(null), 2000);
      setStep("genre");
    } catch (err: any) {
      console.error("[FindALabelWizard] analyze error:", err);
      setAnalysisError(err?.message || "Errore durante l'analisi del file");
      // Allow manual entry on failure
      setStep("genre");
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileUpload(file);
    },
    [handleFileUpload],
  );

  // ---- Step 3→4: Run matcher ----

  const runMatching = useCallback(() => {
    setIsMatching(true);
    setStep("results");
    // Defer to allow UI to render loading state
    setTimeout(() => {
      const bpmNum = manualBpm.trim() ? parseInt(manualBpm, 10) : null;
      const keyStr = manualKey.trim() || null;
      const genreStr = genre.trim() || null;

      const profile: TrackProfile = {
        bpm: bpmNum && Number.isFinite(bpmNum) ? bpmNum : null,
        camelotKey: keyStr,
        genre: genreStr,
      };

      const result = findSimilarLabelsAndArtists(profile, artists, labels, {
        maxResults: 20,
        minScore: 0.05,
      });
      setMatchResult(result);
      setIsMatching(false);
    }, 50);
  }, [manualBpm, manualKey, genre, artists, labels]);

  // ---- Render ----

  // STEP 1: Upload
  if (step === "upload") {
    return (
      <Card className="bg-gradient-to-br from-primary/5 via-card/60 to-purple-500/5 border-primary/20">
        <CardContent className="p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Music className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-bold text-foreground mb-2">
            Troviamo le label giuste per la tua traccia
          </h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
            Carica la traccia e LabelPulse analizzerà i dati necessari per
            trovare le label più compatibili.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleFileChange}
            className="hidden"
          />
          <Button
            size="lg"
            className="gap-2"
            onClick={() => fileInputRef.current?.click()}
            disabled={isAnalyzing}
          >
            {isAnalyzing ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Upload className="h-5 w-5" />
            )}
            {isAnalyzing ? "Analisi in corso..." : "Carica traccia"}
          </Button>

          {analysisProgress && (
            <div className="mt-4 max-w-xs mx-auto">
              <div className="h-1.5 rounded-full bg-secondary/40 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${(analysisProgress.progress || 0) * 100}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                {analysisProgress.message}
              </p>
            </div>
          )}

          {analysisError && (
            <div className="mt-4 max-w-md mx-auto rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
              <p className="text-xs text-amber-400">
                {analysisError}
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Puoi inserire manualmente BPM e chiave nel prossimo step.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // STEP 2: Genre selection
  if (step === "genre") {
    return (
      <Card className="bg-card/60 border-border/30">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-muted-foreground"
              onClick={() => setStep("upload")}
            >
              <ArrowLeft className="h-4 w-4" />
              Indietro
            </Button>
          </div>

          {analysis && (
            <div className="mb-6 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 flex items-center gap-3">
              <Check className="h-5 w-5 text-emerald-400 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">
                  Analisi completata
                </p>
                <p className="text-xs text-muted-foreground">
                  BPM: {analysis.bpm} {analysis.bpmConfidence > 0.5 ? "✓" : "(bassa confidenza)"}
                  {" · "}
                  Key: {analysis.key.camelot || "—"} {analysis.key.confidence > 0.5 ? "✓" : "(bassa confidenza)"}
                </p>
              </div>
            </div>
          )}

          <h3 className="text-base font-bold text-foreground mb-2">
            Qual è il genere della tua traccia?
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            Seleziona il genere principale. Verrà usato per trovare le label più compatibili.
          </p>

          <Select value={genre} onValueChange={setGenre}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Seleziona un genere..." />
            </SelectTrigger>
            <SelectContent>
              {genres.map((g) => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Manual BPM/Key override */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">BPM {analysis ? "(auto)" : "(manuale)"}</Label>
              <Input
                value={manualBpm}
                onChange={(e) => setManualBpm(e.target.value)}
                placeholder="es. 128"
                type="number"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Key (Camelot) {analysis ? "(auto)" : "(manuale)"}</Label>
              <Input
                value={manualKey}
                onChange={(e) => setManualKey(e.target.value)}
                placeholder="es. 8A"
                className="h-8 text-sm"
              />
            </div>
          </div>

          <Button
            className="w-full mt-6 gap-2"
            onClick={() => setStep("profile")}
            disabled={!genre}
          >
            Continua
            <ChevronRight className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  // STEP 3: Track Profile summary
  if (step === "profile") {
    const bpmNum = manualBpm.trim() ? parseInt(manualBpm, 10) : null;
    return (
      <Card className="bg-card/60 border-border/30">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-muted-foreground"
              onClick={() => setStep("genre")}
            >
              <ArrowLeft className="h-4 w-4" />
              Indietro
            </Button>
          </div>

          <h3 className="text-base font-bold text-foreground mb-4">
            Profilo della tua traccia
          </h3>

          {!isEditing ? (
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="rounded-lg border border-border/30 bg-secondary/20 px-4 py-3 text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono mb-1">
                  Genere
                </p>
                <p className="text-sm font-semibold text-foreground">
                  {genre || "—"}
                </p>
              </div>
              <div className="rounded-lg border border-border/30 bg-secondary/20 px-4 py-3 text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono mb-1">
                  BPM
                </p>
                <p className="text-sm font-semibold text-foreground">
                  {bpmNum || "—"}
                </p>
              </div>
              <div className="rounded-lg border border-border/30 bg-secondary/20 px-4 py-3 text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono mb-1">
                  Key
                </p>
                <p className="text-sm font-semibold text-foreground">
                  {manualKey || "—"}
                </p>
              </div>
            </div>
          ) : (
            <div className="mb-6 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Genere</Label>
                  <Select value={genre} onValueChange={setGenre}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {genres.map((g) => (
                        <SelectItem key={g} value={g}>
                          {g}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">BPM</Label>
                  <Input
                    value={manualBpm}
                    onChange={(e) => setManualBpm(e.target.value)}
                    type="number"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Key</Label>
                  <Input
                    value={manualKey}
                    onChange={(e) => setManualKey(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            {!isEditing && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-muted-foreground"
                onClick={() => setIsEditing(true)}
              >
                <Edit3 className="h-3.5 w-3.5" />
                Modifica dati
              </Button>
            )}
            {isEditing && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-emerald-400"
                onClick={() => setIsEditing(false)}
              >
                <Check className="h-3.5 w-3.5" />
                Conferma
              </Button>
            )}
            <Button
              className="ml-auto gap-2"
              onClick={runMatching}
              disabled={!genre && !manualBpm && !manualKey}
            >
              <Sparkles className="h-4 w-4" />
              Trova le label
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // STEP 4: Results
  if (step === "results") {
    return (
      <div className="space-y-4">
        {/* Compact track profile header */}
        <div className="flex items-center gap-3 rounded-lg border border-border/30 bg-secondary/20 px-4 py-2.5">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-muted-foreground"
            onClick={() => setStep("profile")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-4 text-xs">
            <span className="font-medium text-foreground">{genre}</span>
            <span className="text-muted-foreground font-mono">
              {manualBpm || "—"} BPM
            </span>
            <span className="text-muted-foreground font-mono">
              {manualKey || "—"}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto gap-1 text-muted-foreground"
            onClick={() => setStep("profile")}
          >
            <Edit3 className="h-3.5 w-3.5" />
            Modifica
          </Button>
        </div>

        {isMatching && (
          <Card className="bg-card/60 border-border/30">
            <CardContent className="p-8 text-center">
              <Loader2 className="h-8 w-8 text-primary animate-spin mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                Analisi delle label in corso...
              </p>
            </CardContent>
          </Card>
        )}

        {!isMatching && matchResult && (
          <>
            <div>
              <h3 className="text-base font-bold text-foreground">
                Label consigliate per la tua traccia
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Abbiamo trovato {matchResult.labels.length} label compatibili
                {" · "}
                basato su {matchResult.totalTracksScanned.toLocaleString()} brani analizzati
              </p>
            </div>

            {matchResult.labels.length === 0 ? (
              <Card className="bg-card/60 border-border/30">
                <CardContent className="p-6 text-center text-sm text-muted-foreground">
                  Nessuna label compatibile trovata. Prova a modificare il
                  genere o inserire BPM/chiave manualmente.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {matchResult.labels.map((sl, idx) => {
                  const isAdded = targetLabelIds.has(sl.label.id);
                  const tier = sl.bestGenre
                    ? getLabelTier(sl.label, sl.bestGenre)
                    : null;
                  return (
                    <div
                      key={sl.label.id}
                      className="flex items-center gap-3 rounded-lg border border-border/30 bg-card/40 px-4 py-3"
                    >
                      <span className="text-xs font-mono text-muted-foreground shrink-0 w-6">
                        #{idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground truncate">
                            {sl.label.name}
                          </p>
                          {tier && (
                            <span className="text-[10px] font-mono text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded shrink-0">
                              {tier}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {explainMatch(
                            {
                              bpm: manualBpm ? parseInt(manualBpm) : null,
                              camelotKey: manualKey || null,
                              genre: genre || null,
                            },
                            { matchCount: sl.matchCount, bestGenre: sl.bestGenre },
                          )}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono font-bold text-foreground">
                            {Math.round(sl.score * 100)}%
                          </span>
                          {isAdded ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400">
                              <Check className="h-3 w-3" />
                              Added
                            </span>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 gap-1 text-xs text-primary"
                              onClick={() =>
                                addProjectTargetLabel({
                                  project_id: project.id,
                                  label_id: sl.label.id,
                                })
                              }
                            >
                              <Target className="h-3 w-3" />
                              Add
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  return null;
}
