"use client";

import { useAppStore, type Demo, type DemoStatus, type Label, type Release } from "@/lib/store";
import { t, type Locale } from "@/lib/i18n";
import { type PitchTrackEntry, type TrackStatus } from "@/lib/pitch-utils";
import { useState, useMemo, useCallback, useEffect, type ChangeEvent } from "react";
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
  Copy as CopyIcon,
  Lock,
  Reply,
  MessageSquare,
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
import { Check, ChevronsUpDown, Filter, AlertCircle, Sparkles, Copy, Languages, MailOpen, SendHorizonal, RotateCcw, RefreshCw, Bell, Inbox, Paperclip } from "lucide-react";
import {
  generatePitch,
  generateSubject,
  generatePitchBody,
  generateMailtoLink,
  generateGmailLink,
  parsePitchText,
  parseMultiTrackFromPitchText,
  PITCH_LANGUAGES,
  type PitchTone,
  type PitchLanguage,
} from "@/lib/pitch-utils";
import { useToast } from "@/hooks/use-toast";
import { sendEmail, sendReplyInThread, ensureValidToken } from "@/lib/gmail";
import { sendEmailInApp, isInAppEmailConfigured } from "@/lib/email";

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

export function formatDemoDate(dateStr: string | null, locale: string): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(locale === "it" ? "it-IT" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch (e) {
    return dateStr;
  }
}

const STATUS_TKEYS: Record<DemoStatus, "demos.ready" | "demos.sent" | "demos.reviewing" | "demos.accepted" | "demos.rejected"> = {
  ready: "demos.ready",
  sent: "demos.sent",
  reviewing: "demos.reviewing",
  accepted: "demos.accepted",
  rejected: "demos.rejected",
};

// ==================== REPLY STATUS HELPERS ====================
// These power the "label ha risposto?" feature. For now the user enters
// replies manually via the demo detail dialog; later Gmail API will
// auto-populate these fields.

export type ReplyStatus = "none" | "ack" | "info" | "positive" | "rejected";

const REPLY_STATUS_CONFIG: Record<
  ReplyStatus,
  { labelIt: string; labelEn: string; color: string; bgColor: string; borderColor: string; icon: "inbox" | "ear" | "thumbs-up" | "thumbs-down" }
> = {
  none:      { labelIt: "Nessuna risposta",   labelEn: "No reply",          color: "text-muted-foreground",    bgColor: "bg-secondary/30",      borderColor: "border-border/30",      icon: "inbox" },
  ack:       { labelIt: "ACK ricevuto",       labelEn: "Ack received",      color: "text-blue-400",            bgColor: "bg-blue-500/10",       borderColor: "border-blue-500/30",    icon: "inbox" },
  info:      { labelIt: "Richiesta info",     labelEn: "Info requested",    color: "text-amber-400",           bgColor: "bg-amber-500/10",      borderColor: "border-amber-500/30",   icon: "ear" },
  positive:  { labelIt: "Risposta positiva",  labelEn: "Positive reply",    color: "text-emerald-400",         bgColor: "bg-emerald-500/10",    borderColor: "border-emerald-500/30", icon: "thumbs-up" },
  rejected:  { labelIt: "Rifiutata",          labelEn: "Rejected",          color: "text-red-400",             bgColor: "bg-red-500/10",        borderColor: "border-red-500/30",     icon: "thumbs-down" },
};

export const TRACK_STATUS_CONFIG: Record<
  TrackStatus,
  { labelIt: string; labelEn: string; color: string; bgColor: string; borderColor: string }
> = {
  awaiting: { labelIt: "Inviata (In attesa)", labelEn: "Sent (Awaiting)", color: "text-gray-400", bgColor: "bg-gray-500/10", borderColor: "border-gray-500/20" },
  reviewing: { labelIt: "In Trattativa", labelEn: "In Discussion", color: "text-cyan-400", bgColor: "bg-cyan-500/10", borderColor: "border-cyan-500/20" },
  accepted: { labelIt: "Interesse / Accettata", labelEn: "Interested / Accepted", color: "text-emerald-400", bgColor: "bg-emerald-500/10", borderColor: "border-emerald-500/20" },
  rejected: { labelIt: "Rifiutata", labelEn: "Declined", color: "text-red-400", bgColor: "bg-red-500/10", borderColor: "border-red-500/20" },
  signed: { labelIt: "Firmata! 🎉", labelEn: "Signed! 🎉", color: "text-purple-400", bgColor: "bg-purple-500/10", borderColor: "border-purple-500/20" },
  declined: { labelIt: "Svincolata", labelEn: "Released", color: "text-gray-500", bgColor: "bg-secondary/30", borderColor: "border-border/30" },
};

function getReplyStatus(demo: Demo): ReplyStatus {
  return (demo.replyStatus as ReplyStatus) || "none";
}

// Compute follow-up suggestion: if status is "sent" or "reviewing", the
// label hasn't replied (or only ACK), and the due date has passed.
function getFollowUpStatus(demo: Demo): { isDue: boolean; dueDate: string | null; daysOverdue: number } {
  if (demo.status !== "sent" && demo.status !== "reviewing") {
    return { isDue: false, dueDate: null, daysOverdue: 0 };
  }
  const reply = getReplyStatus(demo);
  // If we already have a positive or rejected reply, no need to follow up
  if (reply === "positive" || reply === "rejected") {
    return { isDue: false, dueDate: null, daysOverdue: 0 };
  }
  if (!demo.sentDate) {
    return { isDue: false, dueDate: null, daysOverdue: 0 };
  }
  // Default follow-up window: 28 days from sentDate (typical label SLA)
  // If a followUpDueDate is explicitly set on the demo, use that instead.
  const due = demo.followUpDueDate
    ? new Date(demo.followUpDueDate)
    : new Date(new Date(demo.sentDate).getTime() + 28 * 86400000);
  const dueStr = due.toISOString().split("T")[0];
  const daysOverdue = Math.floor((Date.now() - due.getTime()) / 86400000);
  return { isDue: daysOverdue > 0, dueDate: dueStr, daysOverdue: Math.max(0, daysOverdue) };
}

// ==================== LOCK HELPERS ====================
// Once a demo is sent, certain fields become read-only to prevent the user
// from accidentally changing the label/track/link after the email has gone
// out (which would make the saved pitch + sent history inconsistent).
// The user can still edit notes, pitch text, status, and add replies.

function isDemoLocked(demo: Demo | null): boolean {
  if (!demo) return false;
  // Lock applies once the demo has been sent (or moved past "ready")
  return demo.status !== "ready";
}

// When opening the edit dialog on a locked demo, show a lock badge instead
// of just silently disabling fields — the user needs to know why.

