"use client";

import { useAppStore, type Demo, type DemoStatus, type Label } from "@/lib/store";
import { t, type Locale } from "@/lib/i18n";
import { useState, useMemo, useCallback } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Clock,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Headphones,
  Send,
  Disc3,
  AlertTriangle,
  Search,
  Music,
  Eye,
  Mail,
  Link2,
  Calendar,
  User,
  FileText,
  Music2,
  ArrowLeft,
  Zap,
  Activity,
  Loader2,
  X,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label as UILabel } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SimilarSuggestions } from "@/components/similar-suggestions";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Check, ChevronsUpDown, Filter, AlertCircle } from "lucide-react";

const STATUS_KEYS: DemoStatus[] = [
  "ready",
  "sent",
  "reviewing",
  "accepted",
  "rejected",
];

const STATUS_ICONS: Record<DemoStatus, React.ReactNode> = {
  ready: <Disc3 className="h-3.5 w-3.5" />,
  sent: <Send className="h-3.5 w-3.5" />,
  reviewing: <Headphones className="h-3.5 w-3.5" />,
  accepted: <CheckCircle2 className="h-3.5 w-3.5" />,
  rejected: <XCircle className="h-3.5 w-3.5" />,
};

const STATUS_COLORS: Record<
  DemoStatus,
  { color: string; bgColor: string; borderColor: string }
> = {
  ready: { color: "text-gray-400", bgColor: "bg-gray-500/10", borderColor: "border-gray-500/20" },
  sent: { color: "text-purple-400", bgColor: "bg-purple-500/10", borderColor: "border-purple-500/20" },
  reviewing: { color: "text-cyan-400", bgColor: "bg-cyan-500/10", borderColor: "border-cyan-500/20" },
  accepted: { color: "text-emerald-400", bgColor: "bg-emerald-500/10", borderColor: "border-emerald-500/20" },
  rejected: { color: "text-red-400", bgColor: "bg-red-500/10", borderColor: "border-red-500/20" },
};

const STATUS_FLOW: DemoStatus[] = ["ready", "sent", "reviewing", "accepted"];

function getDaysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

const STATUS_TKEYS: Record<DemoStatus, "demos.ready" | "demos.sent" | "demos.reviewing" | "demos.accepted" | "demos.rejected"> = {
  ready: "demos.ready",
  sent: "demos.sent",
  reviewing: "demos.reviewing",
  accepted: "demos.accepted",
  rejected: "demos.rejected",
};