export function DemoTracker() {
  const { labels, demos, releases, addDemo, updateDemo, deleteDemo, advanceDemoStatus, addRelease, updateRelease, deleteRelease, locale: _locale, getGenres, userProfile, artists, setActiveTab, setSelectedLabelId, setSelectedArtistId, gmailAuth, setGmailAuth, scanGmailReplies, lastReplyScanAt, newRepliesCount } =
    useAppStore();
  const locale = _locale as Locale;
  const { toast } = useToast();
  const genres = getGenres();
  const [viewMode, setViewMode] = useState<"kanban" | "table">("kanban");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingDemo, setEditingDemo] = useState<Demo | null>(null);
  // "all" | "singles" (no parentReleaseId) | "ep" (has parentReleaseId)
  const [releaseFilter, setReleaseFilter] = useState<"all" | "singles" | "ep">("all");
  // EP dialog state
  const [showEpDialog, setShowEpDialog] = useState(false);
  const [epTitle, setEpTitle] = useState("");
  const [epArtists, setEpArtists] = useState<string[]>([]);
  const [epArtistInput, setEpArtistInput] = useState("");
  const [epGenre, setEpGenre] = useState("");
  const [epNotes, setEpNotes] = useState("");
  // Optional single SoundCloud URL for the whole EP (album/private set).
  // When set, pitches that include this EP will use this URL instead of
  // the per-track SC links — the label can preview the EP as a continuous
  // sequence.
  const [epSoundCloudUrl, setEpSoundCloudUrl] = useState("");
  const [epSelectedTrackIds, setEpSelectedTrackIds] = useState<Set<string>>(new Set());
  const [editingReleaseId, setEditingReleaseId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [scanningReplies, setScanningReplies] = useState(false);

  // Detail dialog
  const [detailDemoId, setDetailDemoId] = useState<string | null>(null);
  const detailDemo = useMemo(() => {
    if (!detailDemoId) return null;
    return demos.find((d) => d.id === detailDemoId) || null;
  }, [detailDemoId, demos]);

  const handleOpenDetail = useCallback((demo: Demo) => {
    setDetailDemoId(demo.id);
    if (demo.gmailUnreadResponse) {
      updateDemo(demo.id, { gmailUnreadResponse: false });
    }
  }, [updateDemo]);

  // Gmail reply scan — invokes store action, surfaces result via toast
  const handleScanReplies = useCallback(async () => {
    if (scanningReplies) return;
    if (!gmailAuth.isConnected) {
      toast({
        title: "Gmail non connesso",
        description: "Connetti Gmail dall'icona in alto a destra per scansionare le risposte.",
        variant: "destructive",
      });
      return;
    }
    setScanningReplies(true);
    try {
      const result = await scanGmailReplies();
      if (result.newReplies > 0) {
        toast({
          title: `${result.newReplies} nuova/e risposta/e`,
          description: result.details
            .slice(0, 4)
            .map((d) => `• ${d.trackName} — ${REPLY_STATUS_CONFIG[d.category as ReplyStatus]?.labelIt || "Non classificata"}`)
            .join("\n"),
        });
      } else if (result.scanned > 0) {
        toast({
          title: "Nessuna nuova risposta",
          description: `${result.scanned} demo scansionate. Le risposte delle label appariranno qui automaticamente.`,
        });
      } else {
        toast({
          title: "Nessuna demo da scansionare",
          description: "Non ci sono demo inviate in attesa di risposta.",
        });
      }
    } catch (err: any) {
      toast({
        title: "Scansione fallita",
        description: err.message || "Riprova tra qualche secondo.",
        variant: "destructive",
      });
    } finally {
      setScanningReplies(false);
    }
  }, [scanningReplies, gmailAuth.isConnected, scanGmailReplies, toast]);

  // Label history view
  const [labelHistoryId, setLabelHistoryId] = useState<string | null>(null);

  // Self-healing: if any demo has its global status out of sync with its track statuses,
  // automatically update it and sync to the database.
  useEffect(() => {
    const safeDemos = Array.isArray(demos) ? demos : [];
    safeDemos.forEach((demo) => {
      if (Array.isArray(demo.pitchTracks) && demo.pitchTracks.length >= 2) {
        const statuses = demo.pitchTracks.map(t => t.status || "awaiting");
        const activeStatuses = statuses.filter(s => s !== 'rejected' && s !== 'declined');

        let computedStatus: DemoStatus = "sent";
        let computedReplyStatus: Demo['replyStatus'] = demo.replyStatus || "none";

        if (activeStatuses.length === 0) {
          computedStatus = "rejected";
          computedReplyStatus = "rejected";
        } else if (activeStatuses.every(s => s === 'signed')) {
          computedStatus = "accepted";
          computedReplyStatus = "positive";
        } else if (activeStatuses.some(s => ['signed', 'accepted', 'reviewing'].includes(s))) {
          computedStatus = "reviewing";
          computedReplyStatus = activeStatuses.some(s => ['signed', 'accepted'].includes(s)) ? "positive" : "info";
        } else {
          computedStatus = "sent";
        }

        if (demo.status !== computedStatus || (computedReplyStatus !== "none" && demo.replyStatus !== computedReplyStatus)) {
          console.log(`[Self-Healing] Healing demo ${demo.id} (${demo.trackName}): status ${demo.status} -> ${computedStatus}, replyStatus ${demo.replyStatus} -> ${computedReplyStatus}`);
          updateDemo(demo.id, {
            status: computedStatus,
            replyStatus: computedReplyStatus,
          });
        }
      }
    });
  }, [demos, updateDemo]);

  const [formTrackName, setFormTrackName] = useState("");
  const [formArtists, setFormArtists] = useState<string[]>([]);
  const [formArtistInput, setFormArtistInput] = useState("");
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

  // ---------- Pitch (email) section for the AddDemo dialog ----------
  // Pitch state — mirrors the pitch section in the DemoDetailDialog so the
  // user can pick a tone (precompiled template), see a precompiled email
  // for the selected label, edit it inline, and copy / open in Gmail right
  // from the AddDemo dialog. Previously this was only available in the
  // detail dialog AFTER saving the demo — the user has to be able to draft
  // the email while they're filling in the demo metadata.
  const [pitchTone, setPitchTone] = useState<PitchTone>("professional");
  const [pitchLanguage, setPitchLanguage] = useState<PitchLanguage>("en");
  const [pitchNote, setPitchNote] = useState("");
  // Manual edits to the pitch preview — when non-null, the user has typed
  // into the textarea and we use their text instead of the auto-generated
  // pitchText. Initialized to null so the generated template is shown first.
  const [pitchEditedText, setPitchEditedText] = useState<string | null>(null);
  const [pitchCopied, setPitchCopied] = useState(false);

  // Resolve the full Label object for the currently-selected formLabelId —
  // we need its name, emails, and submissionType to generate the pitch.
  const formLabelObj = useMemo(
    () => labels.find((l) => l.id === formLabelId),
    [labels, formLabelId]
  );

  // Generated pitch text (the "suggested" / precompiled version). Recomputed
  // whenever the label, track name, tone, note, or language changes. If the
  // user has edited the textarea, displayPitchText (below) overrides this.
  const generatedPitchText = useMemo(() => {
    if (!formLabelObj || !formTrackName.trim()) return "";
    return generatePitch(
      formLabelObj.name,
      formTrackName.trim(),
      editingDemo?.artistName || userProfile.artistName || "",
      formLink.trim() || userProfile.scLink || "",
      pitchTone,
      pitchNote,
      formLabelObj.emails || [],
      formLabelObj.submissionType || "email",
      pitchLanguage
    );
  }, [formLabelObj, formTrackName, formLink, pitchTone, pitchNote, pitchLanguage, editingDemo, userProfile]);

  // Effective pitch text — what's actually shown in the textarea. Falls back to:
  //   1. pitchEditedText (user has typed) → highest priority
  //   2. editingDemo?.pitchText (existing pitch saved on the demo, when editing)
  //   3. generatedPitchText (fresh from the generator)
  const displayPitchText = pitchEditedText
    ?? editingDemo?.pitchText
    ?? generatedPitchText
    ?? "";

  // Parse subject + body from the (possibly edited) pitch text — used by
  // mailto: and Gmail web links.
  //
  // Resolution order when user hasn't manually edited (pitchEditedText === null):
  //   1. If editingDemo?.pitchText exists (saved pitch — possibly multi-track
  //      EP), parse subject/body from it. Regenerating from formTrackName +
  //      formLink would lose all EP multi-track info and produce a single-
  //      track pitch with only the first SC link (same bug that was fixed
  //      in DemoDetailDialog — see comment there for the full story).
  //   2. Otherwise, freshly generate a single-track pitch from form fields.
  const effectivePitchSubject = useMemo(() => {
    if (pitchEditedText === null) {
      if (editingDemo?.pitchText) {
        return parsePitchText(editingDemo.pitchText).subject;
      }
      return generateSubject(
        formTrackName.trim(),
        editingDemo?.artistName || userProfile.artistName || "",
        pitchLanguage
      );
    }
    return parsePitchText(displayPitchText).subject;
  }, [pitchEditedText, displayPitchText, formTrackName, editingDemo, userProfile, pitchLanguage]);

  const effectivePitchBody = useMemo(() => {
    if (pitchEditedText === null) {
      if (editingDemo?.pitchText) {
        return parsePitchText(editingDemo.pitchText).body;
      }
      if (!formLabelObj || !formTrackName.trim()) return "";
      return generatePitchBody(
        formLabelObj.name,
        formTrackName.trim(),
        editingDemo?.artistName || userProfile.artistName || "",
        formLink.trim() || userProfile.scLink || "",
        pitchTone,
        pitchNote,
        pitchLanguage
      );
    }
    return parsePitchText(displayPitchText).body;
  }, [pitchEditedText, displayPitchText, formLabelObj, formTrackName, formLink, editingDemo, userProfile, pitchTone, pitchNote, pitchLanguage]);

  const formMailtoLink = useMemo(() => {
    if (!formLabelObj?.emails?.length) return "";
    return generateMailtoLink(formLabelObj.emails, effectivePitchSubject, effectivePitchBody);
  }, [formLabelObj, effectivePitchSubject, effectivePitchBody]);

  const formGmailLink = useMemo(() => {
    if (!formLabelObj) return "";
    return generateGmailLink(formLabelObj.emails || [], effectivePitchSubject, effectivePitchBody);
  }, [formLabelObj, effectivePitchSubject, effectivePitchBody]);

  const handleFormPitchCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(displayPitchText);
      setPitchCopied(true);
      setTimeout(() => setPitchCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = displayPitchText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setPitchCopied(true);
      setTimeout(() => setPitchCopied(false), 2000);
    }
  }, [displayPitchText]);

  // When the user changes the target label or track name after editing the
  // pitch, discard their manual edits — the old edits were tied to a
  // different label/track and would be misleading. They can always re-edit.
  useEffect(() => {
    setPitchEditedText(null);
  }, [formLabelId, formTrackName]);
  // ---------- end pitch section ----------

  const filteredDemos = useMemo(() => {
    const safeDemos = Array.isArray(demos) ? demos : [];
    const q = (search || "").toLowerCase().trim();
    return safeDemos.filter((d) => {
      if (!d) return false;  // skip corrupted demos
      const matchSearch =
        !q ||
        (d.trackName || "").toLowerCase().includes(q) ||
        (d.notes || "").toLowerCase().includes(q) ||
        (Array.isArray(d.artists) && d.artists.some(a => (a || "").toLowerCase().includes(q)));
      const matchStatus = statusFilter === "all" || d.status === statusFilter;
      const matchRelease =
        releaseFilter === "all" ? true :
        releaseFilter === "singles" ? !d.parentReleaseId :
        releaseFilter === "ep" ? !!d.parentReleaseId : true;
      return matchSearch && matchStatus && matchRelease;
    });
  }, [demos, search, statusFilter, releaseFilter]);

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
    setFormArtists([]);
    setFormArtistInput("");
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
    // Reset pitch state too — otherwise the previous demo's edited pitch
    // would leak into a brand-new "Aggiungi Demo" session.
    setPitchTone("professional");
    setPitchLanguage("en");
    setPitchNote("");
    setPitchEditedText(null);
    setPitchCopied(false);
  };

  const openAdd = () => {
    resetForm();
    // Pre-seed artists with the user's own artistName so they don't have to
    // type it every time. If userProfile.artistName is empty, leave empty
    // (the user will type it manually).
    if (userProfile.artistName?.trim()) {
      setFormArtists([userProfile.artistName.trim()]);
    }
    setEditingDemo(null);
    setShowAddDialog(true);
  };

  const openEdit = (demo: Demo) => {
    setFormTrackName(demo.trackName);
    setFormArtists(
      Array.isArray(demo.artists) && demo.artists.length > 0
        ? demo.artists
        : (demo.artistName ? [demo.artistName] : [])
    );
    setFormArtistInput("");
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
    // Reset pitch editor state — when editing an existing demo that already
    // has a saved pitchText, the textarea will pre-fill from demo.pitchText
    // via the displayPitchText fallback chain (no need to seed pitchEditedText).
    setPitchTone("professional");
    setPitchLanguage("en");
    setPitchNote("");
    setPitchEditedText(null);
    setPitchCopied(false);
    setEditingDemo(demo);
    setShowAddDialog(true);
  };

  const handleSave = () => {
    // Only trackName is required. labelId may be empty when the user wants
    // to save a demo for sending to multiple labels later (no specific target yet).
    if (!formTrackName.trim()) return;
    // Compute the pitch text to persist — same fallback chain as the
    // textarea: user edits > existing demo's pitchText > freshly generated.
    const primaryArtist = formArtists[0] || editingDemo?.artistName || userProfile.artistName || "";
    const pitchToSave =
      pitchEditedText
      ?? editingDemo?.pitchText
      ?? (formLabelId && formTrackName.trim()
          ? generatePitch(
              labels.find((l) => l.id === formLabelId)?.name || "",
              formTrackName.trim(),
              primaryArtist,
              formLink.trim() || userProfile.scLink || "",
              pitchTone,
              pitchNote,
              labels.find((l) => l.id === formLabelId)?.emails || [],
              labels.find((l) => l.id === formLabelId)?.submissionType || "email",
              pitchLanguage
            )
          : "");
    const data = {
      trackName: (formTrackName || "").trim(),
      artists: formArtists.length > 0 ? formArtists : (primaryArtist ? [primaryArtist] : []),
      labelId: formLabelId || "",
      status: formStatus,
      sentDate: formSentDate || null,
      link: (formLink || "").trim(),
      links: formLinks.filter(l => (l.value || "").trim()),
      notes: (formNotes || "").trim(),
      pitchText: pitchToSave,
      artistName: primaryArtist,
      genre: (formGenre || "").trim(),
      bpm: (formBpm || "").trim(),
      key: (formKey || "").trim(),
      analysis: formAnalysis || undefined,
    };
    if (editingDemo) { updateDemo(editingDemo.id, data); }
    else { addDemo(data); }
    setShowAddDialog(false);
    resetForm();
  };

  // ---------- EP dialog handlers ----------
  const openAddEp = () => {
    setEpTitle("");
    setEpArtists(userProfile.artistName?.trim() ? [userProfile.artistName.trim()] : []);
    setEpArtistInput("");
    setEpGenre("");
    setEpNotes("");
    setEpSoundCloudUrl("");
    setEpSelectedTrackIds(new Set());
    setEditingReleaseId(null);
    setShowEpDialog(true);
  };

  const openEditEp = (release: Release) => {
    setEpTitle(release.title);
    setEpArtists(release.artists || []);
    setEpArtistInput("");
    setEpGenre(release.genre || "");
    setEpNotes(release.notes || "");
    setEpSoundCloudUrl(release.epSoundCloudUrl || "");
    setEpSelectedTrackIds(new Set(release.trackIds || []));
    setEditingReleaseId(release.id);
    setShowEpDialog(true);
  };

  const handleSaveEp = () => {
    if (!epTitle.trim()) {
      toast({
        title: locale === "it" ? "Titolo obbligatorio" : "Title required",
        description: locale === "it" ? "Inserisci un titolo per l'EP." : "Enter a title for the EP.",
        variant: "destructive",
      });
      return;
    }
    if (epSelectedTrackIds.size < 2) {
      toast({
        title: locale === "it" ? "Servono almeno 2 tracce" : "At least 2 tracks required",
        description: locale === "it"
          ? "Un EP deve contenere almeno 2 tracce. Seleziona altre demo dal database."
          : "An EP must contain at least 2 tracks. Select more demos from your database.",
        variant: "destructive",
      });
      return;
    }
    const trackIds = Array.from(epSelectedTrackIds);
    const releaseData = {
      type: "ep" as const,
      title: epTitle.trim(),
      artists: epArtists.length > 0 ? epArtists : (userProfile.artistName?.trim() ? [userProfile.artistName.trim()] : []),
      trackIds,
      genre: epGenre.trim(),
      notes: epNotes.trim(),
      epSoundCloudUrl: epSoundCloudUrl.trim(),
    };
    if (editingReleaseId) {
      // Update existing release: first detach all demos that were previously
      // attached but are no longer in the new trackIds list, then attach the
      // new ones, then update the release itself.
      const prevRelease = releases.find(r => r.id === editingReleaseId);
      const prevTrackIds = new Set(prevRelease?.trackIds || []);
      for (const oldId of Array.from(prevTrackIds)) {
        if (!epSelectedTrackIds.has(oldId)) {
          updateDemo(oldId, { parentReleaseId: null });
        }
      }
      for (const newId of trackIds) {
        updateDemo(newId, { parentReleaseId: editingReleaseId });
      }
      updateRelease(editingReleaseId, releaseData);
    } else {
      const newId = addRelease(releaseData);
      for (const tid of trackIds) {
        updateDemo(tid, { parentReleaseId: newId });
      }
    }
    setShowEpDialog(false);
    toast({
      title: editingReleaseId
        ? (locale === "it" ? "EP aggiornato" : "EP updated")
        : (locale === "it" ? "EP creato" : "EP created"),
      description: locale === "it"
        ? `"${epTitle.trim()}" con ${trackIds.length} tracce.`
        : `"${epTitle.trim()}" with ${trackIds.length} tracks.`,
    });
  };

  const handleDeleteEp = (releaseId: string) => {
    const r = releases.find(rel => rel.id === releaseId);
    if (!r) return;
    if (!confirm(
      locale === "it"
        ? `Eliminare l'EP "${r.title}"? Le tracce non verranno eliminate, solo scollegate dall'EP.`
        : `Delete EP "${r.title}"? Tracks won't be deleted, only detached from the EP.`
    )) return;
    deleteRelease(releaseId);
    toast({
      title: locale === "it" ? "EP eliminato" : "EP deleted",
      description: locale === "it"
        ? `"${r.title}" scollegato. Le tracce restano nel tuo archivio.`
        : `"${r.title}" detached. Tracks remain in your archive.`,
    });
  };

  const toggleEpTrack = (demoId: string) => {
    setEpSelectedTrackIds(prev => {
      const next = new Set(prev);
      if (next.has(demoId)) next.delete(demoId);
      else next.add(demoId);
      return next;
    });
  };
  // ---------- end EP dialog handlers ----------

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

  // Clone a demo for sending to a different label. Creates a new demo with
  // the same trackName, link, audio analysis, BPM, key, genre — but with an
  // empty labelId and status="ready" so the user picks a new target and
  // drafts a new pitch. This is the "riuso la stessa demo per altra label"
  // workflow the user asked for.
  const handleCloneDemo = useCallback((demo: Demo) => {
    addDemo({
      trackName: demo.trackName,
      labelId: "", // new target — user picks via the label combobox
      status: "ready",
      sentDate: null,
      link: demo.link,
      links: demo.links || [],
      notes: demo.notes,
      pitchText: "", // fresh pitch for the new label
      artistName: demo.artistName || userProfile.artistName || "",
      genre: demo.genre || "",
      bpm: demo.bpm || "",
      key: demo.key || "",
      analysis: demo.analysis,
      // No reply status — fresh demo
      replyStatus: "none",
      replyText: undefined,
      replyDate: null,
      replySender: undefined,
      followUpDueDate: null,
    });
    toast({ title: locale === "it" ? "Demo clonata" : "Demo cloned", description: locale === "it" ? "Nuova demo creata in 'Pronta per Invio' — scegli una nuova label target" : "New demo created in 'Ready to Send' — pick a new target label" });
  }, [addDemo, userProfile.artistName, locale, toast]);

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
                  onClick={() => handleOpenDetail(demo)}
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
                              <Calendar className="h-3 w-3" /> {formatDemoDate(demo.sentDate, locale)}
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
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); handleOpenDetail(demo); }} title={t(locale, "demos.viewDetail")}>
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
        <DemoDetailDialog demo={detailDemo} onClose={() => setDetailDemoId(null)} locale={locale} getLabelName={getLabelName} labels={labels} updateDemo={updateDemo} userProfile={userProfile} gmailAuth={gmailAuth} setGmailAuth={setGmailAuth} demos={demos} releases={releases} />
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
        <Button
          variant="outline"
          size="sm"
          onClick={handleScanReplies}
          disabled={scanningReplies || !gmailAuth.isConnected}
          className="shrink-0 relative"
          title={gmailAuth.isConnected ? "Scansiona Gmail per risposte delle label" : "Connetti Gmail prima di scansionare"}
        >
          {scanningReplies ? (
            <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Inbox className="h-4 w-4 mr-1.5" />
          )}
          <span className="text-xs">
            {scanningReplies
              ? "Scansione..."
              : gmailAuth.isConnected
                ? "Scansiona risposte"
                : "Gmail offline"}
          </span>
          {gmailAuth.isConnected && newRepliesCount > 0 && !scanningReplies && (
            <span className="ml-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-cyan-500 text-white text-[10px] font-bold flex items-center justify-center">
              {newRepliesCount > 9 ? "9+" : newRepliesCount}
            </span>
          )}
        </Button>
        <Button onClick={openAdd} className="glow-purple shrink-0">
          <Plus className="h-4 w-4 mr-1.5" />
          {t(locale, "demos.addDemo")}
        </Button>
        <Button onClick={openAddEp} variant="outline" className="shrink-0 border-primary/30 text-primary hover:bg-primary/10">
          <Disc3 className="h-4 w-4 mr-1.5" />
          {locale === "it" ? "Crea EP" : "Create EP"}
        </Button>
      </div>

      {/* Release filter tabs + existing EP list */}
      {(releases.length > 0 || releaseFilter !== "all") && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-md bg-secondary/50 p-0.5 border border-border/50">
            {(["all", "singles", "ep"] as const).map((tab) => {
              const count =
                tab === "all" ? demos.length :
                tab === "singles" ? demos.filter(d => !d.parentReleaseId).length :
                demos.filter(d => !!d.parentReleaseId).length;
              const label =
                tab === "all" ? (locale === "it" ? "Tutte" : "All") :
                tab === "singles" ? (locale === "it" ? "Singoli" : "Singles") :
                (locale === "it" ? "EP" : "EPs");
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setReleaseFilter(tab)}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                    releaseFilter === tab
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                >
                  {label}
                  <span className="ml-1.5 text-[9px] opacity-70">{count}</span>
                </button>
              );
            })}
          </div>
          {releases.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {releases.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => openEditEp(r)}
                  title={locale === "it" ? "Modifica EP" : "Edit EP"}
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 hover:bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary"
                >
                  <Disc3 className="h-3 w-3" />
                  {r.title}
                  <span className="text-[9px] opacity-70">{r.trackIds.length}tracce</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

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
                      className={`bg-card/80 border-border/30 hover:border-primary/20 transition-all group cursor-pointer ${isOverdue ? "ring-1 ring-amber-500/40" : ""} ${demo.gmailUnreadResponse ? "ring-2 ring-emerald-500/55" : ""}`}
                      onClick={() => handleOpenDetail(demo)}
                    >
                      <CardContent className="p-3 space-y-1.5">
                        <div className="flex items-start justify-between gap-1">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h4 className="text-sm font-semibold text-foreground leading-tight">{demo.trackName}</h4>
                              {demo.gmailUnreadResponse && (
                                <div className="flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/35 rounded px-1.5 py-0.5 animate-pulse shrink-0">
                                  <span className="relative flex h-1.5 w-1.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                                  </span>
                                  <span className="text-[8px] font-extrabold text-emerald-400 uppercase tracking-wider">
                                    {locale === "it" ? "Risposta!" : "Reply!"}
                                  </span>
                                </div>
                              )}
                              {demo.parentReleaseId && (() => {
                                const r = releases.find(rel => rel.id === demo.parentReleaseId);
                                if (!r) return null;
                                return (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); openEditEp(r); }}
                                    className="inline-flex items-center gap-0.5 text-[9px] font-medium text-primary border border-primary/30 bg-primary/5 hover:bg-primary/10 rounded-full px-1.5 py-0.5"
                                    title={locale === "it" ? `Fa parte dell'EP: ${r.title} — clic per modificare` : `Part of EP: ${r.title} — click to edit`}
                                  >
                                    <Disc3 className="h-2.5 w-2.5" />
                                    {r.title}
                                  </button>
                                );
                              })()}
                            </div>
                            {/* Artists line — primary + collaborators */}
                            {(() => {
                              const dArtists = demo.artists && demo.artists.length > 0
                                ? demo.artists
                                : (demo.artistName ? [demo.artistName] : []);
                              if (dArtists.length === 0) return null;
                              return (
                                <p className="text-[10px] text-muted-foreground/80 mt-0.5 leading-tight truncate">
                                  {dArtists.map((a, i) => (
                                    <span key={i}>
                                      {i === 0 ? null : <span className="text-muted-foreground/50 mx-0.5">×</span>}
                                      <span className={i === 0 ? "font-medium text-foreground/80" : ""}>{a}</span>
                                    </span>
                                  ))}
                                  {dArtists.length > 1 && (
                                    <span className="ml-1 text-[9px] text-primary/60 uppercase tracking-wide">
                                      {locale === "it" ? "collab" : "collab"}
                                    </span>
                                  )}
                                </p>
                              );
                            })()}
                          </div>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); handleOpenDetail(demo); }} title={t(locale, "demos.viewDetail")}>
                              <Eye className="h-3 w-3" />
                            </Button>
                            {canAdvance(demo.status) && (
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); advanceDemoStatus(demo.id); }} title={t(locale, "demos.advance")}>
                                <ChevronRight className="h-3 w-3" />
                              </Button>
                            )}
                            {/* Clone button — visible only on sent/post-sent demos.
                                Lets the user reuse the same track for a different label. */}
                            {demo.status !== "ready" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={(e) => { e.stopPropagation(); handleCloneDemo(demo); }}
                                title={locale === "it" ? "Clona per altra label" : "Clone for another label"}
                              >
                                <CopyIcon className="h-3 w-3" />
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

                        {/* EP tracks & granular status display */}
                        {demo.pitchTracks && demo.pitchTracks.length >= 2 && (
                          <div className="flex flex-col gap-1.5 mt-2 mb-1 border-t border-border/10 pt-2 bg-secondary/10 rounded-md p-1.5 border border-border/5">
                            {demo.pitchTracks.map((tr, idx) => {
                              if (!tr) return null;
                              const trStatus = tr.status || "awaiting";
                              const trCfg = TRACK_STATUS_CONFIG[trStatus] || TRACK_STATUS_CONFIG.awaiting;
                              return (
                                <div key={idx} className="flex items-center justify-between text-[10px] gap-1.5">
                                  <span className="text-muted-foreground truncate max-w-[125px] font-medium" title={tr.trackName}>
                                    {idx + 1}. {tr.trackName}
                                  </span>
                                  <span className={`px-1 py-0.2 rounded font-semibold text-[8px] tracking-tight shrink-0 ${trCfg.bgColor} ${trCfg.color} border ${trCfg.borderColor}`}>
                                    {locale === "it" ? trCfg.labelIt : trCfg.labelEn}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {demo.sentDate && (
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span>{formatDemoDate(demo.sentDate, locale)}{daysSince !== null && <span className={isOverdue ? "text-amber-400 font-semibold ml-1" : "ml-1"}>({daysSince}{t(locale, "dash.daysAgo")})</span>}</span>
                          </div>
                        )}
                        {demo.pitchText && (
                          <div className="flex items-center gap-1 text-[10px] text-primary/50">
                            <FileText className="h-2.5 w-2.5" /> {t(locale, "demos.hasPitch")}
                          </div>
                        )}
                        {/* Reply badge — shows whether the label has replied.
                            'ack' = automatic confirmation, 'info' = asked for more,
                            'positive' / 'rejected' = final decision. */}
                        {(() => {
                          const reply = getReplyStatus(demo);
                          if (reply === "none") return null;
                          const cfg = REPLY_STATUS_CONFIG[reply];
                          return (
                            <div className={`flex items-center gap-1 text-[10px] ${cfg.color} font-medium`}>
                              <MessageSquare className="h-2.5 w-2.5" />
                              <span>{locale === "it" ? cfg.labelIt : cfg.labelEn}</span>
                              {demo.replyDate && (
                                <span className="text-muted-foreground/60 ml-0.5">· {formatDemoDate(demo.replyDate, locale)}</span>
                              )}
                            </div>
                          );
                        })()}
                        {/* Follow-up suggestion — if no reply (or only ACK) and
                            28 days have passed since sentDate, show a nudge. */}
                        {(() => {
                          const fu = getFollowUpStatus(demo);
                          if (!fu.isDue) return null;
                          return (
                            <div className="flex items-center gap-1 text-[10px] text-amber-400 font-medium">
                              <AlertTriangle className="h-2.5 w-2.5" />
                              <span>
                                {locale === "it"
                                  ? `Follow-up suggerito (${fu.daysOverdue}gg fa)`
                                  : `Follow-up suggested (${fu.daysOverdue}d ago)`}
                              </span>
                            </div>
                          );
                        })()}
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
                      className={`hover:bg-secondary/20 transition-colors cursor-pointer ${demo.gmailUnreadResponse ? "bg-emerald-500/5 hover:bg-emerald-500/10" : ""}`}
                      onClick={() => handleOpenDetail(demo)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="font-semibold text-foreground">{demo.trackName}</div>
                          {demo.gmailUnreadResponse && (
                            <div className="flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/35 rounded px-1.5 py-0.5 animate-pulse">
                              <span className="relative flex h-1.5 w-1.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                              </span>
                              <span className="text-[8px] font-extrabold text-emerald-400 uppercase tracking-wider">
                                {locale === "it" ? "Risposta!" : "Reply!"}
                              </span>
                            </div>
                          )}
                        </div>
                        {demo.artistName && <div className="text-[10px] text-muted-foreground/60 mt-0.5">{demo.artistName}</div>}
                        
                        {/* EP tracks display in table */}
                        {demo.pitchTracks && demo.pitchTracks.length >= 2 && (
                          <div className="flex flex-wrap gap-1.5 mt-2 max-w-md">
                            {demo.pitchTracks.map((tr, idx) => {
                              const trStatus = tr.status || "awaiting";
                              const trCfg = TRACK_STATUS_CONFIG[trStatus] || TRACK_STATUS_CONFIG.awaiting;
                              return (
                                <span key={idx} className={`inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-md border ${trCfg.bgColor} ${trCfg.color} ${trCfg.borderColor}`}>
                                  <span className="text-[8px] text-muted-foreground font-mono">{idx + 1}.</span>
                                  <span className="font-semibold">{tr.trackName}</span>
                                  <span className="text-[7px] uppercase opacity-75">({locale === "it" ? trCfg.labelIt : trCfg.labelEn})</span>
                                </span>
                              );
                            })}
                          </div>
                        )}
                        {demo.notes && <div className="text-[11px] text-muted-foreground/60 mt-1 line-clamp-1">{demo.notes}</div>}
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
                      <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{formatDemoDate(demo.sentDate, locale)}</td>
                      <td className="px-4 py-3 text-xs font-mono">
                        {daysSince !== null ? (
                          <span className={isOverdue ? "text-amber-400 font-semibold" : "text-muted-foreground"}>
                            {daysSince}{t(locale, "dash.daysAgo")}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); handleOpenDetail(demo); }} title={t(locale, "demos.viewDetail")}>
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
      <DemoDetailDialog demo={detailDemo} onClose={() => setDetailDemoId(null)} locale={locale} getLabelName={getLabelName} labels={labels} updateDemo={updateDemo} userProfile={userProfile} gmailAuth={gmailAuth} setGmailAuth={setGmailAuth} demos={demos} releases={releases} />

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-2xl bg-card border-border/50 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              {editingDemo ? t(locale, "demos.editDemo") : t(locale, "demos.addDemo")}
              {/* Lock badge — shown when the demo is locked (status !== ready).
                  Explains why some fields are read-only. */}
              {isDemoLocked(editingDemo) && (
                <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-5 border-amber-500/40 text-amber-400">
                  <Lock className="h-2.5 w-2.5 mr-1" />
                  {locale === "it" ? "Inviata — campi bloccati" : "Sent — fields locked"}
                </Badge>
              )}
            </DialogTitle>
            {isDemoLocked(editingDemo) && (
              <p className="text-[11px] text-muted-foreground/80 mt-1 leading-snug">
                {locale === "it"
                  ? "Una demo inviata non può modificare label, traccia o link — usano \"Clona per altra label\" per inviarla a una label diversa. Puoi ancora modificare note, pitch, stato e registrare risposte."
                  : "A sent demo can't change label, track, or link — use \"Clone for another label\" to send it elsewhere. You can still edit notes, pitch, status, and register replies."}
              </p>
            )}
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <UILabel className="text-xs font-mono uppercase text-muted-foreground">
                {t(locale, "demos.trackName")}
                {isDemoLocked(editingDemo) && <Lock className="inline-block h-3 w-3 ml-1 text-muted-foreground/50" />}
              </UILabel>
              <Input
                value={formTrackName}
                onChange={(e) => setFormTrackName(e.target.value)}
                placeholder="e.g. Midnight Drive"
                className="bg-secondary/50"
                disabled={isDemoLocked(editingDemo)}
              />
            </div>

            {/* Artists — tag input.
                First tag is the primary producer (auto-filled from userProfile.artistName
                when adding a new demo). Additional tags are collaborators.
                Press Enter or comma to add; click × on a tag to remove. */}
            <div className="space-y-1.5">
              <UILabel className="text-xs font-mono uppercase text-muted-foreground">
                {locale === "it" ? "Artisti" : "Artists"}
                <span className="ml-1 text-[10px] text-muted-foreground/60 normal-case font-sans">
                  {locale === "it"
                    ? "(tu + collaboratori, premere Invio per aggiungere)"
                    : "(you + collaborators, press Enter to add)"}
                </span>
              </UILabel>
              <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-secondary/50 px-2 py-1.5 min-h-[40px] focus-within:ring-1 focus-within:ring-ring">
                {formArtists.map((artist, idx) => (
                  <span
                    key={`${artist}-${idx}`}
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      idx === 0
                        ? "bg-primary/15 text-primary border border-primary/30"
                        : "bg-secondary text-foreground border border-border"
                    }`}
                  >
                    {idx === 0 && (
                      <span className="text-[9px] uppercase tracking-wide text-primary/70" title={locale === "it" ? "Primario (te)" : "Primary (you)"}>
                        {locale === "it" ? "tu" : "you"}
                      </span>
                    )}
                    {artist}
                    <button
                      type="button"
                      onClick={() => setFormArtists(formArtists.filter((_, i) => i !== idx))}
                      className="text-muted-foreground hover:text-destructive ml-0.5"
                      aria-label={locale === "it" ? "Rimuovi artista" : "Remove artist"}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  value={formArtistInput}
                  onChange={(e) => setFormArtistInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      const v = formArtistInput.trim();
                      if (v && !formArtists.includes(v)) {
                        setFormArtists([...formArtists, v]);
                      }
                      setFormArtistInput("");
                    } else if (e.key === "Backspace" && formArtistInput === "" && formArtists.length > 0) {
                      // Backspace on empty input removes the last artist
                      setFormArtists(formArtists.slice(0, -1));
                    }
                  }}
                  onBlur={() => {
                    // Add on blur if there's pending text
                    const v = formArtistInput.trim();
                    if (v && !formArtists.includes(v)) {
                      setFormArtists([...formArtists, v]);
                    }
                    setFormArtistInput("");
                  }}
                  placeholder={formArtists.length === 0
                    ? (locale === "it" ? "Inserisci il tuo nome d'arte…" : "Enter your artist name…")
                    : (locale === "it" ? "+ collaboratore" : "+ collaborator")}
                  className="flex-1 min-w-[140px] bg-transparent text-[12px] outline-none placeholder:text-muted-foreground/50"
                />
              </div>
              {formArtists.length > 1 && (
                <p className="text-[10px] text-muted-foreground/60 leading-tight">
                  {locale === "it"
                    ? `Collaborazione: ${formArtists.join(" × ")}`
                    : `Collaboration: ${formArtists.join(" × ")}`}
                </p>
              )}
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
                      disabled={isDemoLocked(editingDemo)}
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
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder={locale === "it" ? "Cerca label per nome o genere…" : "Search label by name or genre…"}
                        value={labelSearchQuery}
                        onValueChange={setLabelSearchQuery}
                      />
                      <CommandList>
                        {(() => {
                          // Pre-filter the labels array here instead of relying
                          // on cmdk's filter function. The filter prop captures
                          // a closure over `labels` at first render — but Zustand
                          // hasn't hydrated yet at first render, so the closure
                          // is empty and the filter always returns 0.
                          const q = labelSearchQuery.toLowerCase().trim();
                          const filtered = labels
                            .filter((l) => {
                              if (!l || !l.name) return false;
                              if (!q) return true;
                              // Match by name (case-insensitive)
                              if ((l.name || "").toLowerCase().includes(q)) return true;
                              // Match by genre
                              if ((l.genres || []).some((g) => (g || "").toLowerCase().includes(q))) return true;
                              return false;
                            })
                            .sort((a, b) => {
                              // Open labels first, then alphabetical
                              if (a.status === "open" && b.status !== "open") return -1;
                              if (a.status !== "open" && b.status === "open") return 1;
                              // When searching, sort by startsWith first
                              if (q) {
                                const aStarts = (a.name || "").toLowerCase().startsWith(q) ? 0 : 1;
                                const bStarts = (b.name || "").toLowerCase().startsWith(q) ? 0 : 1;
                                if (aStarts !== bStarts) return aStarts - bStarts;
                              }
                              return (a.name || "").localeCompare(b.name || "");
                            })
                            .slice(0, 250);

                          if (filtered.length === 0) {
                            return (
                              <CommandEmpty>
                                {locale === "it" ? "Nessuna label trovata." : "No label found."}
                              </CommandEmpty>
                            );
                          }

                          return (
                            <CommandGroup heading={locale === "it"
                              ? `${filtered.length} label${filtered.length === labels.length ? "" : ` di ${labels.length}`}`
                              : `${filtered.length} label${filtered.length === labels.length ? "" : ` of ${labels.length}`}`}>
                              {filtered.map((l) => (
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
                          );
                        })()}
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
              <UILabel className="text-xs font-mono uppercase text-muted-foreground">
                {t(locale, "demos.scLink")}
                {isDemoLocked(editingDemo) && <Lock className="inline-block h-3 w-3 ml-1 text-muted-foreground/50" />}
              </UILabel>
              <Input
                value={formLink}
                onChange={(e) => setFormLink(e.target.value)}
                placeholder="https://soundcloud.com/..."
                className="bg-secondary/50"
                disabled={isDemoLocked(editingDemo)}
              />
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
                      {formAnalysis.key.confidence === 0 ? (
                        <p className="text-[10px] font-mono font-semibold text-muted-foreground italic leading-tight pt-0.5">
                          N/A
                        </p>
                      ) : (
                        <p className="text-sm font-mono font-semibold text-primary">{formAnalysis.key.camelot}</p>
                      )}
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
                    <span>
                      {formAnalysis.key.confidence === 0
                        ? <span className="italic text-amber-600 dark:text-amber-400">⚠ Key non disponibile (modalità fallback — ricarica la pagina e riprova)</span>
                        : formAnalysis.key.name}
                    </span>
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

            {/* ===================== PITCH / EMAIL SECTION ===================== */}
            {/* Shows up ONLY when a target label is selected — that's when the
                precompiled email makes sense. Lets the user pick a tone
                (template), preview the precompiled email, edit it inline,
                copy it, or open it in Gmail / their email client. The edited
                text is saved to the demo when the user clicks Salva. */}
            {formLabelId && formLabelObj && formTrackName.trim() && (
              <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-[10px] text-foreground uppercase tracking-wider font-medium">
                    {locale === "it" ? "Email di Pitch (precompilata)" : "Pitch Email (precompiled)"}
                  </span>
                  {formLabelObj.emails?.length ? (
                    <Badge variant="outline" className="text-[9px] py-0 px-1.5 h-4 border-emerald-500/40 text-emerald-400">
                      {formLabelObj.emails.length} email{formLabelObj.emails.length > 1 ? "s" : ""}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[9px] py-0 px-1.5 h-4 border-amber-500/40 text-amber-400">
                      {locale === "it" ? "nessuna email" : "no email"}
                    </Badge>
                  )}
                  {pitchEditedText !== null && (
                    <Badge variant="outline" className="text-[9px] py-0 px-1.5 h-4 border-amber-500/40 text-amber-500">
                      {t(locale, "pitch.edited")}
                    </Badge>
                  )}
                  {editingDemo?.pitchText && pitchEditedText === null && (
                    <Badge variant="outline" className="text-[9px] py-0 px-1.5 h-4 border-primary/30 text-primary">
                      {locale === "it" ? "Salvato" : "Saved"}
                    </Badge>
                  )}
                </div>

                {/* Tone (template) + Language selectors */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <UILabel className="text-[10px] font-mono uppercase text-muted-foreground flex items-center gap-1">
                      <Mail className="h-3 w-3" /> {t(locale, "pitch.tone")}
                      <span className="ml-1 text-[9px] text-muted-foreground/60 normal-case font-sans">
                        ({locale === "it" ? "modello precompilato" : "template"})
                      </span>
                    </UILabel>
                    <Select value={pitchTone} onValueChange={(v) => setPitchTone(v as PitchTone)}>
                      <SelectTrigger className="bg-secondary/50 text-sm h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="professional">{t(locale, "pitch.toneProfessional")}</SelectItem>
                        <SelectItem value="confident">{t(locale, "pitch.toneConfident")}</SelectItem>
                        <SelectItem value="friendly">{t(locale, "pitch.toneFriendly")}</SelectItem>
                        <SelectItem value="storytelling">{t(locale, "pitch.toneStorytelling")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <UILabel className="text-[10px] font-mono uppercase text-muted-foreground flex items-center gap-1">
                      <Languages className="h-3 w-3" /> {t(locale, "pitch.emailLanguage")}
                    </UILabel>
                    <Select value={pitchLanguage} onValueChange={(v) => setPitchLanguage(v as PitchLanguage)}>
                      <SelectTrigger className="bg-secondary/50 text-sm h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(PITCH_LANGUAGES) as PitchLanguage[]).map((lang) => (
                          <SelectItem key={lang} value={lang}>{PITCH_LANGUAGES[lang]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Additional note (optional) */}
                <div className="space-y-1.5">
                  <UILabel className="text-[10px] font-mono uppercase text-muted-foreground">{t(locale, "pitch.additionalNote")}</UILabel>
                  <Input
                    value={pitchNote}
                    onChange={(e) => setPitchNote(e.target.value)}
                    placeholder={locale === "it" ? "Es. mix esclusivo, release imminente, ecc. (opzionale)" : "E.g. exclusive mix, upcoming release, etc. (optional)"}
                    className="bg-secondary/50 text-sm h-8"
                  />
                </div>

                {/* Pitch preview — editable textarea */}
                {displayPitchText && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        {t(locale, "pitch.preview")}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {pitchEditedText !== null && (
                          <Button
                            onClick={() => setPitchEditedText(null)}
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-muted-foreground hover:text-foreground"
                            title={t(locale, "pitch.resetToSuggested")}
                          >
                            <RotateCcw className="h-3 w-3 mr-1" />
                            {t(locale, "pitch.resetToSuggested")}
                          </Button>
                        )}
                        <Button onClick={handleFormPitchCopy} size="sm" className="h-7 text-xs border-border/50" variant="outline">
                          {pitchCopied ? <><Check className="h-3 w-3 mr-1" />{t(locale, "pitch.copied")}</> : <><Copy className="h-3 w-3 mr-1" />{t(locale, "pitch.copyToClipboard")}</>}
                        </Button>
                      </div>
                    </div>
                    <Card className="bg-card/80 border-border/30">
                      <CardContent className="p-3">
                        <textarea
                          value={displayPitchText}
                          onChange={(e) => setPitchEditedText(e.target.value)}
                          spellCheck={false}
                          className="w-full text-[11px] leading-relaxed font-mono text-foreground/80 bg-transparent resize-y min-h-[200px] max-h-[360px] outline-none border-0 focus:ring-0 p-0"
                          aria-label={t(locale, "pitch.preview")}
                        />
                      </CardContent>
                    </Card>

                    {/* Action buttons — open in Gmail (web) + open in email client (mailto:) */}
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Button
                        onClick={() => window.open(formGmailLink, "_blank")}
                        className="flex-1 text-sm glow-purple"
                      >
                        <MailOpen className="h-3.5 w-3.5 mr-1.5" />
                        {formLabelObj.emails?.length ? t(locale, "pitch.openGmail") : t(locale, "pitch.openGmailNoEmail")}
                      </Button>
                      {formLabelObj.emails?.length > 0 && formMailtoLink && (
                        <Button
                          onClick={() => window.open(formMailtoLink, "_blank")}
                          variant="outline"
                          className="flex-1 text-sm border-primary/20"
                        >
                          <Send className="h-3.5 w-3.5 mr-1.5" />
                          {t(locale, "pitch.openEmailClient")}
                        </Button>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground/70 leading-tight">
                      {locale === "it"
                        ? "💡 Il testo verrà salvato insieme alla demo. Per l'invio diretto via Gmail API, apri la demo dopo aver salvato."
                        : "💡 The text will be saved with the demo. For direct send via Gmail API, open the demo after saving."}
                    </p>
                  </div>
                )}
              </div>
            )}
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

      {/* Create/Edit EP Dialog */}
      <Dialog open={showEpDialog} onOpenChange={setShowEpDialog}>
        <DialogContent className="sm:max-w-2xl bg-card border-border/50 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Disc3 className="h-4 w-4 text-primary" />
              {editingReleaseId
                ? (locale === "it" ? "Modifica EP" : "Edit EP")
                : (locale === "it" ? "Crea EP" : "Create EP")}
            </DialogTitle>
            <p className="text-[11px] text-muted-foreground/80 leading-snug">
              {locale === "it"
                ? "Raggruppa 2 o più tracce già salvate nel tuo archivio per inviarle insieme come EP a una label. Le tracce restano disponibili anche singolarmente."
                : "Group 2+ tracks from your archive to send together as an EP to a label. Tracks remain available individually too."}
            </p>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* EP title */}
            <div className="space-y-1.5">
              <UILabel className="text-xs font-mono uppercase text-muted-foreground">
                {locale === "it" ? "Titolo EP" : "EP title"}
              </UILabel>
              <Input
                value={epTitle}
                onChange={(e) => setEpTitle(e.target.value)}
                placeholder={locale === "it" ? "es. Night Shift EP" : "e.g. Night Shift EP"}
                className="bg-secondary/50"
              />
            </div>

            {/* EP artists — same tag input as the demo form */}
            <div className="space-y-1.5">
              <UILabel className="text-xs font-mono uppercase text-muted-foreground">
                {locale === "it" ? "Artisti" : "Artists"}
                <span className="ml-1 text-[10px] text-muted-foreground/60 normal-case font-sans">
                  {locale === "it"
                    ? "(tu + collaboratori, premere Invio)"
                    : "(you + collaborators, press Enter)"}
                </span>
              </UILabel>
              <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-secondary/50 px-2 py-1.5 min-h-[40px] focus-within:ring-1 focus-within:ring-ring">
                {epArtists.map((artist, idx) => (
                  <span
                    key={`ep-${artist}-${idx}`}
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      idx === 0
                        ? "bg-primary/15 text-primary border border-primary/30"
                        : "bg-secondary text-foreground border border-border"
                    }`}
                  >
                    {idx === 0 && (
                      <span className="text-[9px] uppercase tracking-wide text-primary/70">
                        {locale === "it" ? "tu" : "you"}
                      </span>
                    )}
                    {artist}
                    <button
                      type="button"
                      onClick={() => setEpArtists(epArtists.filter((_, i) => i !== idx))}
                      className="text-muted-foreground hover:text-destructive ml-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  value={epArtistInput}
                  onChange={(e) => setEpArtistInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      const v = epArtistInput.trim();
                      if (v && !epArtists.includes(v)) {
                        setEpArtists([...epArtists, v]);
                      }
                      setEpArtistInput("");
                    } else if (e.key === "Backspace" && epArtistInput === "" && epArtists.length > 0) {
                      setEpArtists(epArtists.slice(0, -1));
                    }
                  }}
                  onBlur={() => {
                    const v = epArtistInput.trim();
                    if (v && !epArtists.includes(v)) setEpArtists([...epArtists, v]);
                    setEpArtistInput("");
                  }}
                  placeholder={epArtists.length === 0
                    ? (locale === "it" ? "Inserisci il tuo nome d'arte…" : "Enter your artist name…")
                    : (locale === "it" ? "+ collaboratore" : "+ collaborator")}
                  className="flex-1 min-w-[140px] bg-transparent text-[12px] outline-none placeholder:text-muted-foreground/50"
                />
              </div>
            </div>

            {/* EP genre */}
            <div className="space-y-1.5">
              <UILabel className="text-xs font-mono uppercase text-muted-foreground">
                {locale === "it" ? "Genere EP" : "EP genre"}
                <span className="ml-1 text-[10px] text-muted-foreground/60 normal-case font-sans">
                  ({locale === "it" ? "opzionale" : "optional"})
                </span>
              </UILabel>
              <Input
                value={epGenre}
                onChange={(e) => setEpGenre(e.target.value)}
                placeholder={locale === "it" ? "es. Melodic House & Techno" : "e.g. Melodic House & Techno"}
                className="bg-secondary/50"
              />
            </div>

            {/* Track selection from existing demos */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <UILabel className="text-xs font-mono uppercase text-muted-foreground">
                  {locale === "it" ? "Tracce dell'EP" : "EP tracks"}
                  <span className="ml-1 text-[10px] text-muted-foreground/60 normal-case font-sans">
                    {locale === "it"
                      ? `(selezionate ${epSelectedTrackIds.size} / min 2)`
                      : `(${epSelectedTrackIds.size} selected / min 2)`}
                  </span>
                </UILabel>
                {epSelectedTrackIds.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setEpSelectedTrackIds(new Set())}
                    className="text-[10px] text-muted-foreground hover:text-destructive"
                  >
                    {locale === "it" ? "Deseleziona tutte" : "Clear all"}
                  </button>
                )}
              </div>
              <div className="max-h-[280px] overflow-y-auto rounded-md border border-border/50 bg-secondary/30 divide-y divide-border/30">
                {demos.length === 0 ? (
                  <div className="p-4 text-center text-[11px] text-muted-foreground">
                    {locale === "it"
                      ? "Nessuna demo nel database. Crea prima delle tracce con \"Aggiungi Demo\"."
                      : "No demos in your database. Create tracks first with \"Add Demo\"."}
                  </div>
                ) : (
                  demos.map((d) => {
                    const isSel = epSelectedTrackIds.has(d.id);
                    const otherRelease = !isSel && d.parentReleaseId
                      ? releases.find(r => r.id === d.parentReleaseId)
                      : null;
                    return (
                      <button
                        type="button"
                        key={d.id}
                        onClick={() => toggleEpTrack(d.id)}
                        className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
                          isSel ? "bg-primary/10" : "hover:bg-secondary/60"
                        }`}
                      >
                        <div className={`flex-shrink-0 h-4 w-4 rounded border flex items-center justify-center ${
                          isSel ? "bg-primary border-primary text-primary-foreground" : "border-border"
                        }`}>
                          {isSel && <Check className="h-3 w-3" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-medium truncate">{d.trackName}</div>
                          <div className="text-[10px] text-muted-foreground/70 flex items-center gap-1.5">
                            <span>{(d.artists && d.artists.length > 0 ? d.artists : (d.artistName ? [d.artistName] : [])).join(" × ") || "—"}</span>
                            {d.genre && <span className="opacity-50">·</span>}
                            {d.genre && <span>{d.genre}</span>}
                            {d.bpm && <span className="opacity-50">·</span>}
                            {d.bpm && <span>{d.bpm} BPM</span>}
                          </div>
                        </div>
                        {otherRelease && (
                          <span className="text-[9px] text-amber-400/80 border border-amber-500/30 rounded px-1 py-0.5">
                            {locale === "it" ? `in ${otherRelease.title}` : `in ${otherRelease.title}`}
                          </span>
                        )}
                        {isSel && (
                          <span className="text-[9px] text-primary border border-primary/30 rounded px-1 py-0.5">
                            {locale === "it" ? "nell'EP" : "in EP"}
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
              {epSelectedTrackIds.size > 0 && (
                <p className="text-[10px] text-muted-foreground/60 leading-tight">
                  {locale === "it"
                    ? `Selezionate ${epSelectedTrackIds.size} tracce. L'ordine di invio seguirà l'ordine della lista.`
                    : `${epSelectedTrackIds.size} tracks selected. Send order follows list order.`}
                </p>
              )}
            </div>

            {/* EP SoundCloud URL — optional single link for the whole EP */}
            <div className="space-y-1.5">
              <UILabel className="text-xs font-mono uppercase text-muted-foreground flex items-center gap-1">
                <Disc3 className="h-3 w-3" />
                {locale === "it" ? "Link EP SoundCloud" : "EP SoundCloud URL"}
                <span className="ml-1 text-[10px] text-muted-foreground/60 normal-case font-sans">
                  ({locale === "it" ? "opzionale" : "optional"})
                </span>
              </UILabel>
              <Input
                value={epSoundCloudUrl}
                onChange={(e) => setEpSoundCloudUrl(e.target.value)}
                placeholder={locale === "it"
                  ? "https://soundcloud.com/.../sets/ep-title"
                  : "https://soundcloud.com/.../sets/ep-title"}
                className="bg-secondary/50 text-[12px]"
              />
              <p className="text-[10px] text-muted-foreground/60 leading-tight">
                {locale === "it"
                  ? "Se hai creato l'EP come album/set privato su SoundCloud, incolla qui l'URL. I pitch che includono questo EP useranno questo link unico invece dei link separati di ogni traccia — la label potrà ascoltare l'EP come un viaggio continuo. Lascia vuoto se le tracce sono separate su SoundCloud."
                  : "If you've created the EP as a private album/set on SoundCloud, paste the URL here. Pitches that include this EP will use this single link instead of each track's individual link — the label can preview the EP as a continuous journey. Leave empty if the tracks are separate on SoundCloud."}
              </p>
            </div>

            {/* EP notes */}
            <div className="space-y-1.5">
              <UILabel className="text-xs font-mono uppercase text-muted-foreground">
                {locale === "it" ? "Note EP" : "EP notes"}
                <span className="ml-1 text-[10px] text-muted-foreground/60 normal-case font-sans">
                  ({locale === "it" ? "opzionale" : "optional"})
                </span>
              </UILabel>
              <Textarea
                value={epNotes}
                onChange={(e) => setEpNotes(e.target.value)}
                placeholder={locale === "it"
                  ? "Concept, ordine tracce, note per l'invio…"
                  : "Concept, track order, send notes…"}
                rows={2}
                className="bg-secondary/50 text-[12px] resize-y"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            {editingReleaseId && (
              <Button
                variant="ghost"
                className="mr-auto text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => {
                  if (editingReleaseId) handleDeleteEp(editingReleaseId);
                  setShowEpDialog(false);
                }}
              >
                {locale === "it" ? "Elimina EP" : "Delete EP"}
              </Button>
            )}
            <Button variant="ghost" onClick={() => setShowEpDialog(false)}>
              {t(locale, "labels.cancel")}
            </Button>
            <Button
              onClick={handleSaveEp}
              disabled={!epTitle.trim() || epSelectedTrackIds.size < 2}
              className="bg-primary hover:bg-primary/90"
            >
              <Disc3 className="h-3.5 w-3.5 mr-1.5" />
              {editingReleaseId
                ? (locale === "it" ? "Salva EP" : "Save EP")
                : (locale === "it" ? "Crea EP" : "Create EP")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== DETAIL DIALOG COMPONENT ====================
//
// Demo detail dialog — shows the demo's metadata (label, status, sentDate,
// link, notes) AND a full Pitch section where the user can:
//   1. Generate a pitch from scratch using the label's emails, the demo's
//      track name + artist name + SoundCloud link, plus tone + language
//      selectors.
//   2. Edit the generated pitch inline (the preview is a textarea, not a
//      read-only <pre>).
//   3. Copy the pitch, open it in Gmail, open it in the email client
//      (mailto:), or send it directly via the Gmail API if connected.
//   4. Save the (possibly edited) pitch back to the demo record.
//
// If the demo already has a pitchText saved (e.g. it was generated from
// the Label Finder dialog), the textarea is pre-filled with that text so
// the user can keep editing it.

// ==================== REPLY TRACKER SECTION COMPONENT ====================
//
// Sub-component of DemoDetailDialog. Shows the current reply status (badge
// + reply text + date + sender) and lets the user record/edit a reply from
// the label. Until Gmail API auto-detection lands, this is manual entry.
//
// Status transitions:
//   none      → user clicks "Registra risposta" → opens editor
//   ack       → user picks "ACK automatico" in the type select
//   info      → user picks "Richiesta info"
//   positive  → user picks "Risposta positiva" → also advances demo status
//               to "reviewing" if it was "sent"
//   rejected  → user picks "Rifiutata" → also advances demo status to
//               "rejected"
//
// The follow-up due date is auto-computed (28 days from sentDate) unless
// the user overrides it. When the follow-up is overdue AND no positive/
// rejected reply has been recorded, a warning is shown at the top.

function ReplyTrackerSection({
  demo,
  updateDemo,
  locale,
}: {
  demo: Demo;
  updateDemo: (id: string, updates: Partial<Demo>) => void;
  locale: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editStatus, setEditStatus] = useState<ReplyStatus>(getReplyStatus(demo));
  const [editText, setEditText] = useState(demo.replyText || "");
  const [editDate, setEditDate] = useState(demo.replyDate || new Date().toISOString().split("T")[0]);
  const [editSender, setEditSender] = useState(demo.replySender || "");

  // Reset local state when switching demos
  useEffect(() => {
    setEditStatus(getReplyStatus(demo));
    setEditText(demo.replyText || "");
    setEditDate(demo.replyDate || new Date().toISOString().split("T")[0]);
    setEditSender(demo.replySender || "");
    setIsEditing(false);
  }, [demo.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = useCallback(() => {
    // Auto-advance status based on reply type:
    //   positive → "reviewing" (label is interested)
    //   rejected → "rejected"
    //   ack/info → no status change (let the user decide)
    const statusUpdates: Partial<Demo> = {};
    if (editStatus === "positive" && demo.status === "sent") {
      statusUpdates.status = "reviewing";
    } else if (editStatus === "rejected") {
      statusUpdates.status = "rejected";
    }

    updateDemo(demo.id, {
      replyStatus: editStatus,
      replyText: editText.trim() || undefined,
      replyDate: editStatus === "none" ? null : editDate,
      replySender: editSender.trim() || undefined,
      ...statusUpdates,
    });
    setIsEditing(false);
  }, [demo.id, demo.status, editStatus, editText, editDate, editSender, updateDemo]);

  const handleClear = useCallback(() => {
    updateDemo(demo.id, {
      replyStatus: "none",
      replyText: undefined,
      replyDate: null,
      replySender: undefined,
    });
    setEditStatus("none");
    setEditText("");
    setEditSender("");
    setIsEditing(false);
  }, [demo.id, updateDemo]);

  const currentReply = getReplyStatus(demo);
  const cfg = REPLY_STATUS_CONFIG[currentReply];
  const fu = getFollowUpStatus(demo);

  return (
    <div className="space-y-3 border-t border-border/30 pt-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Reply className="h-4 w-4 text-primary" />
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
            {locale === "it" ? "Risposta della Label" : "Label Reply"}
          </span>
        </div>
        {currentReply !== "none" && !isEditing && (
          <Badge variant="outline" className={`text-[10px] py-0 px-1.5 h-5 ${cfg.bgColor} ${cfg.color} ${cfg.borderColor}`}>
            {locale === "it" ? cfg.labelIt : cfg.labelEn}
            {demo.replyDate && <span className="ml-1 text-muted-foreground/60">· {demo.replyDate}</span>}
          </Badge>
        )}
      </div>

      {/* Follow-up warning */}
      {fu.isDue && (
        <div className="flex items-start gap-2 text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-md p-2">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">
              {locale === "it"
                ? `Follow-up suggerito — ${fu.daysOverdue} giorni oltre la finestra tipica (28gg)`
                : `Follow-up suggested — ${fu.daysOverdue} days past the typical window (28d)`}
            </p>
            <p className="text-amber-400/70 mt-0.5">
              {locale === "it"
                ? `Data prevista risposta: ${fu.dueDate}. Puoi inviare un'email di cortesia usando il pulsante "Apri in Gmail" qui sotto.`
                : `Expected reply date: ${fu.dueDate}. You can send a polite nudge using the "Open in Gmail" button below.`}
            </p>
          </div>
        </div>
      )}

      {/* Existing reply display (read mode) */}
      {currentReply !== "none" && !isEditing && (
        <div className="space-y-2">
          {demo.replySender && (
            <p className="text-[11px] text-muted-foreground">
              {locale === "it" ? "Da" : "From"}: <span className="text-foreground/80">{demo.replySender}</span>
            </p>
          )}
          {demo.replyText && (
            <Card className="bg-card/80 border-border/30">
              <CardContent className="p-3">
                <pre className="text-[11px] leading-relaxed font-mono text-foreground/70 whitespace-pre-wrap break-words m-0">
                  {demo.replyText}
                </pre>
              </CardContent>
            </Card>
          )}
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setIsEditing(true)}>
              <Pencil className="h-3 w-3 mr-1" />
              {locale === "it" ? "Modifica risposta" : "Edit reply"}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground hover:text-destructive" onClick={handleClear}>
              <X className="h-3 w-3 mr-1" />
              {locale === "it" ? "Rimuovi" : "Remove"}
            </Button>
          </div>
        </div>
      )}

      {/* Edit mode */}
      {(isEditing || currentReply === "none") && (
        <div className="space-y-2 rounded-md border border-primary/20 bg-primary/5 p-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <UILabel className="text-[10px] font-mono uppercase text-muted-foreground">
                {locale === "it" ? "Tipo risposta" : "Reply type"}
              </UILabel>
              <Select value={editStatus} onValueChange={(v) => setEditStatus(v as ReplyStatus)}>
                <SelectTrigger className="bg-secondary/50 text-sm h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{locale === "it" ? "Nessuna (annulla)" : "None (cancel)"}</SelectItem>
                  <SelectItem value="ack">{locale === "it" ? "ACK automatico (conferma ricezione)" : "Auto-ack (receipt confirmation)"}</SelectItem>
                  <SelectItem value="info">{locale === "it" ? "Richiesta info (vogliono sapere di più)" : "Info requested (want to know more)"}</SelectItem>
                  <SelectItem value="positive">{locale === "it" ? "Risposta positiva (interessati!)" : "Positive reply (interested!)"}</SelectItem>
                  <SelectItem value="rejected">{locale === "it" ? "Rifiutata" : "Rejected"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <UILabel className="text-[10px] font-mono uppercase text-muted-foreground">
                {locale === "it" ? "Data risposta" : "Reply date"}
              </UILabel>
              <Input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className="bg-secondary/50 text-sm h-8"
                disabled={editStatus === "none"}
              />
            </div>
          </div>
          <div className="space-y-1">
            <UILabel className="text-[10px] font-mono uppercase text-muted-foreground">
              {locale === "it" ? "Mittente (opzionale)" : "Sender (optional)"}
            </UILabel>
            <Input
              value={editSender}
              onChange={(e) => setEditSender(e.target.value)}
              placeholder={locale === "it" ? "Es. Patrick Scuro, Animarum" : "E.g. Patrick Scuro, Animarum"}
              className="bg-secondary/50 text-sm h-8"
              disabled={editStatus === "none"}
            />
          </div>
          <div className="space-y-1">
            <UILabel className="text-[10px] font-mono uppercase text-muted-foreground">
              {locale === "it" ? "Testo della risposta" : "Reply text"}
            </UILabel>
            <Textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              placeholder={locale === "it" ? "Incolla qui il testo della email di risposta della label…" : "Paste the label's reply email text here…"}
              rows={5}
              className="bg-secondary/50 text-[11px] font-mono resize-y min-h-[100px]"
              disabled={editStatus === "none"}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleSave} disabled={editStatus === "none" && !editText.trim()}>
              {locale === "it" ? "Salva risposta" : "Save reply"}
            </Button>
            {isEditing && (
              <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>
                {t(locale as Locale, "labels.cancel")}
              </Button>
            )}
            {editStatus === "positive" && (
              <p className="text-[10px] text-emerald-400/70">
                {locale === "it" ? "ℹ Stato passerà a 'In attesa di risposta'" : "ℹ Status will move to 'Awaiting reply'"}
              </p>
            )}
            {editStatus === "rejected" && (
              <p className="text-[10px] text-red-400/70">
                {locale === "it" ? "ℹ Stato passerà a 'Rifiutata'" : "ℹ Status will move to 'Rejected'"}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Hint about future Gmail integration */}
      {currentReply === "none" && !isEditing && (
        <p className="text-[10px] text-muted-foreground/60 leading-tight">
          {locale === "it"
            ? "💡 Quando una label risponde, registra qui la risposta per tenere traccia dello stato. Prossimamente: rilevamento automatico via Gmail."
            : "💡 When a label replies, record it here to track status. Coming soon: automatic detection via Gmail."}
        </p>
      )}
    </div>
  );
}

// ====================================================================
// LABEL REPLY COMPOSER
// ====================================================================
// Lets the user reply directly to the label from inside the app — no need
// to switch to Gmail. The reply is sent in the same Gmail thread as the
// label's original response (using threadId), so the conversation stays
// grouped in both inboxes.
//
// Reply templates depend on the current replyStatus:
//   - ack      → "thanks for the confirmation, looking forward to hearing back"
//   - info     → answer the info request (custom body)
//   - positive → start the material submission flow OR send a thank-you
//   - rejected → polite "thanks anyway, maybe next time"
//   - none     → free-form follow-up nudge

// Each reply status has multiple template variants (formal / warm) so the
// user can pick the tone that fits. Each variant is available in 5 languages
// (it/en/de/fr/es) — the language is decoupled from the app locale so the
// producer can reply in whatever language the label used.

export type ReplyLang = "it" | "en" | "de" | "fr" | "es";

export const REPLY_LANGUAGES: { code: ReplyLang; labelIt: string; labelEn: string; flag: string }[] = [
  { code: "it", labelIt: "Italiano", labelEn: "Italian", flag: "🇮🇹" },
  { code: "en", labelIt: "Inglese", labelEn: "English", flag: "🇬🇧" },
  { code: "de", labelIt: "Tedesco", labelEn: "German", flag: "🇩🇪" },
  { code: "fr", labelIt: "Francese", labelEn: "French", flag: "🇫🇷" },
  { code: "es", labelIt: "Spagnolo", labelEn: "Spanish", flag: "🇪🇸" },
];

type ReplyTemplate = {
  id: string;
  toneIt: string; // label shown in IT locale
  toneEn: string; // label shown in EN locale
  body: Record<ReplyLang, string>;
};

const REPLY_TEMPLATES: Record<ReplyStatus, ReplyTemplate[]> = {
  none: [
    {
      id: "followup-formal",
      toneIt: "Follow-up formale",
      toneEn: "Formal follow-up",
      body: {
        it: `Gentile team,\n\nTi scrivo per un cortese follow-up rispetto alla demo "{trackName}" inviata il {sentDate}.\n\nComprendo che valutiate con cura tutte le proposte e che i tempi possano essere lunghi, ma vi sarei grato se poteste farmi avere un feedback, anche sintetico.\n\nResto a disposizione per qualsiasi dettaglio aggiuntivo.\n\nCordiali saluti,\n{artistName}`,
        en: `Hi team,\n\nI'm writing a quick follow-up on the demo "{trackName}" I sent on {sentDate}.\n\nI understand you carefully review every submission and that timelines can be long, but I'd be grateful for any feedback, even a brief one.\n\nHappy to provide any additional details you may need.\n\nBest regards,\n{artistName}`,
        de: `Hallo liebes Team,\n\nich melde mich kurz bezüglich der Demo „{trackName}", die ich am {sentDate} eingereicht habe.\n\nIch verstehe, dass ihr jede Einsendung sorgfältig prüft und dass dies Zeit braucht, aber ich wäre dankbar für eine kurze Rückmeldung.\n\nFür weitere Informationen stehe ich jederzeit zur Verfügung.\n\nMit freundlichen Grüßen,\n{artistName}`,
        fr: `Bonjour,\n\nJe me permets de revenir vers vous au sujet de la démo « {trackName} » envoyée le {sentDate}.\n\nJe comprends que vous examinez chaque proposition avec soin et que les délais peuvent être longs, mais je serais reconnaissant de tout retour, même bref.\n\nJe reste à votre disposition pour tout complément d'information.\n\nCordialement,\n{artistName}`,
        es: `Hola,\n\nLes escribo como seguimiento sobre la demo «{trackName}» que envié el {sentDate}.\n\nEntiendo que revisan cada propuesta con detenimiento y que los tiempos pueden ser largos, pero les agradecería cualquier comentario, aunque sea breve.\n\nQuedo a su disposición para cualquier información adicional.\n\nUn cordial saludo,\n{artistName}`,
      },
    },
    {
      id: "followup-warm",
      toneIt: "Follow-up amichevole",
      toneEn: "Warm follow-up",
      body: {
        it: `Ciao {senderName},\n\nspero tutto bene! Ti scrivo solo per sapere se avete avuto modo di dare un ascolto a "{trackName}".\n\nNessuna fretta — so che siete sommersi di demo. Se vi serve altro materiale o dettagli, fatemi sapere.\n\nA presto,\n{artistName}`,
        en: `Hi {senderName},\n\nHope you're doing well! Just a quick note to check if you've had a chance to listen to "{trackName}".\n\nNo rush at all — I know you get flooded with demos. If you need any extra material or details, just say the word.\n\nCheers,\n{artistName}`,
        de: `Hi {senderName},\n\nich hoffe, es geht dir gut! Ich melde mich nur kurz, um nachzufragen, ob ihr schon Zeit hattet, euch „{trackName}" anzuhören.\n\nKein Stress — ich weiß, dass ihr mit Demos überschüttet werdet. Falls ihr weiteres Material oder Infos braucht, sagt einfach Bescheid.\n\nLiebe Grüße,\n{artistName}`,
        fr: `Salut {senderName},\n\nJ'espère que tu vas bien ! Je me permets de demander si vous avez pu écouter « {trackName} ».\n\nPas d'urgence — je sais que vous recevez énormément de démos. S'il vous faut d'autres éléments ou infos, n'hésitez pas.\n\nÀ bientôt,\n{artistName}`,
        es: `Hola {senderName},\n\n¡Espero que estés bien! Te escribo solo para saber si habéis tenido ocasión de escuchar «{trackName}».\n\nSin prisa — sé que recibís muchísimas demos. Si necesitáis más material o información, decidme.\n\nUn saludo,\n{artistName}`,
      },
    },
  ],
  ack: [
    {
      id: "ack-formal",
      toneIt: "Ringraziamento formale",
      toneEn: "Formal thank-you",
      body: {
        it: `Gentile {senderName},\n\nGrazie per la conferma di ricezione. Resto in attesa di un vostro feedback entro le tempistiche indicate.\n\nCordiali saluti,\n{artistName}`,
        en: `Hi {senderName},\n\nThanks for confirming receipt. I look forward to hearing back within the timeframe you mentioned.\n\nBest regards,\n{artistName}`,
        de: `Hallo {senderName},\n\nvielen Dank für die Bestätigung des Eingangs. Ich freue mich auf euer Feedback innerhalb des genannten Zeitraums.\n\nMit freundlichen Grüßen,\n{artistName}`,
        fr: `Bonjour {senderName},\n\nMerci pour la confirmation de bonne réception. Je reste dans l'attente de votre retour dans les délais indiqués.\n\nCordialement,\n{artistName}`,
        es: `Hola {senderName},\n\nGracias por confirmar la recepción. Quedo a la espera de sus comentarios dentro del plazo indicado.\n\nUn cordial saludo,\n{artistName}`,
      },
    },
    {
      id: "ack-warm",
      toneIt: "Ringraziamento breve",
      toneEn: "Brief thank-you",
      body: {
        it: `Ciao {senderName},\n\ntutto ricevuto, grazie mille! Aspetto vostri — prendetevi il tempo necessario.\n\nA presto,\n{artistName}`,
        en: `Hi {senderName},\n\nGot it, thanks a lot! I'll wait for your feedback — take all the time you need.\n\nCheers,\n{artistName}`,
        de: `Hi {senderName},\n\nalles angekommen, vielen Dank! Ich warte auf euer Feedback — nehmt euch die Zeit, die ihr braucht.\n\nLiebe Grüße,\n{artistName}`,
        fr: `Salut {senderName},\n\nBien reçu, merci beaucoup ! J'attends votre retour — prenez le temps qu'il vous faut.\n\nÀ bientôt,\n{artistName}`,
        es: `Hola {senderName},\n\n¡Todo recibido, muchas gracias! Espero vuestros comentarios — tomáos el tiempo que necesitéis.\n\nUn saludo,\n{artistName}`,
      },
    },
  ],
  info: [
    {
      id: "info-formal",
      toneIt: "Risposta formale",
      toneEn: "Formal reply",
      body: {
        it: `Gentile {senderName},\n\nGrazie per il tuo interessamento. In risposta alla tua richiesta:\n\n[scrivi qui i dettagli richiesti — es. link WAV, stems, BPM, ecc.]\n\nResto a disposizione per qualsiasi altra informazione.\n\nCordiali saluti,\n{artistName}`,
        en: `Hi {senderName},\n\nThanks for your interest. In response to your request:\n\n[write the requested details here — e.g. WAV link, stems, BPM, etc.]\n\nHappy to provide anything else you may need.\n\nBest regards,\n{artistName}`,
        de: `Hallo {senderName},\n\nvielen Dank für dein Interesse. Als Antwort auf deine Anfrage:\n\n[hier die gewünschten Details eintragen — z. B. WAV-Link, Stems, BPM usw.]\n\nFür weitere Informationen stehe ich gerne zur Verfügung.\n\nMit freundlichen Grüßen,\n{artistName}`,
        fr: `Bonjour {senderName},\n\nMerci pour votre intérêt. En réponse à votre demande :\n\n[inscrivez ici les détails demandés — ex. lien WAV, stems, BPM, etc.]\n\nJe reste à votre disposition pour tout complément.\n\nCordialement,\n{artistName}`,
        es: `Hola {senderName},\n\nGracias por vuestro interés. En respuesta a tu solicitud:\n\n[escribe aquí los detalles solicitados — p. ej. enlace WAV, stems, BPM, etc.]\n\nQuedo a su disposición para cualquier otra información.\n\nUn cordial saludo,\n{artistName}`,
      },
    },
    {
      id: "info-warm",
      toneIt: "Risposta diretta",
      toneEn: "Direct reply",
      body: {
        it: `Ciao {senderName},\n\ncerto, ecco quello che mi hai chiesto:\n\n[scrivi qui i dettagli richiesti]\n\nSe serve altro dimmi pure.\n\nA presto,\n{artistName}`,
        en: `Hi {senderName},\n\nsure, here's what you asked for:\n\n[write the requested details here]\n\nLet me know if you need anything else.\n\nCheers,\n{artistName}`,
        de: `Hi {senderName},\n\nklar, hier das Gewünschte:\n\n[hier die gewünschten Details eintragen]\n\nFalls ihr noch etwas braucht, sagt einfach Bescheid.\n\nLiebe Grüße,\n{artistName}`,
        fr: `Salut {senderName},\n\nbien sûr, voici ce que tu as demandé :\n\n[inscris ici les détails demandés]\n\nSi tu as besoin d'autre chose, dis-moi.\n\nÀ bientôt,\n{artistName}`,
        es: `Hola {senderName},\n\nclaro, aquí lo que pediste:\n\n[escribe aquí los detalles solicitados]\n\nSi necesitáis algo más, decidme.\n\nUn saludo,\n{artistName}`,
      },
    },
  ],
  positive: [
    {
      id: "positive-formal",
      toneIt: "Invio materiale formale",
      toneEn: "Formal material send",
      body: {
        it: `Gentile {senderName},\n\nGrazie mille per il feedback positivo! Sono felice che la traccia vi sia piaciuta.\n\nProcedo subito con l'invio del materiale richiesto. Trovi tutti i link in calce a questa email.\n\nResto a disposizione per definire i prossimi passi.\n\nCordiali saluti,\n{artistName}`,
        en: `Hi {senderName},\n\nThank you so much for the positive feedback! Glad to hear the track resonated with you.\n\nI'll send the requested materials right away — links are at the bottom of this email.\n\nAvailable to discuss the next steps.\n\nBest regards,\n{artistName}`,
        de: `Hallo {senderName},\n\nvielen Dank für das positive Feedback! Es freut mich, dass der Track bei euch ankam.\n\nIch sende die gewünschten Materialien umgehend — die Links findet ihr am Ende dieser E-Mail.\n\nFür die nächsten Schritte stehe ich gerne zur Verfügung.\n\nMit freundlichen Grüßen,\n{artistName}`,
        fr: `Bonjour {senderName},\n\nMerci beaucoup pour ce retour positif ! Ravi que le titre vous ait parlé.\n\nJe vous envoie les éléments demandés tout de suite — les liens se trouvent en bas de cet e-mail.\n\nJe reste à votre disposition pour définir les prochaines étapes.\n\nCordialement,\n{artistName}`,
        es: `Hola {senderName},\n\n¡Muchas gracias por el comentario positivo! Me alegra que el tema os haya gustado.\n\nOs envío enseguida el material solicitado — los enlaces están al final de este correo.\n\nQuedo a su disposición para concretar los próximos pasos.\n\nUn cordial saludo,\n{artistName}`,
      },
    },
    {
      id: "positive-warm",
      toneIt: "Invio materiale entusiasta",
      toneEn: "Enthusiastic send",
      body: {
        it: `Ciao {senderName},\n\nche bella notizia, grazie! 😊 Sono super felice che "{trackName}" vi sia piaciuta.\n\nTi invio subito tutto il materiale richiesto — lo trovi in fondo.\n\nDimmi tu i prossimi passi, sono a disposizione.\n\nA presto,\n{artistName}`,
        en: `Hi {senderName},\n\namazing news, thanks! 😊 Super happy that "{trackName}" resonated with you.\n\nSending all the requested materials right away — links at the bottom.\n\nLet me know the next steps, I'm here.\n\nCheers,\n{artistName}`,
        de: `Hi {senderName},\n\ntolle Nachricht, danke! 😊 Super, dass „{trackName}" bei euch ankam.\n\nIch schicke dir sofort das gesamte gewünschte Material — die Links findest du unten.\n\nSag Bescheid, wie es weitergeht, ich bin da.\n\nLiebe Grüße,\n{artistName}`,
        fr: `Salut {senderName},\n\nquelle belle nouvelle, merci ! 😊 Super ravi que « {trackName} » vous ait parlé.\n\nJe t'envoie tout de suite le matériel demandé — les liens sont en bas.\n\nDis-moi la suite, je suis dispo.\n\nÀ bientôt,\n{artistName}`,
        es: `Hola {senderName},\n\n¡qué buena noticia, gracias! 😊 Super contento de que «{trackName}» os haya gustado.\n\nTe envío enseguida todo el material solicitado — los enlaces están abajo.\n\nDime los próximos pasos, aquí estoy.\n\nUn saludo,\n{artistName}`,
      },
    },
  ],
  rejected: [
    {
      id: "rejected-formal",
      toneIt: "Ringraziamento formale",
      toneEn: "Formal thank-you",
      body: {
        it: `Gentile {senderName},\n\nGrazie comunque per aver preso il tempo di ascoltare la demo. Apprezzo la trasparenza del feedback.\n\nSpero possa esserci occasione di collaborare in futuro con materiale più in linea con il vostro catalogo.\n\nCordiali saluti,\n{artistName}`,
        en: `Hi {senderName},\n\nThanks anyway for taking the time to listen. I appreciate the transparent feedback.\n\nHope we'll have a chance to collaborate in the future with material that's a better fit for your roster.\n\nBest regards,\n{artistName}`,
        de: `Hallo {senderName},\n\ntrotzdem vielen Dank, dass ihr euch die Zeit genommen habt, die Demo anzuhören. Ich schätze das offene Feedback.\n\nIch hoffe, wir künftig Gelegenheit haben, mit passenderem Material für euren Katalog zusammenzuarbeiten.\n\nMit freundlichen Grüßen,\n{artistName}`,
        fr: `Bonjour {senderName},\n\nMerci quand même d'avoir pris le temps d'écouter la démo. J'apprécie le retour transparent.\n\nJ'espère que nous aurons l'occasion de collaborer à l'avenir avec un matériel plus adapté à votre catalogue.\n\nCordialement,\n{artistName}`,
        es: `Hola {senderName},\n\nGracias de todos modos por tomarse el tiempo de escuchar la demo. Agradezco el comentario transparente.\n\nEspero que tengamos ocasión de colaborar en el futuro con material más adecuado a vuestro catálogo.\n\nUn cordial saludo,\n{artistName}`,
      },
    },
    {
      id: "rejected-warm",
      toneIt: "Ringraziamento breve",
      toneEn: "Brief thank-you",
      body: {
        it: `Ciao {senderName},\n\nnessun problema, grazie per l'ascolto e la sincerità. Ci provo con la prossima — a presto!\n\n{artistName}`,
        en: `Hi {senderName},\n\nno worries, thanks for listening and for the honesty. I'll come back with the next one — see you soon!\n\n{artistName}`,
        de: `Hi {senderName},\n\nkein Problem, danke fürs Zuhören und die Ehrlichkeit. Ich komme mit der nächsten Demo wieder — bis bald!\n\n{artistName}`,
        fr: `Salut {senderName},\n\npas de souci, merci pour l'écoute et l'honnêteté. Je reviens avec la prochaine — à bientôt !\n\n{artistName}`,
        es: `Hola {senderName},\n\nsin problema, gracias por escuchar y por la sinceridad. Vuelvo con la próxima — ¡hasta pronto!\n\n{artistName}`,
      },
    },
  ],
};

// Detect the most likely language of a label's reply so the producer can
// reply in the same language by default. Returns the highest-scoring lang.
function detectReplyLanguage(text: string): ReplyLang {
  if (!text) return "en";
  const lower = text.toLowerCase();
  const scores: Record<ReplyLang, number> = { it: 0, en: 0, de: 0, fr: 0, es: 0 };
  // Common stop-words / greetings per language
  const markers: Record<ReplyLang, RegExp[]> = {
    it: [/grazie/g, /gentile/g, /caro/g, /ciao/g, /saluti/g, /ricevuto/g, /ascolto/g, /demo/g, /vielen/g, /cordiali/g],
    en: [/thanks/g, /thank you/g, /dear/g, /hi\b/g, /hello/g, /best/g, /regards/g, /received/g, /listen/g, /demo/g],
    de: [/vielen dank/g, /hallo/g, /liebe[r]?/g, /freundliche grüße/g, /demo/g, /erhalten/g, /anhören/g, /feedback/g],
    fr: [/merci/g, /bonjour/g, /cordialement/g, /reçu/g, /écouter/g, /démo/g, /salut/g, /bien à vous/g],
    es: [/gracias/g, /hola/g, /saludos/g, /recibido/g, /escuchar/g, /demo/g, /un cordial/g, /estimado/g],
  };
  for (const lang of Object.keys(markers) as ReplyLang[]) {
    for (const re of markers[lang]) {
      const matches = lower.match(re);
      if (matches) scores[lang] += matches.length;
    }
  }
  // Pick highest, default to en on tie
  let best: ReplyLang = "en";
  let bestScore = 0;
  for (const lang of Object.keys(scores) as ReplyLang[]) {
    if (scores[lang] > bestScore) {
      bestScore = scores[lang];
      best = lang;
    }
  }
  return best;
}

function extractSenderName(fromHeader: string): string {
  // Try to extract the human-readable name from "Patrick Scuro <demo.animarum@gmail.com>"
  const nameMatch = fromHeader.match(/^([^<]+)/);
  if (nameMatch) {
    return nameMatch[1].trim().replace(/"/g, "");
  }
  return "";
}

function LabelReplyComposer({
  demo,
  label,
  userProfile,
  gmailAuth,
  setGmailAuth,
  updateDemo,
  locale,
  demos,
}: {
  demo: Demo;
  label: Label | undefined;
  userProfile: any;
  gmailAuth: any;
  setGmailAuth: (a: any) => void;
  updateDemo: (id: string, updates: Partial<Demo>) => void;
  locale: string;
  demos: Demo[];
}) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [body, setBody] = useState("");
  const [selectedLang, setSelectedLang] = useState<ReplyLang>("en");
  const [selectedVariantIdx, setSelectedVariantIdx] = useState(0);
  const [bodyDirty, setBodyDirty] = useState(false);
  const [genMenuOpen, setGenMenuOpen] = useState(false);

  // Pick the right template family based on the current reply status
  const currentReply = getReplyStatus(demo);
  const variants = REPLY_TEMPLATES[currentReply];
  const activeVariant = variants[selectedVariantIdx] || variants[0];

  // Reply target = the email address that sent the reply (preferred)
  // or the label's emails as fallback
  const replyToEmails = useMemo(() => {
    if (demo.replySender) {
      const m = demo.replySender.match(/<([^>]+)>/) || demo.replySender.match(/([\w.+-]+@[\w-]+\.[\w.-]+)/);
      if (m) return [m[1].toLowerCase()];
    }
    return label?.emails?.filter((e) => e && e.includes("@")).map((e) => e.toLowerCase()) || [];
  }, [demo.replySender, label]);

  const senderName = useMemo(() => extractSenderName(demo.replySender || ""), [demo.replySender]);
  const artistName = userProfile?.artistName || "—";

  // Subject: try to reuse the original subject from pitchText, else "Re: Demo - {track}"
  const replySubject = useMemo(() => {
    const original = demo.pitchText?.match(/^Subject:\s*(.+)$/m)?.[1];
    if (original) {
      return original.startsWith("Re:") ? original : `Re: ${original}`;
    }
    return `Re: Demo: ${demo.trackName}`;
  }, [demo.pitchText, demo.trackName]);

  // Detect the label's reply language once when the composer opens so the
  // producer can reply in the same language by default.
  const detectedLang = useMemo<ReplyLang>(() => {
    const source = `${demo.replyText || ""} ${demo.replySender || ""}`;
    return detectReplyLanguage(source);
  }, [demo.replyText, demo.replySender]);

  // Helper that fills a template body with demo data
  const fillTemplate = useCallback(
    (tpl: ReplyTemplate, lang: ReplyLang): string => {
      const raw = tpl.body[lang] || tpl.body.en;
      return raw
        .replace(/\{trackName\}/g, demo.trackName)
        .replace(/\{sentDate\}/g, demo.sentDate || "")
        .replace(/\{artistName\}/g, artistName)
        .replace(/\{senderName\}/g, senderName || (lang === "it" ? "team" : "team"));
    },
    [demo.trackName, demo.sentDate, artistName, senderName]
  );

  // When the composer opens for the first time, auto-detect language and
  // populate the body with the first variant. Don't overwrite if the user
  // has already edited the body manually.
  useEffect(() => {
    if (!isOpen) return;
    if (!bodyDirty) {
      setSelectedLang(detectedLang);
      setSelectedVariantIdx(0);
      setBody(fillTemplate(variants[0], detectedLang));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // When the user picks a different language or variant via the controls,
  // re-fill the body (we DO overwrite here because they explicitly asked).
  // But only if the body hasn't been hand-edited yet — otherwise show a
  // confirm via toast and let them click again to force.
  const applyVariant = useCallback(
    (variantIdx: number, lang: ReplyLang, force = false) => {
      if (bodyDirty && !force) {
        toast({
          title: locale === "it" ? "Testo già modificato" : "Body already edited",
          description:
            locale === "it"
              ? "Hai modificato manualmente il testo. Clicca di nuovo per sovrascrivere."
              : "You've edited the text manually. Click again to overwrite.",
          variant: "destructive",
        });
        return;
      }
      setSelectedVariantIdx(variantIdx);
      setSelectedLang(lang);
      setBody(fillTemplate(variants[variantIdx], lang));
      setBodyDirty(false);
    },
    [bodyDirty, fillTemplate, variants, toast, locale]
  );

  const handleBodyChange = (next: string) => {
    setBody(next);
    setBodyDirty(true);
  };

  const handleSend = useCallback(async () => {
    if (!body.trim()) return;
    if (!gmailAuth?.isConnected) {
      toast({
        title: "Gmail non connesso",
        description: "Connetti Gmail per inviare la risposta.",
        variant: "destructive",
      });
      return;
    }
    if (replyToEmails.length === 0) {
      toast({
        title: "Nessun indirizzo email",
        description: "Impossibile determinare a chi rispondere. Aggiungi un'email alla label.",
        variant: "destructive",
      });
      return;
    }
    setSending(true);
    try {
      const validAuth = await ensureValidToken(gmailAuth);
      if (!validAuth) {
        toast({ title: "Sessione Gmail scaduta", description: "Riconnetti il tuo account Gmail", variant: "destructive" });
        setSending(false);
        return;
      }
      if (validAuth.accessToken !== gmailAuth.accessToken) {
        setGmailAuth(validAuth);
      }

      const result = await sendReplyInThread(validAuth.accessToken, {
        to: replyToEmails,
        subject: replySubject,
        body,
        threadId: demo.gmailThreadId,
        inReplyToMessageId: demo.gmailReplyMessageId,
      });

      if (result.success) {
        setSent(true);
        toast({
          title: "Risposta inviata!",
          description: `Email inviata a ${replyToEmails.join(", ")}`,
        });
        // Save the threadId back to the demo if it wasn't there
        if (result.threadId && !demo.gmailThreadId) {
          updateDemo(demo.id, { gmailThreadId: result.threadId });
        }
        setTimeout(() => {
          setSent(false);
          setIsOpen(false);
        }, 2500);
      } else {
        toast({ title: "Errore invio", description: result.error || "Errore sconosciuto", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Errore invio", description: err.message || "Errore di connessione", variant: "destructive" });
    } finally {
      setSending(false);
    }
  }, [body, gmailAuth, replyToEmails, replySubject, demo, setGmailAuth, updateDemo, toast]);

  if (!gmailAuth?.isConnected) {
    return null; // composer only available when Gmail is connected
  }

  if (!isOpen) {
    return (
      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs border-primary/30 text-primary hover:bg-primary/10"
          onClick={() => setIsOpen(true)}
        >
          <Reply className="h-3 w-3 mr-1" />
          {locale === "it" ? "Rispondi alla label" : "Reply to label"}
        </Button>
        <span className="text-[10px] text-muted-foreground/60">
          {locale === "it"
            ? `Risponde a ${replyToEmails[0] || "—"} nello stesso thread Gmail`
            : `Replies to ${replyToEmails[0] || "—"} in the same Gmail thread`}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3 mt-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Reply className="h-3.5 w-3.5 text-primary" />
          <span className="text-[11px] font-medium text-primary">
            {locale === "it" ? "Rispondi alla label" : "Reply to label"}
          </span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-[10px] text-muted-foreground hover:text-foreground"
          onClick={() => setIsOpen(false)}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>

      {/* Reply target info */}
      <div className="text-[10px] text-muted-foreground/70 space-y-0.5">
        <p><span className="text-muted-foreground/50">To:</span> {replyToEmails.join(", ") || "—"}</p>
        <p><span className="text-muted-foreground/50">Subject:</span> {replySubject}</p>
        {demo.gmailThreadId && (
          <p className="text-emerald-400/60 flex items-center gap-1">
            <CheckCircle2 className="h-2.5 w-2.5" />
            {locale === "it" ? "Thread Gmail originale" : "Original Gmail thread"}
          </p>
        )}
      </div>

      {/* Language + tone controls */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {/* Language picker */}
        <div className="flex items-center gap-1">
          <Languages className="h-3 w-3 text-muted-foreground/60 mr-0.5" />
          {REPLY_LANGUAGES.map((lng) => (
            <button
              key={lng.code}
              type="button"
              onClick={() => applyVariant(selectedVariantIdx, lng.code)}
              title={locale === "it" ? lng.labelIt : lng.labelEn}
              className={`h-6 px-1.5 rounded text-[10px] font-medium border transition-colors ${
                selectedLang === lng.code
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent text-muted-foreground border-border hover:bg-secondary"
              }`}
            >
              <span className="mr-0.5">{lng.flag}</span>
              {lng.code.toUpperCase()}
            </button>
          ))}
          {detectedLang && (
            <span className="text-[9px] text-muted-foreground/50 ml-1">
              {locale === "it" ? `rilevata: ${detectedLang.toUpperCase()}` : `detected: ${detectedLang.toUpperCase()}`}
            </span>
          )}
        </div>

        {/* Generate reply menu */}
        <Popover open={genMenuOpen} onOpenChange={setGenMenuOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 text-[10px] gap-1 border-primary/30 text-primary"
            >
              <Sparkles className="h-3 w-3" />
              {locale === "it" ? "Genera risposta" : "Generate reply"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-1" align="start">
            <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              {locale === "it" ? "Scegli tono" : "Pick a tone"}
            </div>
            {variants.map((v, idx) => {
              const isActive = idx === selectedVariantIdx;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => {
                    applyVariant(idx, selectedLang);
                    setGenMenuOpen(false);
                  }}
                  className={`w-full text-left px-2 py-1.5 rounded text-[11px] flex items-start gap-2 transition-colors ${
                    isActive ? "bg-primary/10 text-primary" : "hover:bg-secondary"
                  }`}
                >
                  <span className="flex-1">
                    <span className="font-medium block">
                      {locale === "it" ? v.toneIt : v.toneEn}
                    </span>
                    <span className="text-[9px] text-muted-foreground/70 line-clamp-2 leading-tight mt-0.5">
                      {fillTemplate(v, selectedLang).slice(0, 90).replace(/\n/g, " ")}…
                    </span>
                  </span>
                  {isActive && <Check className="h-3 w-3 mt-0.5 text-primary flex-shrink-0" />}
                </button>
              );
            })}
            <div className="border-t border-border mt-1 pt-1 px-2 py-1 text-[9px] text-muted-foreground/60">
              {locale === "it"
                ? "Le varianti si adattano allo stato della risposta (ACK / info / positiva / rifiuto)."
                : "Variants adapt to the reply status (ACK / info / positive / rejected)."}
            </div>
          </PopoverContent>
        </Popover>

        {bodyDirty && (
          <button
            type="button"
            onClick={() => {
              // Force re-apply the current variant (overwrites manual edits)
              applyVariant(selectedVariantIdx, selectedLang, true);
            }}
            className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
            title={locale === "it" ? "Ripristina template" : "Reset to template"}
          >
            <RotateCcw className="h-2.5 w-2.5" />
            {locale === "it" ? "Reset" : "Reset"}
          </button>
        )}
      </div>

      {/* Active template label */}
      <div className="flex items-center gap-1.5 text-[10px] text-primary/70">
        <Sparkles className="h-3 w-3" />
        <span>
          {locale === "it" ? activeVariant.toneIt : activeVariant.toneEn}
          {" · "}
          {REPLY_LANGUAGES.find((l) => l.code === selectedLang)?.flag}
          {" "}
          {selectedLang.toUpperCase()}
        </span>
      </div>

      <Textarea
        value={body}
        onChange={(e) => handleBodyChange(e.target.value)}
        rows={10}
        className="bg-secondary/50 text-[11px] font-mono resize-y min-h-[180px]"
        spellCheck={false}
      />

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={handleSend}
          disabled={sending || !body.trim()}
          className="bg-emerald-600 hover:bg-emerald-500 text-white"
        >
          {sent ? (
            <><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Inviata!</>
          ) : sending ? (
            <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Invio...</>
          ) : (
            <><SendHorizonal className="h-3.5 w-3.5 mr-1.5" />Invia risposta</>
          )}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setIsOpen(false)}>
          {t(locale as Locale, "labels.cancel")}
        </Button>
      </div>
    </div>
  );
}

// ====================================================================
// MATERIAL SUBMISSION FORM
// ====================================================================
// When the label replies "positive" (interested in signing), this panel
// lets the user send the requested materials directly from the app:
//
//  - Producer info auto-filled from userProfile (artistName, email, SC link)
//  - Track dropdown: lists all demos in the user's database so they can
//    pick which track to send (defaults to the current demo)
//  - Link fields pre-populated from the selected demo's links[]
//  - "Generate material email" button: builds an email with all the links
//    formatted, sends via Gmail in the original thread
//
// Saves `materialSentDate` + `materialSentLinks` on the demo so the user
// can see at a glance which materials have been delivered.

function MaterialSubmissionForm({
  demo,
  label,
  userProfile,
  gmailAuth,
  setGmailAuth,
  updateDemo,
  locale,
  demos,
}: {
  demo: Demo;
  label: Label | undefined;
  userProfile: any;
  gmailAuth: any;
  setGmailAuth: (a: any) => void;
  updateDemo: (id: string, updates: Partial<Demo>) => void;
  locale: string;
  demos: Demo[];
}) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [materialLanguage, setMaterialLanguage] = useState<"it" | "en">(locale === "it" ? "it" : "en");
  const [attachment, setAttachment] = useState<{ filename: string; contentType: string; data: string } | null>(null);

  // Pre-filled producer info from profile (editable)
  const [producerName, setProducerName] = useState(userProfile?.artistName || "");
  const [producerEmail, setProducerEmail] = useState(userProfile?.email || "");
  const [producerSc, setProducerSc] = useState(userProfile?.scLink || "");
  const [producerBio, setProducerBio] = useState(userProfile?.bio || "");

  // Selected demo for materials — defaults to the current demo
  const [selectedDemoId, setSelectedDemoId] = useState(demo.id);
  const selectedDemo = demos.find((d) => d.id === selectedDemoId) || demo;

  // Material links — pre-populated from the selected demo's links
  const [links, setLinks] = useState<{ type: string; value: string }[]>([]);
  useEffect(() => {
    if (selectedDemo) {
      // Start from the selected demo's links, plus the legacy `link` field
      const initial = [...(selectedDemo.links || [])];
      if (selectedDemo.link && !initial.some((l) => l.value === selectedDemo.link)) {
        initial.unshift({ type: "soundcloud", value: selectedDemo.link });
      }
      setLinks(initial.length > 0 ? initial : [{ type: "soundcloud", value: "" }]);
    }
  }, [selectedDemoId, selectedDemo]);

  const addLink = () => setLinks([...links, { type: "soundcloud", value: "" }]);
  const removeLink = (i: number) => setLinks(links.filter((_, idx) => idx !== i));
  const updateLink = (i: number, field: "type" | "value", value: string) => {
    setLinks(links.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)));
  };

  const replyToEmails = useMemo(() => {
    if (demo.replySender) {
      const m = demo.replySender.match(/<([^>]+)>/) || demo.replySender.match(/([\w.+-]+@[\w-]+\.[\w.-]+)/);
      if (m) return [m[1].toLowerCase()];
    }
    return label?.emails?.filter((e) => e && e.includes("@")).map((e) => e.toLowerCase()) || [];
  }, [demo.replySender, label]);

  const replySubject = useMemo(() => {
    const original = demo.pitchText?.match(/^Subject:\s*(.+)$/m)?.[1];
    if (original) {
      return original.startsWith("Re:") ? original : `Re: ${original}`;
    }
    return `Re: Demo: ${demo.trackName} — Materials`;
  }, [demo.pitchText, demo.trackName]);

  const buildMaterialEmailBody = useCallback(() => {
    const linkLines = links
      .filter((l) => l.value.trim())
      .map((l) => `  • ${l.type.toUpperCase()}: ${l.value.trim()}`)
      .join("\n");
    const attachmentLine = attachment ? `\nALLEGATO\n  • ${attachment.filename}\n` : "";

    if (materialLanguage === "it") {
      return `Gentile team ${label?.name || ""},

In seguito al vostro feedback positivo sulla traccia "${demo.trackName}", vi invio il materiale richiesto e i riferimenti della traccia selezionata.

PRODUTTORE
  • Nome: ${producerName}
  • Email: ${producerEmail}
  • SoundCloud: ${producerSc}
${producerBio ? `\nBIO\n  ${producerBio}\n` : ""}
TRACCIA: ${selectedDemo.trackName}
${selectedDemo.bpm ? `BPM: ${selectedDemo.bpm}\n` : ""}${selectedDemo.key ? `Key: ${selectedDemo.key}\n` : ""}${selectedDemo.genre ? `Genere: ${selectedDemo.genre}\n` : ""}
LINK DI RIFERIMENTO DELLA TRACCIA
${linkLines}${attachmentLine}
Resto a disposizione per qualsiasi ulteriore necessità.

Cordiali saluti,
${producerName}`;
    }
    return `Hi ${label?.name || "team"},

Following your positive feedback on "${demo.trackName}", I'm sending the requested materials and the reference links for the selected track.

PRODUCER
  • Name: ${producerName}
  • Email: ${producerEmail}
  • SoundCloud: ${producerSc}
${producerBio ? `\nBIO\n  ${producerBio}\n` : ""}
TRACK: ${selectedDemo.trackName}
${selectedDemo.bpm ? `BPM: ${selectedDemo.bpm}\n` : ""}${selectedDemo.key ? `Key: ${selectedDemo.key}\n` : ""}${selectedDemo.genre ? `Genre: ${selectedDemo.genre}\n` : ""}
TRACK REFERENCE LINKS
${linkLines}${attachmentLine}
Happy to provide anything else you may need.

Best regards,
${producerName}`;
  }, [links, materialLanguage, label, demo.trackName, producerName, producerEmail, producerSc, producerBio, selectedDemo, attachment]);

  const [emailPreview, setEmailPreview] = useState("");
  useEffect(() => {
    if (isOpen) setEmailPreview(buildMaterialEmailBody());
  }, [isOpen, buildMaterialEmailBody]);

  const handleAttachmentChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setAttachment(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        const base64 = result.includes(",") ? result.split(",")[1] : result;
        setAttachment({
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          data: base64,
        });
      }
    };
    reader.onerror = () => {
      toast({
        title: locale === "it" ? "Errore upload file" : "File upload error",
        description: locale === "it" ? "Non è stato possibile leggere il file selezionato." : "The selected file could not be read.",
        variant: "destructive",
      });
    };
    reader.readAsDataURL(file);
  }, [locale, toast]);

  const handleSend = useCallback(async () => {
    if (!gmailAuth?.isConnected) {
      toast({
        title: "Gmail non connesso",
        description: "Connetti Gmail per inviare il materiale.",
        variant: "destructive",
      });
      return;
    }
    if (replyToEmails.length === 0) {
      toast({
        title: "Nessun indirizzo email",
        description: "Impossibile determinare a chi inviare.",
        variant: "destructive",
      });
      return;
    }
    setSending(true);
    try {
      const validAuth = await ensureValidToken(gmailAuth);
      if (!validAuth) {
        toast({ title: "Sessione Gmail scaduta", description: "Riconnetti il tuo account Gmail", variant: "destructive" });
        setSending(false);
        return;
      }
      if (validAuth.accessToken !== gmailAuth.accessToken) {
        setGmailAuth(validAuth);
      }

      const result = await sendReplyInThread(validAuth.accessToken, {
        to: replyToEmails,
        subject: replySubject,
        body: emailPreview,
        threadId: demo.gmailThreadId,
        inReplyToMessageId: demo.gmailReplyMessageId,
        attachments: attachment ? [attachment] : [],
      });

      if (result.success) {
        setSent(true);
        toast({
          title: "Materiale inviato!",
          description: `Email inviata a ${replyToEmails.join(", ")}`,
        });
        // Record the material submission on the demo
        updateDemo(demo.id, {
          materialSentDate: new Date().toISOString(),
          materialSentLinks: links.filter((l) => l.value.trim()).map((l) => l.value.trim()),
          ...(result.threadId && !demo.gmailThreadId ? { gmailThreadId: result.threadId } : {}),
        });
        setTimeout(() => {
          setSent(false);
          setIsOpen(false);
        }, 2500);
      } else {
        toast({ title: "Errore invio", description: result.error || "Errore sconosciuto", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Errore invio", description: err.message || "Errore di connessione", variant: "destructive" });
    } finally {
      setSending(false);
    }
  }, [gmailAuth, replyToEmails, replySubject, emailPreview, demo, links, attachment, setGmailAuth, updateDemo, toast]);

  // Already-sent indicator
  if (demo.materialSentDate && !isOpen) {
    const sentDate = new Date(demo.materialSentDate).toLocaleDateString(locale === "it" ? "it-IT" : "en-US");
    return (
      <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 mt-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span className="text-xs font-medium text-emerald-300">
            {locale === "it" ? `Materiale inviato il ${sentDate}` : `Materials sent on ${sentDate}`}
          </span>
        </div>
        {demo.materialSentLinks && demo.materialSentLinks.length > 0 && (
          <ul className="mt-2 space-y-0.5">
            {demo.materialSentLinks.map((l, i) => (
              <li key={i} className="text-[10px] text-muted-foreground/70 truncate">
                <a href={l} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  {l}
                </a>
              </li>
            ))}
          </ul>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-[10px] text-muted-foreground hover:text-foreground mt-2"
          onClick={() => setIsOpen(true)}
        >
          <Paperclip className="h-3 w-3 mr-1" />
          {locale === "it" ? "Invia altro materiale" : "Send more materials"}
        </Button>
      </div>
    );
  }

  if (!isOpen) {
    return (
      <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 mt-2">
        <div className="flex items-start gap-2">
          <Paperclip className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-emerald-300">
              {locale === "it" ? "Invia materiale alla label" : "Send materials to label"}
            </p>
            <p className="text-[10px] text-emerald-400/70 mt-0.5">
              {locale === "it"
                ? "La label ha mostrato interesse. Invia WAV/stems/dati producer con un click."
                : "Label showed interest. Send WAV/stems/producer info in one click."}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          className="w-full mt-2 bg-emerald-600 hover:bg-emerald-500 text-white"
          onClick={() => setIsOpen(true)}
        >
          <Paperclip className="h-3.5 w-3.5 mr-1.5" />
          {locale === "it" ? "Prepara email materiale" : "Prepare material email"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 mt-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Paperclip className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-[11px] font-medium text-emerald-300">
            {locale === "it" ? "Invia materiale" : "Send materials"}
          </span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-[10px] text-muted-foreground hover:text-foreground"
          onClick={() => setIsOpen(false)}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>

      {/* Producer info — auto-filled from profile */}
      <div className="space-y-2">
        <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider font-medium">
          {locale === "it" ? "Dati producer (dal profilo)" : "Producer info (from profile)"}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <UILabel className="text-[9px] uppercase text-muted-foreground">{locale === "it" ? "Nome" : "Name"}</UILabel>
            <Input value={producerName} onChange={(e) => setProducerName(e.target.value)} className="bg-secondary/50 text-xs h-8" />
          </div>
          <div className="space-y-1">
            <UILabel className="text-[9px] uppercase text-muted-foreground">{locale === "it" ? "Email" : "Email"}</UILabel>
            <Input value={producerEmail} onChange={(e) => setProducerEmail(e.target.value)} className="bg-secondary/50 text-xs h-8" />
          </div>
          <div className="space-y-1 col-span-2">
            <UILabel className="text-[9px] uppercase text-muted-foreground">SoundCloud</UILabel>
            <Input value={producerSc} onChange={(e) => setProducerSc(e.target.value)} className="bg-secondary/50 text-xs h-8" />
          </div>
          <div className="space-y-1 col-span-2">
            <UILabel className="text-[9px] uppercase text-muted-foreground">{locale === "it" ? "Bio (opzionale)" : "Bio (optional)"}</UILabel>
            <Textarea value={producerBio} onChange={(e) => setProducerBio(e.target.value)} rows={2} className="bg-secondary/50 text-xs" />
          </div>
        </div>
      </div>

      {/* Track selector — dropdown of all demos in the database */}
      <div className="space-y-1">
        <UILabel className="text-[10px] uppercase text-muted-foreground">
          {locale === "it" ? "Traccia da inviare" : "Track to send"}
        </UILabel>
        <Select value={selectedDemoId} onValueChange={setSelectedDemoId}>
          <SelectTrigger className="bg-secondary/50 text-sm h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {demos.length === 0 ? (
              <SelectItem value={demo.id} disabled>
                {locale === "it" ? "Nessuna demo nel database" : "No demos in database"}
              </SelectItem>
            ) : (
              demos.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.trackName} {d.bpm ? `· ${d.bpm} BPM` : ""} {d.genre ? `· ${d.genre}` : ""}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        {selectedDemo.id !== demo.id && (
          <p className="text-[10px] text-amber-400/70">
            {locale === "it"
              ? `Attenzione: stai inviando "${selectedDemo.trackName}" invece di "${demo.trackName}"`
              : `Note: you're sending "${selectedDemo.trackName}" instead of "${demo.trackName}"`}
          </p>
        )}
      </div>

      {/* Material links — pre-populated from selected demo, editable */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider font-medium">
            {locale === "it" ? "Link materiale" : "Material links"}
          </p>
          <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={addLink}>
            + {locale === "it" ? "Aggiungi link" : "Add link"}
          </Button>
        </div>
        {links.map((link, i) => (
          <div key={i} className="flex gap-2">
            <Select value={link.type} onValueChange={(v) => updateLink(i, "type", v)}>
              <SelectTrigger className="bg-secondary/50 text-xs h-8 w-[120px] shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="soundcloud">SoundCloud</SelectItem>
                <SelectItem value="wav">WAV</SelectItem>
                <SelectItem value="stems">Stems</SelectItem>
                <SelectItem value="wetransfer">WeTransfer</SelectItem>
                <SelectItem value="dropbox">Dropbox</SelectItem>
                <SelectItem value="google_drive">Google Drive</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={link.value}
              onChange={(e) => updateLink(i, "value", e.target.value)}
              placeholder="https://..."
              className="bg-secondary/50 text-xs h-8 flex-1"
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-muted-foreground hover:text-destructive shrink-0"
              onClick={() => removeLink(i)}
              disabled={links.length === 1}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>

      {/* Language + attachment controls */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider font-medium">
            {locale === "it" ? "Lingua email" : "Email language"}
          </p>
          <Select value={materialLanguage} onValueChange={(value) => setMaterialLanguage(value as "it" | "en")}>
            <SelectTrigger className="bg-secondary/50 text-sm h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="it">Italiano</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider font-medium">
            {locale === "it" ? "Allegato" : "Attachment"}
          </p>
          <Input
            type="file"
            onChange={handleAttachmentChange}
            className="bg-secondary/50 text-xs h-9 file:mr-3 file:rounded file:border-0 file:bg-primary/10 file:px-2 file:py-1 file:text-xs file:text-primary"
          />
          {attachment && (
            <p className="text-[10px] text-emerald-400/70">
              {locale === "it" ? "File allegato:" : "Attached file:"} {attachment.filename}
            </p>
          )}
        </div>
      </div>

      {/* Email preview */}
      <div className="space-y-1">
        <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider font-medium">
          {locale === "it" ? "Anteprima email" : "Email preview"}
        </p>
        <Textarea
          value={emailPreview}
          onChange={(e) => setEmailPreview(e.target.value)}
          rows={14}
          className="bg-secondary/50 text-[11px] font-mono resize-y min-h-[200px]"
          spellCheck={false}
        />
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={handleSend}
          disabled={sending || !emailPreview.trim()}
          className="bg-emerald-600 hover:bg-emerald-500 text-white"
        >
          {sent ? (
            <><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Inviata!</>
          ) : sending ? (
            <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Invio...</>
          ) : (
            <><SendHorizonal className="h-3.5 w-3.5 mr-1.5" />Invia materiale via Gmail</>
          )}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setIsOpen(false)}>
          {t(locale as Locale, "labels.cancel")}
        </Button>
      </div>
    </div>
  );
}

function DemoDetailDialog({
  demo,
  onClose,
  locale,
  getLabelName,
  labels,
  updateDemo,
  userProfile,
  gmailAuth,
  setGmailAuth,
  demos,
  releases,
}: {
  demo: Demo | null;
  onClose: () => void;
  locale: string;
  getLabelName: (id: string) => string;
  labels: Label[];
  updateDemo: (id: string, data: Partial<Demo>) => void;
  userProfile: { artistName: string; scLink: string };
  gmailAuth: any;
  setGmailAuth: (auth: any) => void;
  demos: Demo[];
  releases: Release[];
}) {
  // Pitch generator state — kept inside the dialog component so it persists
  // across re-renders while the dialog is open, and resets when the dialog
  // closes (because the component unmounts when demo === null).
  const [pitchTone, setPitchTone] = useState<PitchTone>("professional");
  const [pitchLanguage, setPitchLanguage] = useState<PitchLanguage>("en");
  const [pitchNote, setPitchNote] = useState("");
  // Manual edits to the pitch preview — when non-null, the user has typed
  // into the textarea and we use their text instead of the auto-generated
  // pitchText. Initialized from demo.pitchText if present (so an existing
  // pitch is editable, not regenerated from scratch).
  const [pitchEditedText, setPitchEditedText] = useState<string | null>(null);
  const [pitchCopied, setPitchCopied] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [pitchSaved, setPitchSaved] = useState(false);
  // 2026-06-25 — whether the in-app email service (Resend) is configured.
  // Checked once on mount; the "Invia dall'app" button is shown only if true.
  const [inAppEmailAvailable, setInAppEmailAvailable] = useState(false);
  const { toast } = useToast();

  // ==================== MULTI-TRACK LINK RESOLUTION ====================
  // Resolves the list of tracks (with their per-track SoundCloud URLs) to
  // render in the dialog. The demo detail previously only showed ONE link
  // (demo.link), which is wrong for multi-track pitches — the user might
  // have sent an "ep-multi" pitch with 2+ tracks, each with its own SC URL,
  // but demo.link only held the first track's URL.
  //
  // Resolution order:
  //   1. demo.pitchTracks (structured field saved by the EP-mode pitch flows)
  //   2. demo.parentReleaseId → look up the Release + its tracks
  //   3. parse pitchText for numbered track entries (back-compat for demos
  //      saved before pitchTracks was added)
  //   4. fallback to single-track: just demo.link + demo.trackName
  const displayTracks = useMemo<PitchTrackEntry[]>(() => {
    if (!demo) return [];

    // (1) Structured pitchTracks field
    if (Array.isArray(demo.pitchTracks) && demo.pitchTracks.length >= 2) {
      return demo.pitchTracks;
    }

    // (2) Belongs to a Release (EP) — look up release + its tracks
    if (demo.parentReleaseId) {
      const release = releases.find((r) => r.id === demo.parentReleaseId);
      if (release && release.trackIds.length >= 2) {
        // If the release has a single EP album URL, surface that (the whole
        // EP is one continuous SoundCloud set, not per-track links).
        if (release.epSoundCloudUrl && release.epSoundCloudUrl.trim()) {
          return [{
            trackName: release.title,
            artistName: release.artists.join(" × "),
            scLink: release.epSoundCloudUrl.trim(),
          }];
        }
        // Otherwise build per-track entries from the release's demos
        const tracksFromRelease: PitchTrackEntry[] = release.trackIds
          .map((tid) => demos.find((d) => d.id === tid))
          .filter((d): d is Demo => !!d)
          .map((d) => ({
            trackName: d.trackName,
            artistName: d.artists && d.artists.length > 0
              ? d.artists.join(" × ")
              : (d.artistName || ""),
            scLink: d.link || "",
          }));
        if (tracksFromRelease.length >= 2) return tracksFromRelease;
      }
    }

    // (3) Parse pitchText for multi-track entries (back-compat)
    if (demo.pitchText) {
      const parsed = parseMultiTrackFromPitchText(demo.pitchText);
      if (parsed.length >= 2) return parsed;
    }

    // (4) Fallback: single-track display
    if (demo.link) {
      return [{
        trackName: demo.trackName,
        artistName: demo.artists && demo.artists.length > 0
          ? demo.artists.join(" × ")
          : (demo.artistName || ""),
        scLink: demo.link,
      }];
    }

    return [];
  }, [demo, releases, demos]);

  // Whether the demo is being shown as a multi-track pitch in the dialog.
  const isMultiTrack = displayTracks.length >= 2;

  const handleTrackStatusChange = useCallback((trackIdx: number, newStatus: TrackStatus) => {
    if (!demo) return;
    let currentTracks = demo.pitchTracks;
    // Fallback if structured pitchTracks not yet saved
    if (!Array.isArray(currentTracks) || currentTracks.length === 0) {
      currentTracks = displayTracks;
    }
    const updatedTracks = currentTracks.map((t, idx) => {
      if (idx === trackIdx) {
        return { ...t, status: newStatus };
      }
      return { ...t, status: t.status || "awaiting" as const };
    });

    const demoUpdates: Partial<Demo> = { pitchTracks: updatedTracks };

    // Determine global demo status & replyStatus based on individual track statuses
    const statuses = updatedTracks.map(t => t.status || "awaiting");
    
    // Filtra gli stati delle tracce che non sono terminali (rifiutate/svincolate)
    // per determinare lo stato di avanzamento "positivo".
    const activeStatuses = statuses.filter(s => s !== 'rejected' && s !== 'declined');

    if (activeStatuses.length === 0) {
      // Se non ci sono stati "attivi", significa che tutte le tracce sono state rifiutate/svincolate.
      demoUpdates.status = "rejected";
      demoUpdates.replyStatus = "rejected";
    } else if (activeStatuses.every(s => s === 'signed')) {
      // Se tutte le tracce attive sono state firmate, l'intera demo è accettata.
      demoUpdates.status = "accepted";
      demoUpdates.replyStatus = "positive";
    } else if (activeStatuses.some(s => ['signed', 'accepted', 'reviewing'].includes(s))) {
      // Se c'è almeno un segnale di interesse (firmata, accettata, in revisione),
      // la demo è in trattativa.
      demoUpdates.status = "reviewing";
      if (activeStatuses.some(s => ['signed', 'accepted'].includes(s))) {
        demoUpdates.replyStatus = "positive"; // Interesse forte
      } else {
        demoUpdates.replyStatus = "info"; // Interesse iniziale
      }
    } else {
      // Se nessuna delle condizioni sopra è vera, significa che le tracce attive
      // sono ancora in attesa di una risposta.
      demoUpdates.status = "sent";
    }

    updateDemo(demo.id, demoUpdates);
    toast({
      title: locale === "it" ? "Stato traccia aggiornato" : "Track status updated",
      description: `${displayTracks[trackIdx]?.trackName || ""} → ${TRACK_STATUS_CONFIG[newStatus][locale === "it" ? "labelIt" : "labelEn"]}`
    });
  }, [demo, displayTracks, updateDemo, toast, locale]);

  // Check on mount whether the in-app email service is available. We do this
  // once per dialog open — cheap GET to /api/email/send.
  useEffect(() => {
    let cancelled = false;
    isInAppEmailConfigured().then((cfg) => {
      if (!cancelled) setInAppEmailAvailable(cfg.configured);
    });
    return () => { cancelled = true; };
  }, []);

  // Resolve the full Label object for this demo — we need its emails,
  // submissionType, and name to generate the pitch and the mailto/gmail links.
  const label = useMemo(
    () => (demo ? labels.find((l) => l.id === demo.labelId) : undefined),
    [demo, labels]
  );

  // Reset pitch state when switching demos (defensive — the dialog also
  // unmounts when demo becomes null, but if the user clicks between demos
  // without closing, we want a fresh state).
  useEffect(() => {
    if (!demo) {
      setPitchTone("professional");
      setPitchLanguage("en");
      setPitchNote("");
      setPitchEditedText(null);
      setPitchCopied(false);
      setSendingEmail(false);
      setEmailSent(false);
      setPitchSaved(false);
    }
  }, [demo]);

  // Generated pitch text (the "suggested" version). We recompute it whenever
  // the demo, label, tone, note, or language changes. If the user has
  // edited the text, displayPitchText (below) overrides this.
  const generatedPitchText = useMemo(() => {
    if (!demo || !label || !demo.trackName.trim()) return "";
    return generatePitch(
      label.name,
      demo.trackName.trim(),
      demo.artistName || userProfile.artistName || "",
      demo.link || userProfile.scLink || "",
      pitchTone,
      pitchNote,
      label.emails || [],
      label.submissionType || "email",
      pitchLanguage
    );
  }, [demo, label, pitchTone, pitchNote, pitchLanguage, userProfile]);

  // Effective pitch text — what's actually shown in the textarea and used
  // by all actions (copy, send, save). Falls back to:
  //   1. pitchEditedText (user has typed) → highest priority
  //   2. demo.pitchText (existing pitch saved on the demo)
  //   3. generatedPitchText (fresh from the generator)
  const displayPitchText = pitchEditedText
    ?? demo?.pitchText
    ?? generatedPitchText
    ?? "";

  // Parse subject + body from the (possibly edited) pitch text. Used by
  // mailto:, Gmail web link, and Gmail API direct send.
  //
  // Resolution order when user hasn't manually edited (pitchEditedText === null):
  //   1. If demo.pitchText exists (saved pitch — possibly multi-track EP),
  //      parse subject/body from it. This is critical: regenerating from
  //      demo.trackName + demo.link loses all EP multi-track info and
  //      produces a single-track pitch with the wrong track name (e.g.
  //      "Demo" placeholder) and only the first SC link.
  //   2. Otherwise, freshly generate a single-track pitch from demo fields.
  // When user HAS edited, parse from displayPitchText (which is pitchEditedText).
  const effectivePitchSubject = useMemo(() => {
    if (pitchEditedText === null) {
      // Prefer the saved pitchText — it's the source of truth for what
      // the user actually wants to send (may be a multi-track EP pitch).
      if (demo?.pitchText) {
        return parsePitchText(demo.pitchText).subject;
      }
      // No saved pitch — generate a fresh single-track subject.
      return generateSubject(
        demo?.trackName?.trim() || "",
        demo?.artistName || userProfile.artistName || "",
        pitchLanguage
      );
    }
    return parsePitchText(displayPitchText).subject;
  }, [pitchEditedText, displayPitchText, demo, userProfile, pitchLanguage]);

  const effectivePitchBody = useMemo(() => {
    if (pitchEditedText === null) {
      // Prefer the saved pitchText — same reasoning as above.
      if (demo?.pitchText) {
        return parsePitchText(demo.pitchText).body;
      }
      // No saved pitch — generate a fresh single-track body.
      if (!demo || !label) return "";
      return generatePitchBody(
        label.name,
        demo.trackName.trim(),
        demo.artistName || userProfile.artistName || "",
        demo.link || userProfile.scLink || "",
        pitchTone,
        pitchNote,
        pitchLanguage
      );
    }
    return parsePitchText(displayPitchText).body;
  }, [pitchEditedText, displayPitchText, demo, label, userProfile, pitchTone, pitchNote, pitchLanguage]);

  const effectiveMailtoLink = useMemo(() => {
    if (!label || !label.emails?.length) return "";
    return generateMailtoLink(label.emails, effectivePitchSubject, effectivePitchBody);
  }, [label, effectivePitchSubject, effectivePitchBody]);

  const effectiveGmailLink = useMemo(() => {
    if (!label) return "";
    return generateGmailLink(label.emails || [], effectivePitchSubject, effectivePitchBody);
  }, [label, effectivePitchSubject, effectivePitchBody]);

  // Actions
  const handlePitchCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(displayPitchText);
      setPitchCopied(true);
      setTimeout(() => setPitchCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = displayPitchText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setPitchCopied(true);
      setTimeout(() => setPitchCopied(false), 2000);
    }
  }, [displayPitchText]);

  const handleSavePitch = useCallback(() => {
    if (!demo) return;
    updateDemo(demo.id, { pitchText: displayPitchText });
    setPitchSaved(true);
    setTimeout(() => setPitchSaved(false), 2000);
  }, [demo, displayPitchText, updateDemo]);

  const handleOpenGmail = useCallback(() => {
    window.open(effectiveGmailLink, "_blank");
  }, [effectiveGmailLink]);

  const handleSendAndTrack = useCallback(() => {
    if (effectiveMailtoLink) {
      window.open(effectiveMailtoLink, "_blank");
    }
    handleSavePitch();
  }, [effectiveMailtoLink, handleSavePitch]);

  const handleDirectSend = useCallback(async () => {
    if (!demo || !gmailAuth?.isConnected) return;
    setSendingEmail(true);
    setEmailSent(false);
    try {
      const validAuth = await ensureValidToken(gmailAuth);
      if (!validAuth) {
        toast({ title: "Sessione Gmail scaduta", description: "Riconnetti il tuo account Gmail", variant: "destructive" });
        setSendingEmail(false);
        return;
      }
      if (validAuth.accessToken !== gmailAuth.accessToken) {
        setGmailAuth(validAuth);
      }
      const result = await sendEmail(validAuth.accessToken, label?.emails || [], effectivePitchSubject, effectivePitchBody);
      if (result.success) {
        setEmailSent(true);
        toast({ title: "Email inviata!", description: `Demo inviato a ${label?.name || ""}` });
        // Save the pitch text + update status to "sent" + record sentDate
        updateDemo(demo.id, {
          pitchText: displayPitchText,
          status: "sent",
          sentDate: new Date().toISOString().split("T")[0],
        });
        setTimeout(() => setEmailSent(false), 4000);
      } else {
        toast({ title: "Errore invio", description: result.error || "Errore sconosciuto", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Errore invio", description: err.message || "Errore di connessione", variant: "destructive" });
    } finally {
      setSendingEmail(false);
    }
  }, [demo, gmailAuth, label, effectivePitchSubject, effectivePitchBody, displayPitchText, updateDemo, setGmailAuth, toast]);

  // 2026-06-25 — in-app email sender via Resend (server-side). Fallback for
  // users who haven't connected Gmail, or who prefer to send through the
  // LabelPulse domain. The from address is fixed server-side (EMAIL_FROM).
  const handleSendInApp = useCallback(async () => {
    if (!demo) return;
    if (!label?.emails?.length) {
      toast({
        title: "Nessun indirizzo email",
        description: "Aggiungi almeno un indirizzo email a questa label prima di inviare.",
        variant: "destructive",
      });
      return;
    }
    setSendingEmail(true);
    setEmailSent(false);
    try {
      const result = await sendEmailInApp(
        label.emails,
        effectivePitchSubject,
        effectivePitchBody
      );
      if (result.success) {
        setEmailSent(true);
        toast({
          title: "Email inviata!",
          description: `Demo inviato a ${label.name}${result.from ? ` (da ${result.from})` : ""}`,
        });
        updateDemo(demo.id, {
          pitchText: displayPitchText,
          status: "sent",
          sentDate: new Date().toISOString().split("T")[0],
        });
        // Track pitch sent via in-app email (Resend)
        void import("@/lib/analytics").then(({ trackEvent }) => {
          trackEvent("pitch_sent_via_inapp", { label_id: label.id, label_name: label.name });
          trackEvent("first_pitch_sent", { method: "in_app" });
        });
        setTimeout(() => setEmailSent(false), 4000);
      } else {
        toast({
          title: "Errore invio",
          description: result.error || "Errore sconosciuto",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Errore invio",
        description: err.message || "Errore di connessione",
        variant: "destructive",
      });
    } finally {
      setSendingEmail(false);
    }
  }, [demo, label, effectivePitchSubject, effectivePitchBody, displayPitchText, updateDemo, toast]);

  if (!demo) return null;

  const config = STATUS_COLORS[demo.status];
  const daysSince = getDaysSince(demo.sentDate);
  const labelName = getLabelName(demo.labelId);
  const hasEmails = !!(label?.emails?.length);

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
                <p className="text-sm font-semibold text-foreground mt-1">{formatDemoDate(demo.sentDate, locale)}</p>
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

          {/* NLP Smart Alert Banner */}
          {demo.nlpMatchedTracks && demo.nlpMatchedTracks.length > 0 && (
            <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-lg p-3 space-y-2 text-sm text-foreground">
              <div className="flex items-start gap-2.5">
                <Sparkles className="h-5 w-5 text-emerald-400 mt-0.5 shrink-0 animate-pulse" />
                <div>
                  <p className="font-semibold text-emerald-400">
                    {locale === "it" ? "Smart Alert — Rilevata traccia d'interesse!" : "Smart Alert — Track of interest detected!"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {locale === "it"
                      ? "Dall'analisi della risposta Gmail della label, sembrano essere interessati alla/e traccia/e: "
                      : "Analyzing the label's reply, they seem interested in the following track(s): "}
                    <strong className="text-foreground">{demo.nlpMatchedTracks.join(", ")}</strong>.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    updateDemo(demo.id, { nlpMatchedTracks: [] });
                  }}
                >
                  {locale === "it" ? "Ignora" : "Dismiss"}
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs bg-emerald-500 hover:bg-emerald-600 text-white font-semibold"
                  onClick={() => {
                    const updatedTracks = demo.pitchTracks?.map((t) => {
                      if (demo.nlpMatchedTracks?.includes(t.trackName)) {
                        return { ...t, status: "reviewing" as const };
                      }
                      return t;
                    }) || [];
                    updateDemo(demo.id, {
                      status: "reviewing",
                      nlpMatchedTracks: [],
                      pitchTracks: updatedTracks,
                      replyStatus: "positive"
                    });
                    toast({
                      title: locale === "it" ? "Stato Aggiornato!" : "Status Updated!",
                      description: locale === "it" ? "Tracce impostate su 'In Trattativa'." : "Tracks updated to 'In Discussion'."
                    });
                  }}
                >
                  {locale === "it" ? "Sì, applica automatico" : "Yes, apply automatically"}
                </Button>
              </div>
            </div>
          )}

          {/* SoundCloud Link(s) — multi-track rendering when the demo is
              actually a multi-track / EP pitch. Previously this only showed
              demo.link (the first track's URL), which was misleading. */}
          {displayTracks.length > 0 && (
            <div className="space-y-1.5">
              <UILabel className="text-xs font-mono uppercase text-muted-foreground flex items-center gap-1">
                <Link2 className="h-3 w-3" />
                {isMultiTrack
                  ? (locale === "it"
                      ? `Link SoundCloud — ${displayTracks.length} tracce`
                      : `SoundCloud Links — ${displayTracks.length} tracks`)
                  : t(locale, "pitch.scLink")}
              </UILabel>
              {displayTracks.length === 1 ? (
                <a
                  href={displayTracks[0].scLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline font-mono break-all"
                >
                  {displayTracks[0].scLink}
                </a>
              ) : (
                <ol className="space-y-1.5">
                  {displayTracks.map((track, idx) => {
                    const trStatus = (demo.pitchTracks && demo.pitchTracks[idx]?.status) || track.status || "awaiting";
                    return (
                      <li
                        key={idx}
                        className="bg-secondary/30 rounded-md p-3 border border-border/30"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-mono text-muted-foreground shrink-0">
                                {idx + 1}.
                              </span>
                              <p className="text-sm font-semibold text-foreground truncate">
                                {track.trackName}
                              </p>
                            </div>
                            {track.artistName && (
                              <p className="text-[10px] text-muted-foreground truncate pl-3.5 mt-0.5">
                                {track.artistName}
                              </p>
                            )}
                            {track.scLink ? (
                              <div className="pl-3.5 mt-1">
                                <a
                                  href={track.scLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-primary hover:underline font-mono break-all"
                                >
                                  {track.scLink}
                                </a>
                              </div>
                            ) : (
                              <p className="text-xs text-amber-500 italic pl-3.5 mt-1">
                                {locale === "it" ? "Link mancante" : "Missing link"}
                              </p>
                            )}
                          </div>
                          
                          {/* Granular Track Status Control */}
                          <div className="flex items-center gap-2 shrink-0 sm:self-center">
                            <Select
                              value={trStatus}
                              onValueChange={(v) => handleTrackStatusChange(idx, v as TrackStatus)}
                            >
                              <SelectTrigger className="bg-secondary/50 text-xs h-7 w-[160px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {(Object.keys(TRACK_STATUS_CONFIG) as TrackStatus[]).map((statusKey) => (
                                  <SelectItem key={statusKey} value={statusKey} className="text-xs">
                                    {locale === "it" ? TRACK_STATUS_CONFIG[statusKey].labelIt : TRACK_STATUS_CONFIG[statusKey].labelEn}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          )}

          {/* Notes */}
          {demo.notes && (
            <div className="space-y-1.5">
              <UILabel className="text-xs font-mono uppercase text-muted-foreground">{t(locale, "labels.notes")}</UILabel>
              <p className="text-sm text-foreground/80">{demo.notes}</p>
            </div>
          )}

          {/* ===================== REPLY TRACKER SECTION ===================== */}
          {/* Lets the user record when a label replies, with the reply text.
              For now this is manual entry; later Gmail API will auto-populate
              these fields by reading the user's inbox. */}
          <ReplyTrackerSection demo={demo} updateDemo={updateDemo} locale={locale} />

          {/* ===================== LABEL REPLY COMPOSER ===================== */}
          {/* Inline Gmail reply — only shown when the label has replied AND
              Gmail is connected. Lets the user reply in the same thread. */}
          {getReplyStatus(demo) !== "none" && (
            <LabelReplyComposer
              demo={demo}
              label={label}
              userProfile={userProfile}
              gmailAuth={gmailAuth}
              setGmailAuth={setGmailAuth}
              updateDemo={updateDemo}
              locale={locale}
              demos={demos}
            />
          )}

          {/* ===================== MATERIAL SUBMISSION FORM ===================== */}
          {/* When the label replies "positive" (interested), this panel lets
              the user send requested materials (WAV/stems/producer info) in
              one click — auto-filled from profile + selected demo's links. */}
          {(getReplyStatus(demo) === "positive" || demo.materialSentDate) && (
            <MaterialSubmissionForm
              demo={demo}
              label={label}
              userProfile={userProfile}
              gmailAuth={gmailAuth}
              setGmailAuth={setGmailAuth}
              updateDemo={updateDemo}
              locale={locale}
              demos={demos}
            />
          )}

          {/* ===================== PITCH SECTION ===================== */}
          {/* Full pitch generator + editor — mirrors the Label Finder dialog.
              Lets the user generate, edit, copy, send, and save a pitch
              directly from the demo detail. */}
          <div className="space-y-3 border-t border-border/30 pt-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                {t(locale, "pitch.preview")}
              </span>
            </div>

            {/* Tone + Language selectors + Note */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <UILabel className="text-[10px] font-mono uppercase text-muted-foreground flex items-center gap-1">
                  <Mail className="h-3 w-3" /> {t(locale, "pitch.tone")}
                </UILabel>
                <Select value={pitchTone} onValueChange={(v) => setPitchTone(v as PitchTone)}>
                  <SelectTrigger className="bg-secondary/50 text-sm h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="professional">{t(locale, "pitch.toneProfessional")}</SelectItem>
                    <SelectItem value="confident">{t(locale, "pitch.toneConfident")}</SelectItem>
                    <SelectItem value="friendly">{t(locale, "pitch.toneFriendly")}</SelectItem>
                    <SelectItem value="storytelling">{t(locale, "pitch.toneStorytelling")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <UILabel className="text-[10px] font-mono uppercase text-muted-foreground flex items-center gap-1">
                  <Languages className="h-3 w-3" /> {t(locale, "pitch.emailLanguage")}
                </UILabel>
                <Select value={pitchLanguage} onValueChange={(v) => setPitchLanguage(v as PitchLanguage)}>
                  <SelectTrigger className="bg-secondary/50 text-sm h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PITCH_LANGUAGES) as PitchLanguage[]).map((lang) => (
                      <SelectItem key={lang} value={lang}>{PITCH_LANGUAGES[lang]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <UILabel className="text-[10px] font-mono uppercase text-muted-foreground">{t(locale, "pitch.additionalNote")}</UILabel>
              <Input value={pitchNote} onChange={(e) => setPitchNote(e.target.value)} placeholder="Optional note..." className="bg-secondary/50 text-sm h-8" />
            </div>

            {/* Pitch preview — editable textarea */}
            {displayPitchText && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1 flex-wrap">
                    {pitchEditedText !== null && (
                      <Badge variant="outline" className="text-[9px] py-0 px-1.5 h-4 border-amber-500/40 text-amber-500">
                        {t(locale, "pitch.edited")}
                      </Badge>
                    )}
                    {demo.pitchText && pitchEditedText === null && (
                      <Badge variant="outline" className="text-[9px] py-0 px-1.5 h-4 border-primary/30 text-primary">
                        {locale === "it" ? "Salvato" : "Saved"}
                      </Badge>
                    )}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {pitchEditedText !== null && (
                      <Button
                        onClick={() => setPitchEditedText(null)}
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-muted-foreground hover:text-foreground"
                        title={t(locale, "pitch.resetToSuggested")}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        {t(locale, "pitch.resetToSuggested")}
                      </Button>
                    )}
                    <Button onClick={handlePitchCopy} size="sm" className="h-7 text-xs border-border/50" variant="outline">
                      {pitchCopied ? <><Check className="h-3 w-3 mr-1" />{t(locale, "pitch.copied")}</> : <><Copy className="h-3 w-3 mr-1" />{t(locale, "pitch.copyToClipboard")}</>}
                    </Button>
                  </div>
                </div>
                <Card className="bg-card/80 border-border/30">
                  <CardContent className="p-3">
                    <textarea
                      value={displayPitchText}
                      onChange={(e) => setPitchEditedText(e.target.value)}
                      spellCheck={false}
                      className="w-full text-[11px] leading-relaxed font-mono text-foreground/80 bg-transparent resize-y min-h-[180px] max-h-[320px] outline-none border-0 focus:ring-0 p-0"
                      aria-label={t(locale, "pitch.preview")}
                    />
                  </CardContent>
                </Card>

                {/* Action buttons */}
                <div className="flex flex-col gap-2">
                  {/* Direct Gmail send — PRIMARY if connected */}
                  {gmailAuth?.isConnected ? (
                    <Button
                      onClick={handleDirectSend}
                      className="w-full text-sm bg-emerald-600 hover:bg-emerald-500 text-white"
                      disabled={sendingEmail}
                    >
                      {emailSent ? (
                        <><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Email inviata!</>
                      ) : sendingEmail ? (
                        <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Invio in corso...</>
                      ) : (
                        <><SendHorizonal className="h-3.5 w-3.5 mr-1.5" />Invia direttamente da Gmail</>
                      )}
                    </Button>
                  ) : (
                    <Button
                      onClick={handleOpenGmail}
                      className="w-full glow-purple text-sm"
                    >
                      <MailOpen className="h-3.5 w-3.5 mr-1.5" />
                      {hasEmails ? t(locale, "pitch.openGmail") : t(locale, "pitch.openGmailNoEmail")}
                    </Button>
                  )}

                  {/* Secondary actions row */}
                  <div className="flex flex-col sm:flex-row gap-2">
                    {/* mailto: link — only when label has email */}
                    {hasEmails && (
                      <Button
                        onClick={handleSendAndTrack}
                        variant="outline"
                        className="flex-1 text-sm border-primary/20"
                      >
                        <Send className="h-3.5 w-3.5 mr-1.5" />
                        {t(locale, "pitch.openEmailClient")}
                      </Button>
                    )}
                    {/* Save pitch to demo */}
                    <Button
                      variant="outline"
                      className="flex-1 text-sm border-border/50"
                      onClick={handleSavePitch}
                    >
                      {pitchSaved ? (
                        <><Check className="h-3.5 w-3.5 mr-1.5" />Salvato</>
                      ) : (
                        <><FileText className="h-3.5 w-3.5 mr-1.5" />Salva Pitch nella Demo</>
                      )}
                    </Button>
                  </div>

                  {/* 2026-06-25 — In-app email sender (Resend). Shown only when:
                        - The server reports it as configured (RESEND_API_KEY present)
                        - The label has at least one email address
                      This is a fallback for users who haven't connected Gmail.
                      Gmail direct send above stays the primary path when connected. */}
                  {inAppEmailAvailable && hasEmails && !gmailAuth?.isConnected && (
                    <div className="pt-2 border-t border-border/30 mt-1">
                      <p className="text-[10px] text-muted-foreground/70 mb-2 text-center">
                        {locale === "it"
                          ? "Oppure invia direttamente dall'app (via Resend):"
                          : "Or send directly from the app (via Resend):"}
                      </p>
                      <Button
                        onClick={handleSendInApp}
                        className="w-full text-sm bg-indigo-600 hover:bg-indigo-500 text-white"
                        disabled={sendingEmail}
                      >
                        {emailSent ? (
                          <><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Email inviata!</>
                        ) : sendingEmail ? (
                          <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Invio in corso...</>
                        ) : (
                          <><SendHorizonal className="h-3.5 w-3.5 mr-1.5" />{locale === "it" ? "Invia dall'app" : "Send from app"}</>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* If no pitch yet and no label/trackname, show hint */}
            {!displayPitchText && (
              <p className="text-xs text-muted-foreground italic">
                {locale === "it"
                  ? "Imposta una label target e un nome traccia per generare il pitch."
                  : "Set a target label and track name to generate a pitch."}
              </p>
            )}
          </div>

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