export function DemoTracker() {
  const { labels, demos, addDemo, updateDemo, deleteDemo, advanceDemoStatus, locale: _locale, getGenres, userProfile, artists, setActiveTab, setSelectedLabelId, setSelectedArtistId } =
    useAppStore();
  const locale = _locale as Locale;
  const genres = getGenres();
  const [viewMode, setViewMode] = useState<"kanban" | "table">("kanban");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingDemo, setEditingDemo] = useState<Demo | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Detail dialog
  const [detailDemo, setDetailDemo] = useState<Demo | null>(null);

  // Label history view
  const [labelHistoryId, setLabelHistoryId] = useState<string | null>(null);

  const [formTrackName, setFormTrackName] = useState("");
  const [formLabelId, setFormLabelId] = useState("");
  const [formStatus, setFormStatus] = useState<DemoStatus>("ready");
  const [formSentDate, setFormSentDate] = useState("");
  const [formLink, setFormLink] = useState("");
  const [formLinks, setFormLinks] = useState<{ type: string; value: string }[]>([]);
  const [formNotes, setFormNotes] = useState("");
  const [formGenre, setFormGenre] = useState("");
  const [formBpm, setFormBpm] = useState("");
  const [formKey, setFormKey] = useState("");
  // Combobox state for the target-label picker — keeps the picker open while
  // the user types and filters through 1192+ labels.
  const [labelComboboxOpen, setLabelComboboxOpen] = useState(false);
  const [labelSearchQuery, setLabelSearchQuery] = useState("");
  // Combobox state for the genre picker — same pattern, lets the user pick
  // from the 35 scraped genres OR type a custom one.
  const [genreComboboxOpen, setGenreComboboxOpen] = useState(false);
  const [genreSearchQuery, setGenreSearchQuery] = useState("");
  // Audio analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<{
    stage: string;
    message: string;
    progress: number;
  } | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [formAnalysis, setFormAnalysis] = useState<Demo["analysis"] | null>(null);

  const filteredDemos = useMemo(() => {
    return demos.filter((d) => {
      const matchSearch =
        !search ||
        d.trackName.toLowerCase().includes(search.toLowerCase()) ||
        d.notes.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || d.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [demos, search, statusFilter]);

  // Label history: all demos for a specific label
  const labelHistoryDemos = useMemo(() => {
    if (!labelHistoryId) return [];
    return demos
      .filter((d) => d.labelId === labelHistoryId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [demos, labelHistoryId]);

  const labelHistoryName = useMemo(() => {
    if (!labelHistoryId) return "";
    return labels.find((l) => l.id === labelHistoryId)?.name ?? "";
  }, [labels, labelHistoryId]);

  const getLabelName = (labelId: string) => {
    if (!labelId) return locale === "it" ? "Demo senza target" : "No target";
    return labels.find((l) => l.id === labelId)?.name ?? "—";
  };

  const resetForm = () => {
    setFormTrackName("");
    setFormLabelId("");
    setFormStatus("ready");
    setFormSentDate("");
    setFormLink("");
    setFormLinks([]);
    setFormNotes("");
    setFormGenre("");
    setFormBpm("");
    setFormKey("");
    setFormAnalysis(null);
    setAnalysisError(null);
    setAnalysisProgress(null);
    setLabelComboboxOpen(false);
    setLabelSearchQuery("");
    setGenreComboboxOpen(false);
    setGenreSearchQuery("");
  };

  const openAdd = () => { resetForm(); setEditingDemo(null); setShowAddDialog(true); };

  const openEdit = (demo: Demo) => {
    setFormTrackName(demo.trackName);
    setFormLabelId(demo.labelId);
    setFormStatus(demo.status);
    setFormSentDate(demo.sentDate ?? "");
    setFormLink(demo.link);
    setFormLinks(demo.links || []);
    setFormNotes(demo.notes);
    setFormGenre(demo.genre || "");
    setFormBpm(demo.bpm || "");
    setFormKey(demo.key || "");
    setFormAnalysis(demo.analysis || null);
    setAnalysisError(null);
    setAnalysisProgress(null);
    setEditingDemo(demo);
    setShowAddDialog(true);
  };

  const handleSave = () => {
    // Only trackName is required. labelId may be empty when the user wants
    // to save a demo for sending to multiple labels later (no specific target yet).
    if (!formTrackName.trim()) return;
    const data = {
      trackName: formTrackName.trim(),
      labelId: formLabelId || "",
      status: formStatus,
      sentDate: formSentDate || null,
      link: formLink.trim(),
      links: formLinks.filter(l => l.value.trim()),
      notes: formNotes.trim(),
      pitchText: editingDemo?.pitchText || "",
      artistName: editingDemo?.artistName || userProfile.artistName || "",
      genre: formGenre.trim(),
      bpm: formBpm.trim(),
      key: formKey.trim(),
      analysis: formAnalysis || undefined,
    };
    if (editingDemo) { updateDemo(editingDemo.id, data); }
    else { addDemo(data); }
    setShowAddDialog(false);
    resetForm();
  };

  const handleAnalyze = async () => {
    const audioSourceUrl = formLink.trim() || (formLinks.find(l => l.type === "soundcloud" || l.type === "audio")?.value?.trim() ?? "");
    if (!audioSourceUrl) {
      setAnalysisError("Inserisci un link SoundCloud o URL audio diretto, oppure usa 'Carica file'");
      return;
    }
    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisProgress({ stage: "fetching", message: "Inizio...", progress: 0 });
    try {
      // Dynamic import to keep the initial bundle small
      const { analyzeAudio, analyzeWithCyanite } = await import("@/lib/audio-analysis");
      const cyaniteToken = (userProfile as any)?.cyaniteApiToken?.trim?.() || "";
      // Safety timeout: abort analysis after 120s
      const timeoutMs = 120_000;
      const result = await Promise.race([
        cyaniteToken
          ? analyzeWithCyanite(audioSourceUrl, cyaniteToken, (p) => setAnalysisProgress(p))
          : analyzeAudio(audioSourceUrl, (p) => setAnalysisProgress(p)),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Timeout: analisi troppo lunga (>120s). Prova con 'Carica file' o ricarica la pagina.")), timeoutMs)
        ),
      ]);
      setFormAnalysis(result);
      // Auto-fill BPM and key if empty or always update with analysis values
      setFormBpm(String(result.bpm));
      // Only auto-fill key if it was actually detected (confidence > 0)
      if (result.key.confidence > 0) {
        setFormKey(result.key.name);
      }
      setAnalysisProgress({ stage: "done", message: "Analisi completata!", progress: 1 });
      // Clear progress after 2 seconds
      setTimeout(() => setAnalysisProgress(null), 2000);
    } catch (err: any) {
      console.error("[analyze]", err);
      let userMsg = "Errore durante l'analisi";
      if (err?.message) {
        const m = err.message;
        if (/soundcloud|risolvere/i.test(m)) {
          userMsg = m; // already user-friendly from proxy
        } else if (/format|corrupt|decode/i.test(m)) {
          userMsg = `Il browser non è riuscito a decodificare l'audio scaricato. SoundCloud potrebbe aver restituito un formato non supportato. Prova con 'Carica file'. Dettagli: ${m}`;
        } else if (/wasm|essentia|memory/i.test(m)) {
          userMsg = `Errore del motore di analisi: ${m}. Prova con 'Carica file' (più affidabile).`;
        } else {
          userMsg = m;
        }
      } else if (typeof err === "string") {
        userMsg = err;
      }
      setAnalysisError(userMsg);
      setAnalysisProgress(null);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAnalyzeFile = async (file: File) => {
    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisProgress({ stage: "fetching", message: `Lettura ${file.name}...`, progress: 0.2 });
    try {
      const { analyzeAudioFile } = await import("@/lib/audio-analysis");
      // Safety timeout: abort analysis after 120s to prevent infinite hang
      const timeoutMs = 120_000;
      const result = await Promise.race([
        analyzeAudioFile(file, (p) => setAnalysisProgress(p)),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Timeout: analisi troppo lunga (>120s). Prova con un file più corto (max 60s) o ricarica la pagina.")), timeoutMs)
        ),
      ]);
      setFormAnalysis(result);
      setFormBpm(String(result.bpm));
      // Only auto-fill key if it was actually detected (confidence > 0)
      if (result.key.confidence > 0) {
        setFormKey(result.key.name);
      }
      setAnalysisProgress({ stage: "done", message: "Analisi completata!", progress: 1 });
      setTimeout(() => setAnalysisProgress(null), 2000);
    } catch (err: any) {
      console.error("[analyze file]", err);
      // Build a clear user-facing message
      let userMsg = "Errore durante l'analisi del file";
      if (err?.message) {
        const m = err.message;
        if (/format|corrupt|decode/i.test(m)) {
          userMsg = `Formato non supportato o file corrotto: ${m}`;
        } else if (/wasm|essentia|memory/i.test(m)) {
          userMsg = `Errore interno del motore di analisi (essentia.js): ${m}. Prova con un file più piccolo o un formato diverso (MP3 consigliato).`;
        } else {
          userMsg = m;
        }
      } else if (typeof err === "string") {
        userMsg = err;
      }
      setAnalysisError(userMsg);
      setAnalysisProgress(null);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const canAdvance = (status: DemoStatus) => STATUS_FLOW.indexOf(status) < STATUS_FLOW.length - 1;

  // Cross-tab navigation from SimilarSuggestions panel inside the add/edit
  // dialog. Clicking a label name closes this dialog and opens the label
  // detail dialog in the Labels tab; clicking an artist name closes this
  // dialog and opens the artist detail page in the Artists tab. Promoting
  // a suggested label to the demo's target is in-dialog (no navigation).
  const handleOpenLabelFromSuggestion = useCallback(
    (label: Label) => {
      setShowAddDialog(false);
      setSelectedLabelId?.(label.id || label.name);
      setActiveTab("labels");
    },
    [setActiveTab, setSelectedLabelId]
  );
  const handleOpenArtistFromSuggestion = useCallback(
    (artistId: string) => {
      setShowAddDialog(false);
      setSelectedArtistId?.(artistId);
      setActiveTab("artists");
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    },
    [setActiveTab, setSelectedArtistId]
  );
  const handleSelectLabelAsTarget = useCallback(
    (label: Label) => {
      setFormLabelId(label.id);
      // Auto-fill genre if the demo doesn't have one yet and the label has a best genre
      if (!formGenre.trim() && label.genres?.length) {
        setFormGenre(label.genres[0]);
      }
    },
    [formGenre]
  );

  // If viewing label history, show that instead
  if (labelHistoryId) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setLabelHistoryId(null)} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            {t(locale, "demos.backToTracker")}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Music2 className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-bold text-foreground">{labelHistoryName}</h3>
          <Badge variant="secondary" className="text-[10px]">{labelHistoryDemos.length} {t(locale, "demos.submissions")}</Badge>
        </div>

        {labelHistoryDemos.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Music className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">{t(locale, "demos.noDemos")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {labelHistoryDemos.map((demo) => {
              const config = STATUS_COLORS[demo.status];
              const daysSince = getDaysSince(demo.sentDate);
              return (
                <Card
                  key={demo.id}
                  className="bg-card/80 border-border/30 hover:border-primary/30 transition-all cursor-pointer"
                  onClick={() => setDetailDemo(demo)}
                >
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-semibold text-foreground">{demo.trackName}</h4>
                          <Badge variant="outline" className={`${config.bgColor} ${config.color} ${config.borderColor} text-[10px]`}>
                            {STATUS_ICONS[demo.status]}
                            <span className="ml-1">{t(locale, STATUS_TKEYS[demo.status])}</span>
                          </Badge>
                          {demo.artistName && (
                            <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-0.5">
                              <User className="h-2.5 w-2.5" /> {demo.artistName}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[11px] text-muted-foreground">
                          {demo.sentDate && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" /> {demo.sentDate}
                              {daysSince !== null && <span className="ml-0.5">({daysSince}{t(locale, "dash.daysAgo")})</span>}
                            </span>
                          )}
                          {demo.link && (
                            <span className="flex items-center gap-1 font-mono truncate max-w-[200px]">
                              <Link2 className="h-3 w-3" /> {demo.link}
                            </span>
                          )}
                          {demo.pitchText && (
                            <span className="flex items-center gap-1 text-primary/50">
                              <FileText className="h-3 w-3" /> {t(locale, "demos.hasPitch")}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setDetailDemo(demo); }} title={t(locale, "demos.viewDetail")}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {canAdvance(demo.status) && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); advanceDemoStatus(demo.id); }} title={t(locale, "demos.advance")}>
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEdit(demo); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Detail Dialog (reused) */}
        <DemoDetailDialog demo={detailDemo} onClose={() => setDetailDemo(null)} locale={locale} getLabelName={getLabelName} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t(locale, "demos.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-secondary/50 border-border/50"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[170px] bg-secondary/50 border-border/50">
            <SelectValue placeholder={t(locale, "demos.allStatuses")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t(locale, "demos.allStatuses")}</SelectItem>
            {STATUS_KEYS.map((s) => (
              <SelectItem key={s} value={s}>
                {t(locale, STATUS_TKEYS[s])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Button variant={viewMode === "kanban" ? "default" : "outline"} size="sm" onClick={() => setViewMode("kanban")} className="text-xs">
            {t(locale, "demos.kanban")}
          </Button>
          <Button variant={viewMode === "table" ? "default" : "outline"} size="sm" onClick={() => setViewMode("table")} className="text-xs">
            {t(locale, "demos.table")}
          </Button>
        </div>
        <Button onClick={openAdd} className="glow-purple shrink-0">
          <Plus className="h-4 w-4 mr-1.5" />
          {t(locale, "demos.addDemo")}
        </Button>
      </div>

      {/* Kanban View */}
      {viewMode === "kanban" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 min-h-[400px]">
          {STATUS_KEYS.map((status) => {
            const config = STATUS_COLORS[status];
            const columnDemos = filteredDemos.filter((d) => d.status === status);
            return (
              <div key={status} className={`rounded-xl border ${config.borderColor} ${config.bgColor} p-3 space-y-2`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={config.color}>{STATUS_ICONS[status]}</span>
                  <span className={`text-xs font-semibold uppercase tracking-wider ${config.color}`}>
                    {t(locale, STATUS_TKEYS[status])}
                  </span>
                  <span className="ml-auto text-[10px] font-mono text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
                    {columnDemos.length}
                  </span>
                </div>
                {columnDemos.map((demo) => {
                  const daysSince = getDaysSince(demo.sentDate);
                  const isOverdue = (demo.status === "sent" || demo.status === "reviewing") && daysSince !== null && daysSince > 14;
                  return (
                    <Card
                      key={demo.id}
                      className={`bg-card/80 border-border/30 hover:border-primary/20 transition-all group cursor-pointer ${isOverdue ? "ring-1 ring-amber-500/40" : ""}`}
                      onClick={() => setDetailDemo(demo)}
                    >
                      <CardContent className="p-3 space-y-1.5">
                        <div className="flex items-start justify-between gap-1">
                          <h4 className="text-sm font-semibold text-foreground leading-tight">{demo.trackName}</h4>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); setDetailDemo(demo); }} title={t(locale, "demos.viewDetail")}>
                              <Eye className="h-3 w-3" />
                            </Button>
                            {canAdvance(demo.status) && (
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); advanceDemoStatus(demo.id); }} title={t(locale, "demos.advance")}>
                                <ChevronRight className="h-3 w-3" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); openEdit(demo); }}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 hover:text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(demo.id); }}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <p
                          className="text-xs text-primary/70 font-medium cursor-pointer hover:underline"
                          onClick={(e) => { e.stopPropagation(); setLabelHistoryId(demo.labelId); }}
                        >
                          {getLabelName(demo.labelId)}
                        </p>
                        {demo.sentDate && (
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span>{demo.sentDate}{daysSince !== null && <span className={isOverdue ? "text-amber-400 font-semibold ml-1" : "ml-1"}>({daysSince}{t(locale, "dash.daysAgo")})</span>}</span>
                          </div>
                        )}
                        {demo.pitchText && (
                          <div className="flex items-center gap-1 text-[10px] text-primary/50">
                            <FileText className="h-2.5 w-2.5" /> {t(locale, "demos.hasPitch")}
                          </div>
                        )}
                        {demo.analysis && (
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground pt-0.5">
                            <Activity className={`h-2.5 w-2.5 ${demo.analysis.analysisSource === "cyanite" ? "text-primary" : "text-emerald-400"}`} />
                            <span className="font-mono">
                              {demo.analysis.bpm} BPM · {demo.analysis.key.camelot}
                            </span>
                            <span className="text-muted-foreground/60">·</span>
                            <span>{Math.round(demo.analysis.energy * 100)}% E</span>
                          </div>
                        )}
                        {isOverdue && (
                          <div className="flex items-center gap-1 text-[11px] text-amber-400 font-medium">
                            <AlertTriangle className="h-3 w-3" />
                            {t(locale, "demos.followUp")}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
                {columnDemos.length === 0 && <div className="text-center py-6 text-muted-foreground/40 text-xs">—</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* Table View */}
      {viewMode === "table" && (
        <div className="rounded-xl border border-border/40 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/30">
                <tr className="text-left text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">{t(locale, "demos.trackName")}</th>
                  <th className="px-4 py-3">{t(locale, "demos.targetLabel")}</th>
                  <th className="px-4 py-3">{t(locale, "labels.status")}</th>
                  <th className="px-4 py-3">{t(locale, "demos.sentDate")}</th>
                  <th className="px-4 py-3">{t(locale, "demos.daysSince")}</th>
                  <th className="px-4 py-3 text-right">{t(locale, "demos.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {filteredDemos.map((demo) => {
                  const config = STATUS_COLORS[demo.status];
                  const daysSince = getDaysSince(demo.sentDate);
                  const isOverdue = (demo.status === "sent" || demo.status === "reviewing") && daysSince !== null && daysSince > 14;
                  return (
                    <tr
                      key={demo.id}
                      className="hover:bg-secondary/20 transition-colors cursor-pointer"
                      onClick={() => setDetailDemo(demo)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{demo.trackName}</div>
                        {demo.artistName && <div className="text-[10px] text-muted-foreground/60 mt-0.5">{demo.artistName}</div>}
                        {demo.notes && <div className="text-[11px] text-muted-foreground/60 mt-0.5 line-clamp-1">{demo.notes}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="text-primary/80 text-xs font-medium cursor-pointer hover:underline"
                          onClick={(e) => { e.stopPropagation(); setLabelHistoryId(demo.labelId); }}
                        >
                          {getLabelName(demo.labelId)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={`${config.bgColor} ${config.color} ${config.borderColor}`}>
                          {STATUS_ICONS[demo.status]}
                          <span className="ml-1">{t(locale, STATUS_TKEYS[demo.status])}</span>
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{demo.sentDate ?? "—"}</td>
                      <td className="px-4 py-3 text-xs font-mono">
                        {daysSince !== null ? (
                          <span className={isOverdue ? "text-amber-400 font-semibold" : "text-muted-foreground"}>
                            {daysSince}{t(locale, "dash.daysAgo")}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setDetailDemo(demo); }} title={t(locale, "demos.viewDetail")}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {canAdvance(demo.status) && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); advanceDemoStatus(demo.id); }} title={t(locale, "demos.advance")}>
                              <ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEdit(demo); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(demo.id); }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredDemos.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                    <Music className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">{t(locale, "demos.noDemos")}</p>
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail Dialog */}
      <DemoDetailDialog demo={detailDemo} onClose={() => setDetailDemo(null)} locale={locale} getLabelName={getLabelName} />

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-2xl bg-card border-border/50 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingDemo ? t(locale, "demos.editDemo") : t(locale, "demos.addDemo")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <UILabel className="text-xs font-mono uppercase text-muted-foreground">{t(locale, "demos.trackName")}</UILabel>
              <Input value={formTrackName} onChange={(e) => setFormTrackName(e.target.value)} placeholder="e.g. Midnight Drive" className="bg-secondary/50" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <UILabel className="text-xs font-mono uppercase text-muted-foreground">
                    {locale === "it" ? "Label target" : "Target label"}
                    <span className="ml-1 text-[10px] text-muted-foreground/60 normal-case font-sans">
                      ({locale === "it" ? "opzionale" : "optional"})
                    </span>
                  </UILabel>
                  {formLabelId && (
                    <button
                      type="button"
                      onClick={() => setFormLabelId("")}
                      className="text-[10px] text-muted-foreground hover:text-destructive"
                    >
                      {locale === "it" ? "Rimuovi" : "Clear"}
                    </button>
                  )}
                </div>
                <Popover open={labelComboboxOpen} onOpenChange={setLabelComboboxOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={labelComboboxOpen}
                      className="w-full justify-between bg-secondary/50 font-normal h-9"
                    >
                      <span className="truncate text-left">
                        {formLabelId
                          ? (labels.find((l) => l.id === formLabelId)?.name || formLabelId)
                          : <span className="text-muted-foreground">{t(locale, "demos.selectLabel")}</span>}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command shouldFilter={true} filter={(value, search) => {
                      // Custom filter: match label name case-insensitively
                      const label = labels.find((l) => l.id === value);
                      if (!label) return 0;
                      const name = label.name.toLowerCase();
                      const q = search.toLowerCase().trim();
                      if (!q) return 1;
                      if (name.startsWith(q)) return 1;
                      if (name.includes(q)) return 0.7;
                      // Also search by genre
                      const genres = (label.genres || []).join(" ").toLowerCase();
                      if (genres.includes(q)) return 0.4;
                      return 0;
                    }}>
                      <CommandInput
                        placeholder={locale === "it" ? "Cerca label per nome o genere…" : "Search label by name or genre…"}
                        value={labelSearchQuery}
                        onValueChange={setLabelSearchQuery}
                      />
                      <CommandList>
                        <CommandEmpty>
                          {locale === "it" ? "Nessuna label trovata." : "No label found."}
                        </CommandEmpty>
                        <CommandGroup heading={locale === "it" ? "Tutte le label" : "All labels"}>
                          {/* Show open labels first, then closed — limit to 200 for performance */}
                          {labels
                            .slice()
                            .sort((a, b) => {
                              // Open labels first
                              if (a.status === "open" && b.status !== "open") return -1;
                              if (a.status !== "open" && b.status === "open") return 1;
                              return a.name.localeCompare(b.name);
                            })
                            .slice(0, 250)
                            .map((l) => (
                              <CommandItem
                                key={l.id}
                                value={l.id}
                                onSelect={(v) => {
                                  setFormLabelId(v === formLabelId ? "" : v);
                                  setLabelComboboxOpen(false);
                                  setLabelSearchQuery("");
                                  // Auto-fill genre if the demo doesn't have one yet
                                  if (!formGenre.trim() && l.genres?.length) {
                                    setFormGenre(l.genres[0]);
                                  }
                                }}
                                className="flex items-center gap-2"
                              >
                                <Check
                                  className={`h-3.5 w-3.5 ${formLabelId === l.id ? "opacity-100" : "opacity-0"}`}
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-sm truncate">{l.name}</span>
                                    {l.status === "closed" && (
                                      <Badge className="text-[8px] px-1 py-0 shrink-0 bg-red-500/20 text-red-400 border-red-500/30">
                                        {locale === "it" ? "chiusa" : "closed"}
                                      </Badge>
                                    )}
                                  </div>
                                  {l.genres?.length > 0 && (
                                    <span className="text-[10px] text-muted-foreground truncate block">
                                      {l.genres.join(", ")}
                                    </span>
                                  )}
                                </div>
                              </CommandItem>
                            ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {!formLabelId && (
                  <p className="text-[10px] text-muted-foreground/70 leading-snug flex items-start gap-1">
                    <AlertCircle className="h-3 w-3 mt-0.5 shrink-0 text-amber-400" />
                    <span>
                      {locale === "it"
                        ? "Demo senza target: salvata per essere inviata a più label in seguito. Utile quando invii tramite il form della label stessa."
                        : "No target: saved to be sent to multiple labels later. Useful when you submit via the label's own form."}
                    </span>
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <UILabel className="text-xs font-mono uppercase text-muted-foreground">{t(locale, "labels.status")}</UILabel>
                <Select value={formStatus} onValueChange={(v) => setFormStatus(v as DemoStatus)}>
                  <SelectTrigger className="bg-secondary/50"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_KEYS.map((s) => (<SelectItem key={s} value={s}>{t(locale, STATUS_TKEYS[s])}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <UILabel className="text-xs font-mono uppercase text-muted-foreground">{t(locale, "demos.scLink")}</UILabel>
              <Input value={formLink} onChange={(e) => setFormLink(e.target.value)} placeholder="https://soundcloud.com/..." className="bg-secondary/50" />
            </div>
            {/* Additional demo links */}
            {formLinks.map((fl, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <Select value={fl.type} onValueChange={(v) => {
                  const newLinks = [...formLinks];
                  newLinks[idx] = { ...newLinks[idx], type: v };
                  setFormLinks(newLinks);
                }}>
                  <SelectTrigger className="bg-secondary/50 w-[130px] shrink-0 h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="soundcloud">SoundCloud</SelectItem>
                    <SelectItem value="label_form">{locale === "it" ? "Form label" : "Label form"}</SelectItem>
                    <SelectItem value="dropbox">Dropbox</SelectItem>
                    <SelectItem value="wetransfer">WeTransfer</SelectItem>
                    <SelectItem value="drive">Google Drive</SelectItem>
                    <SelectItem value="other">{t(locale, "labels.linkTypeOther")}</SelectItem>
                  </SelectContent>
                </Select>
                <Input value={fl.value} onChange={(e) => {
                  const newLinks = [...formLinks];
                  newLinks[idx] = { ...newLinks[idx], value: e.target.value };
                  setFormLinks(newLinks);
                }} placeholder="https://..." className="bg-secondary/50 flex-1 text-sm" />
                <Button variant="ghost" size="icon" className="shrink-0 h-9 w-9 text-muted-foreground hover:text-destructive"
                  onClick={() => setFormLinks(formLinks.filter((_, i) => i !== idx))}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full border-dashed text-muted-foreground hover:text-primary"
              onClick={() => setFormLinks([...formLinks, { type: "label_form", value: "" }])}>
              <Plus className="h-3 w-3 mr-1" /> {t(locale, "demos.addLink")}
            </Button>
            <p className="text-[10px] text-muted-foreground/60 leading-snug">
              {locale === "it"
                ? "💡 Aggiungi un link di tipo 'Form label' quando hai inviato la demo tramite il form sulla pagina della label stessa."
                : "💡 Add a 'Label form' link when you submitted the demo via the form on the label's own page."}
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <UILabel className="text-xs font-mono uppercase text-muted-foreground">
                  {t(locale, "demos.genre")}
                </UILabel>
                <Popover open={genreComboboxOpen} onOpenChange={setGenreComboboxOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={genreComboboxOpen}
                      className="w-full justify-between bg-secondary/50 font-normal h-9"
                    >
                      <span className="truncate text-left">
                        {formGenre.trim()
                          ? formGenre
                          : <span className="text-muted-foreground">{locale === "it" ? "Seleziona o digita…" : "Pick or type…"}</span>}
                      </span>
                      <Filter className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder={locale === "it" ? "Digita per filtrare o creare…" : "Type to filter or create…"}
                        value={formGenre}
                        onValueChange={(v) => {
                          setFormGenre(v);
                          setGenreSearchQuery(v);
                        }}
                      />
                      <CommandList>
                        {formGenre.trim() && !genres.some(g => g.toLowerCase() === formGenre.trim().toLowerCase()) && (
                          <CommandGroup heading={locale === "it" ? "Personalizzato" : "Custom"}>
                            <CommandItem
                              value={`__custom__${formGenre}`}
                              onSelect={() => setGenreComboboxOpen(false)}
                              className="text-amber-400"
                            >
                              <span className="text-sm">+ {locale === "it" ? `Usa "${formGenre}"` : `Use "${formGenre}"`}</span>
                            </CommandItem>
                          </CommandGroup>
                        )}
                        <CommandGroup heading={locale === "it" ? "Generi scrapati" : "Scraped genres"}>
                          {genres
                            .filter(g => !formGenre.trim() || g.toLowerCase().includes(formGenre.trim().toLowerCase()))
                            .map((g) => (
                              <CommandItem
                                key={g}
                                value={g}
                                onSelect={(v) => {
                                  setFormGenre(v);
                                  setGenreComboboxOpen(false);
                                }}
                                className="flex items-center gap-2"
                              >
                                <Check
                                  className={`h-3.5 w-3.5 ${formGenre.toLowerCase() === g.toLowerCase() ? "opacity-100" : "opacity-0"}`}
                                />
                                <span className="text-sm">{g}</span>
                              </CommandItem>
                            ))}
                          {genres.filter(g => !formGenre.trim() || g.toLowerCase().includes(formGenre.trim().toLowerCase())).length === 0 && (
                            <CommandEmpty>
                              {locale === "it" ? "Nessun genere trovato." : "No genre found."}
                            </CommandEmpty>
                          )}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <UILabel className="text-xs font-mono uppercase text-muted-foreground">
                  BPM
                  {formAnalysis && formBpm && parseInt(formBpm, 10) !== formAnalysis.bpm && (
                    <span className="ml-1 text-[9px] text-amber-400 normal-case font-sans">(corretto)</span>
                  )}
                </UILabel>
                <Input
                  value={formBpm}
                  onChange={(e) => setFormBpm(e.target.value)}
                  placeholder="128"
                  className="bg-secondary/50"
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-1.5">
                <UILabel className="text-xs font-mono uppercase text-muted-foreground">Key</UILabel>
                <Input
                  value={formKey}
                  onChange={(e) => setFormKey(e.target.value)}
                  placeholder="Am"
                  className="bg-secondary/50"
                />
              </div>
            </div>

            {/* Audio Analysis */}
            <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-mono uppercase text-primary">Analisi Audio</span>
                  {formAnalysis && (
                    <Badge variant="outline" className="text-[10px] bg-primary/10 border-primary/30 text-primary">
                      {formAnalysis.analysisSource === "cyanite" ? "Cyanite" : "Free"}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleAnalyzeFile(f);
                        e.target.value = ""; // reset for reuse
                      }}
                    />
                    <span className="inline-flex items-center gap-1 px-2.5 h-7 text-xs bg-secondary hover:bg-secondary/70 rounded-md border border-border/50 transition-colors">
                      <Upload className="h-3 w-3" /> Carica file
                    </span>
                  </label>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={handleAnalyze}
                    disabled={isAnalyzing || (!formLink.trim() && !formLinks.some(l => l.value.trim()))}
                    className="h-7 text-xs"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Analisi...
                      </>
                    ) : (
                      <>
                        <Zap className="h-3 w-3 mr-1" /> Analizza link
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Progress bar */}
              {analysisProgress && analysisProgress.stage !== "done" && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{analysisProgress.message}</span>
                    <span>{Math.round(analysisProgress.progress * 100)}%</span>
                  </div>
                  <div className="h-1 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${analysisProgress.progress * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Error */}
              {analysisError && (
                <div className="flex items-start gap-1.5 text-[11px] text-destructive">
                  <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                  <span>{analysisError}</span>
                </div>
              )}

              {/* Results */}
              {formAnalysis && (
                <div className="space-y-2">
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="bg-secondary/40 rounded p-1.5">
                      <p className="text-[9px] text-muted-foreground uppercase">BPM</p>
                      <p className="text-sm font-mono font-semibold text-primary">{formAnalysis.bpm}</p>
                    </div>
                    <div className="bg-secondary/40 rounded p-1.5">
                      <p className="text-[9px] text-muted-foreground uppercase">Key</p>
                      <p className="text-sm font-mono font-semibold text-primary">{formAnalysis.key.camelot}</p>
                    </div>
                    <div className="bg-secondary/40 rounded p-1.5">
                      <p className="text-[9px] text-muted-foreground uppercase">Energy</p>
                      <p className="text-sm font-mono font-semibold text-primary">{Math.round(formAnalysis.energy * 100)}%</p>
                    </div>
                    <div className="bg-secondary/40 rounded p-1.5">
                      <p className="text-[9px] text-muted-foreground uppercase">Dance</p>
                      <p className="text-sm font-mono font-semibold text-primary">{Math.round(formAnalysis.danceability * 100)}%</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{formAnalysis.key.name}</span>
                    <span>{Math.round(formAnalysis.duration)}s · {formAnalysis.loudness} dBFS</span>
                  </div>
                  {formAnalysis.analysisSource === "cyanite" && formAnalysis.cyaniteGenre && (
                    <div className="text-[10px] text-muted-foreground">
                      <span className="text-primary/70">Genere (Cyanite):</span> {formAnalysis.cyaniteGenre}
                    </div>
                  )}
                  {formAnalysis.analysisSource === "cyanite" && formAnalysis.cyaniteMoods && formAnalysis.cyaniteMoods.length > 0 && (
                    <div className="text-[10px] text-muted-foreground">
                      <span className="text-primary/70">Mood:</span> {formAnalysis.cyaniteMoods.join(", ")}
                    </div>
                  )}
                  {formAnalysis.analysisSource === "cyanite" && formAnalysis.cyaniteInstruments && formAnalysis.cyaniteInstruments.length > 0 && (
                    <div className="text-[10px] text-muted-foreground">
                      <span className="text-primary/70">Strumenti:</span> {formAnalysis.cyaniteInstruments.join(", ")}
                    </div>
                  )}
                </div>
              )}

              <p className="text-[10px] text-muted-foreground leading-tight">
                {userProfile.cyaniteApiToken ? (
                  <>Analisi avanzata con <span className="text-primary">Cyanite</span> (BYOK). Rimuovi il token dal Profilo per usare l'analisi gratuita.</>
                ) : (
                  <>Analisi gratuita in-browser (BPM, key, energia). Per genere/mood/strumenti, aggiungi un token <span className="text-primary">Cyanite</span> nel Profilo.</>
                )}
              </p>
              <p className="text-[10px] text-muted-foreground/70 leading-tight">
                💡 <strong>Suggerimento</strong>: se l'analisi del link SoundCloud fallisce, usa <span className="text-primary">"Carica file"</span> per analizzare direttamente il tuo MP3/WAV — è il metodo più affidabile.
              </p>
            </div>

            {/* Similar labels & artists suggestions — auto-matched from the
                scraped Beatport DB based on the track's BPM, key (Camelot),
                and genre. Helps the user answer "who do I send this to?"
                without having to scroll through 1192 labels manually. */}
            <SimilarSuggestions
              analysis={formAnalysis}
              genre={formGenre}
              manualBpm={formBpm}
              manualKey={formKey}
              artists={artists}
              labels={labels}
              locale={locale}
              onOpenLabel={handleOpenLabelFromSuggestion}
              onOpenArtist={handleOpenArtistFromSuggestion}
              onSelectLabel={handleSelectLabelAsTarget}
            />

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <UILabel className="text-xs font-mono uppercase text-muted-foreground">{t(locale, "demos.dateSent")}</UILabel>
                <Input type="date" value={formSentDate} onChange={(e) => setFormSentDate(e.target.value)} className="bg-secondary/50" />
              </div>
            </div>
            <div className="space-y-1.5">
              <UILabel className="text-xs font-mono uppercase text-muted-foreground">{t(locale, "labels.notes")}</UILabel>
              <Textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="BPM, key..." rows={2} className="bg-secondary/50 resize-none" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAddDialog(false)}>{t(locale, "labels.cancel")}</Button>
            <Button onClick={handleSave} disabled={!formTrackName.trim()}>
              {editingDemo ? t(locale, "labels.update") : t(locale, "labels.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent className="sm:max-w-sm bg-card border-border/50">
          <DialogHeader><DialogTitle>{t(locale, "demos.deleteConfirm")}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{t(locale, "demos.deleteConfirmMsg")}</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteConfirmId(null)}>{t(locale, "labels.cancel")}</Button>
            <Button variant="destructive" onClick={() => { if (deleteConfirmId) { deleteDemo(deleteConfirmId); setDeleteConfirmId(null); } }}>
              {t(locale, "labels.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== DETAIL DIALOG COMPONENT ====================

function DemoDetailDialog({
  demo,
  onClose,
  locale,
  getLabelName,
}: {
  demo: Demo | null;
  onClose: () => void;
  locale: string;
  getLabelName: (id: string) => string;
}) {
  if (!demo) return null;

  const config = STATUS_COLORS[demo.status];
  const daysSince = getDaysSince(demo.sentDate);
  const labelName = getLabelName(demo.labelId);

  return (
    <Dialog open={!!demo} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-2xl bg-card border-border/50 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <Music className="h-5 w-5 text-primary" />
            <span>{demo.trackName}</span>
            <Badge variant="outline" className={`${config.bgColor} ${config.color} ${config.borderColor} text-[10px]`}>
              {STATUS_ICONS[demo.status]}
              <span className="ml-1">{t(locale, STATUS_TKEYS[demo.status])}</span>
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Key info grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-secondary/30 rounded-lg p-3">
              <p className="text-[10px] text-muted-foreground uppercase flex items-center gap-1"><Music2 className="h-3 w-3" /> {t(locale, "demos.targetLabel")}</p>
              <p className="text-sm font-semibold text-primary mt-1 truncate">{labelName}</p>
            </div>
            {demo.sentDate && (
              <div className="bg-secondary/30 rounded-lg p-3">
                <p className="text-[10px] text-muted-foreground uppercase flex items-center gap-1"><Calendar className="h-3 w-3" /> {t(locale, "demos.sentDate")}</p>
                <p className="text-sm font-semibold text-foreground mt-1">{demo.sentDate}</p>
                {daysSince !== null && <p className="text-[10px] text-muted-foreground mt-0.5">{daysSince} {t(locale, "dash.daysAgo")}</p>}
              </div>
            )}
            {demo.artistName && (
              <div className="bg-secondary/30 rounded-lg p-3">
                <p className="text-[10px] text-muted-foreground uppercase flex items-center gap-1"><User className="h-3 w-3" /> {t(locale, "pitch.artistName")}</p>
                <p className="text-sm font-semibold text-foreground mt-1 truncate">{demo.artistName}</p>
              </div>
            )}
            <div className="bg-secondary/30 rounded-lg p-3">
              <p className="text-[10px] text-muted-foreground uppercase">{t(locale, "labels.status")}</p>
              <p className={`text-sm font-bold mt-1 ${config.color}`}>{t(locale, STATUS_TKEYS[demo.status])}</p>
            </div>
          </div>

          {/* SoundCloud Link */}
          {demo.link && (
            <div className="space-y-1.5">
              <UILabel className="text-xs font-mono uppercase text-muted-foreground flex items-center gap-1">
                <Link2 className="h-3 w-3" /> {t(locale, "pitch.scLink")}
              </UILabel>
              <a href={demo.link} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline font-mono break-all">
                {demo.link}
              </a>
            </div>
          )}

          {/* Notes */}
          {demo.notes && (
            <div className="space-y-1.5">
              <UILabel className="text-xs font-mono uppercase text-muted-foreground">{t(locale, "labels.notes")}</UILabel>
              <p className="text-sm text-foreground/80">{demo.notes}</p>
            </div>
          )}

          {/* Pitch text (the email that was sent) */}
          {demo.pitchText && (
            <div className="space-y-2 border-t border-border/30 pt-3">
              <UILabel className="text-xs font-mono uppercase text-muted-foreground flex items-center gap-1">
                <FileText className="h-3 w-3" /> {t(locale, "demos.pitchSent")}
              </UILabel>
              <Card className="bg-card/80 border-border/30">
                <CardContent className="p-4 max-h-[350px] overflow-y-auto">
                  <pre className="text-[11px] leading-relaxed whitespace-pre-wrap font-mono text-foreground/80">{demo.pitchText}</pre>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Creation date */}
          <div className="text-[10px] text-muted-foreground/40 font-mono pt-1">
            {t(locale, "demos.createdOn")} {new Date(demo.createdAt).toLocaleString(locale === "it" ? "it-IT" : locale === "es" ? "es-ES" : locale === "fr" ? "fr-FR" : locale === "de" ? "de-DE" : locale === "pt" ? "pt-PT" : "en-US")}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t(locale, "labels.close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
