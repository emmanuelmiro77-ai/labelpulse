"use client";

import { useAppStore, getLabelTier, type Label } from "@/lib/store";
import { t } from "@/lib/i18n";
import { useState, useMemo, useCallback, useEffect } from "react";
import { sendEmail, ensureValidToken } from "@/lib/gmail";
import {
  Search,
  Plus,
  Filter,
  Mail,
  Globe,
  ExternalLink,
  Pencil,
  Trash2,
  ChevronDown,
  Music2,
  Target,
  TrendingUp,
  Award,
  Zap,
  X,
  Check,
  Link2,
  Save,
  CircleDot,
  Sparkles,
  Copy,
  Send,
  Languages,
  ClipboardCheck,
  MailOpen,
  SendHorizonal,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  generatePitch,
  generateSubject,
  generatePitchBody,
  generateMailtoLink,
  generateGmailLink,
  PITCH_LANGUAGES,
  type PitchTone,
  type PitchLanguage,
} from "@/lib/pitch-utils";

const SUBMISSION_TYPES = ["email", "webform", "platform"] as const;

export function LabelFinder() {
  const { labels, demos, addLabel, updateLabel, deleteLabel, addDemo, locale, getGenres, setActiveTab, userProfile, setUserProfile, gmailAuth, setGmailAuth } =
    useAppStore();
  const genres = getGenres();
  const { toast } = useToast();
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [search, setSearch] = useState("");
  const [genreFilter, setGenreFilter] = useState<string[]>([]);
  const [genrePopoverOpen, setGenrePopoverOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingLabel, setEditingLabel] = useState<Label | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showSmartMatch, setShowSmartMatch] = useState(false);
  const [smartMatchGenre, setSmartMatchGenre] = useState("");

  // Detail dialog state
  const [detailLabel, setDetailLabel] = useState<Label | null>(null);
  const [detailEmails, setDetailEmails] = useState<string[]>([]);
  const [newEmailInput, setNewEmailInput] = useState("");
  const [detailWebsite, setDetailWebsite] = useState("");
  const [detailDemoLink, setDetailDemoLink] = useState("");
  const [detailSocialLink, setDetailSocialLink] = useState("");
  const [detailSoundcloudLink, setDetailSoundcloudLink] = useState("");
  const [detailNotes, setDetailNotes] = useState("");
  const [detailStatus, setDetailStatus] = useState<"open" | "closed">("open");
  const [detailSubmissionType, setDetailSubmissionType] = useState<"email" | "webform" | "platform">("email");
  const [detailSaved, setDetailSaved] = useState(false);

  // Pitch inline state
  const [showPitch, setShowPitch] = useState(false);
  const [pitchTrackName, setPitchTrackName] = useState("");
  const [pitchScLink, setPitchScLink] = useState("");
  const [pitchArtistName, setPitchArtistName] = useState("");
  const [pitchTone, setPitchTone] = useState<PitchTone>("professional");
  const [pitchLanguage, setPitchLanguage] = useState<PitchLanguage>("en");
  const [pitchNote, setPitchNote] = useState("");
  const [pitchCopied, setPitchCopied] = useState(false);
  const [pitchDemoCreated, setPitchDemoCreated] = useState(false);

  // Add label form state
  const [formName, setFormName] = useState("");
  const [formGenre, setFormGenre] = useState(genres[0] || "Techno");
  const [formSubmissionType, setFormSubmissionType] = useState<
    "email" | "webform" | "platform"
  >("email");
  const [formContact, setFormContact] = useState("");
  const [formStatus, setFormStatus] = useState<"open" | "closed">("open");
  const [formNotes, setFormNotes] = useState("");

  const filteredLabels = useMemo(() => {
    return labels.filter((l) => {
      const matchSearch =
        !search ||
        l.name.toLowerCase().includes(search.toLowerCase()) ||
        l.genres.some((g) => g.toLowerCase().includes(search.toLowerCase())) ||
        l.contactInfo.toLowerCase().includes(search.toLowerCase()) ||
        l.emails.some((e) => e.toLowerCase().includes(search.toLowerCase()));
      const matchGenre =
        genreFilter.length === 0 ||
        genreFilter.every((g) => l.genres.includes(g));
      const matchStatus =
        statusFilter === "all" || l.status === statusFilter;
      return matchSearch && matchGenre && matchStatus;
    });
  }, [labels, search, genreFilter, statusFilter]);

  const toggleGenre = (genre: string) => {
    setGenreFilter((prev) =>
      prev.includes(genre)
        ? prev.filter((g) => g !== genre)
        : [...prev, genre]
    );
  };

  const clearGenreFilter = () => {
    setGenreFilter([]);
    setGenrePopoverOpen(false);
  };

  // Smart Match results
  const smartMatchResults = useMemo(() => {
    if (!smartMatchGenre) return { top: [], mid: [], emerging: [] };
    const genreLabels = labels.filter((l) =>
      l.genres.includes(smartMatchGenre)
    );
    const top = genreLabels
      .filter((l) => l.rankByGenre?.[smartMatchGenre] && l.rankByGenre[smartMatchGenre] <= 20)
      .sort((a, b) => (a.rankByGenre?.[smartMatchGenre] || 999) - (b.rankByGenre?.[smartMatchGenre] || 999));
    const mid = genreLabels
      .filter((l) => l.rankByGenre?.[smartMatchGenre] && l.rankByGenre[smartMatchGenre] > 20 && l.rankByGenre[smartMatchGenre] <= 50)
      .sort((a, b) => (a.rankByGenre?.[smartMatchGenre] || 999) - (b.rankByGenre?.[smartMatchGenre] || 999));
    const emerging = genreLabels
      .filter((l) => l.trending && !top.includes(l) && !mid.includes(l))
      .sort((a, b) => (b.trendingPointsByGenre?.[smartMatchGenre] || 0) - (a.trendingPointsByGenre?.[smartMatchGenre] || 0))
      .slice(0, 15);
    return { top, mid, emerging };
  }, [labels, smartMatchGenre]);

  const resetForm = () => {
    setFormName("");
    setFormGenre(genres[0] || "Techno");
    setFormSubmissionType("email");
    setFormContact("");
    setFormStatus("open");
    setFormNotes("");
  };

  const openAdd = () => {
    resetForm();
    setEditingLabel(null);
    setShowAddDialog(true);
  };

  // Open detail dialog
  const openDetail = useCallback((label: Label) => {
    setDetailLabel(label);
    setDetailEmails(label.emails?.length ? [...label.emails] : (label.contactInfo ? [label.contactInfo] : []));
    setDetailWebsite(label.website || "");
    setDetailDemoLink(label.demoLink || "");
    setDetailSocialLink(label.socialLink || "");
    setDetailSoundcloudLink(label.soundcloudLink || "");
    setDetailNotes(label.notes || "");
    setDetailStatus(label.status);
    setDetailSubmissionType(label.submissionType);
    setDetailSaved(false);
    setShowPitch(false);
    setPitchTrackName("");
    setPitchArtistName(userProfile.artistName || "");
    setPitchScLink(userProfile.scLink || "");
    setPitchTone("professional");
    setPitchLanguage("en");
    setPitchNote("");
    setPitchCopied(false);
    setPitchDemoCreated(false);
  }, [userProfile]);

  // Keep detailLabel in sync with store (in case store changes externally)
  useEffect(() => {
    if (!detailLabel) return;
    const fresh = labels.find(l => l.id === detailLabel.id);
    if (!fresh) {
      // Label was deleted — close dialog
      setDetailLabel(null);
    } else if (fresh !== detailLabel) {
      // Store version changed — update snapshot
      setDetailLabel(fresh);
    }
  }, [labels, detailLabel]);

  // Auto-save detail changes (with safety check)
  const saveDetailField = useCallback(
    (field: string, value: any) => {
      if (!detailLabel) return;
      // Double-check the label still exists in the store
      const exists = labels.find(l => l.id === detailLabel.id);
      if (!exists) return;
      updateLabel(detailLabel.id, { [field]: value });
      setDetailSaved(true);
      setTimeout(() => setDetailSaved(false), 1500);
    },
    [detailLabel, updateLabel, labels]
  );

  // Email management
  const addEmail = useCallback(() => {
    const email = newEmailInput.trim();
    if (!email || !email.includes("@")) return;
    const updated = [...detailEmails, email];
    setDetailEmails(updated);
    setNewEmailInput("");
    if (detailLabel) {
      updateLabel(detailLabel.id, { emails: updated, contactInfo: updated[0] || "" });
      setDetailSaved(true);
      setTimeout(() => setDetailSaved(false), 1500);
    }
  }, [detailEmails, newEmailInput, detailLabel, updateLabel]);

  const removeEmail = useCallback((index: number) => {
    const updated = detailEmails.filter((_, i) => i !== index);
    setDetailEmails(updated);
    if (detailLabel) {
      updateLabel(detailLabel.id, { emails: updated, contactInfo: updated[0] || "" });
      setDetailSaved(true);
      setTimeout(() => setDetailSaved(false), 1500);
    }
  }, [detailEmails, detailLabel, updateLabel]);

  // Pitch generation
  const pitchText = useMemo(() => {
    if (!detailLabel || !pitchTrackName.trim()) return "";
    return generatePitch(
      detailLabel.name,
      pitchTrackName.trim(),
      pitchArtistName,
      pitchScLink,
      pitchTone,
      pitchNote,
      detailEmails,
      detailSubmissionType,
      pitchLanguage
    );
  }, [detailLabel, pitchTrackName, pitchArtistName, pitchScLink, pitchTone, pitchNote, detailEmails, detailSubmissionType, pitchLanguage]);

  // Mailto link for opening email client
  const pitchMailtoLink = useMemo(() => {
    if (!detailLabel || !pitchTrackName.trim() || !detailEmails.length) return "";
    const subject = generateSubject(pitchTrackName.trim(), pitchArtistName, pitchLanguage);
    const body = generatePitchBody(
      detailLabel.name,
      pitchTrackName.trim(),
      pitchArtistName,
      pitchScLink,
      pitchTone,
      pitchNote,
      pitchLanguage
    );
    return generateMailtoLink(detailEmails, subject, body);
  }, [detailLabel, pitchTrackName, pitchArtistName, pitchScLink, pitchTone, pitchNote, detailEmails, pitchLanguage]);

  // Gmail link for opening Gmail in browser
  const pitchGmailLink = useMemo(() => {
    if (!detailLabel || !pitchTrackName.trim()) return "";
    const subject = generateSubject(pitchTrackName.trim(), pitchArtistName, pitchLanguage);
    const body = generatePitchBody(
      detailLabel.name,
      pitchTrackName.trim(),
      pitchArtistName,
      pitchScLink,
      pitchTone,
      pitchNote,
      pitchLanguage
    );
    return generateGmailLink(detailEmails, subject, body);
  }, [detailLabel, pitchTrackName, pitchArtistName, pitchScLink, pitchTone, pitchNote, detailEmails, pitchLanguage]);

  // Check if a demo already exists for this label + track
  const demoAlreadyExists = useMemo(() => {
    if (!detailLabel || !pitchTrackName.trim()) return false;
    return demos.some(
      (d) => d.labelId === detailLabel.id && d.trackName.toLowerCase() === pitchTrackName.trim().toLowerCase()
    );
  }, [demos, detailLabel, pitchTrackName]);

  // Save profile fields on blur
  const handlePitchArtistBlur = useCallback(() => {
    if (pitchArtistName.trim() && pitchArtistName.trim() !== userProfile.artistName) {
      setUserProfile({ artistName: pitchArtistName.trim() });
    }
  }, [pitchArtistName, userProfile.artistName, setUserProfile]);

  const handlePitchScLinkBlur = useCallback(() => {
    if (pitchScLink.trim() && pitchScLink.trim() !== userProfile.scLink) {
      setUserProfile({ scLink: pitchScLink.trim() });
    }
  }, [pitchScLink, userProfile.scLink, setUserProfile]);

  // Open Gmail and auto-create demo
  const handleOpenGmail = useCallback(() => {
    if (!detailLabel || !pitchTrackName.trim()) return;
    window.open(pitchGmailLink, "_blank");
    if (!demoAlreadyExists) {
      addDemo({
        trackName: pitchTrackName.trim(),
        labelId: detailLabel.id,
        status: "sent",
        sentDate: new Date().toISOString().split("T")[0],
        link: pitchScLink.trim(),
        notes: pitchNote.trim(),
        pitchText: pitchText,
        artistName: pitchArtistName.trim(),
      });
      setPitchDemoCreated(true);
    }
  }, [detailLabel, pitchTrackName, pitchScLink, pitchNote, pitchGmailLink, demoAlreadyExists, addDemo, pitchText, pitchArtistName]);

  // Open email client (mailto:) and auto-create demo
  const handleSendAndTrack = useCallback(() => {
    if (!detailLabel || !pitchTrackName.trim()) return;
    if (pitchMailtoLink) {
      window.open(pitchMailtoLink, "_blank");
    }
    if (!demoAlreadyExists) {
      addDemo({
        trackName: pitchTrackName.trim(),
        labelId: detailLabel.id,
        status: "sent",
        sentDate: new Date().toISOString().split("T")[0],
        link: pitchScLink.trim(),
        notes: pitchNote.trim(),
        pitchText: pitchText,
        artistName: pitchArtistName.trim(),
      });
      setPitchDemoCreated(true);
    }
  }, [detailLabel, pitchTrackName, pitchScLink, pitchNote, pitchMailtoLink, demoAlreadyExists, addDemo, pitchText, pitchArtistName]);

  // Send email directly via Gmail API (no browser open needed!)
  const handleDirectSend = useCallback(async () => {
    if (!detailLabel || !pitchTrackName.trim() || !gmailAuth.isConnected) return;

    setSendingEmail(true);
    setEmailSent(false);

    try {
      // Ensure token is still valid
      const validAuth = await ensureValidToken(gmailAuth);
      if (!validAuth) {
        toast({ title: "Sessione Gmail scaduta", description: "Riconnetti il tuo account Gmail", variant: "destructive" });
        setSendingEmail(false);
        return;
      }
      // Update auth if refreshed
      if (validAuth.accessToken !== gmailAuth.accessToken) {
        setGmailAuth(validAuth);
      }

      const subject = generateSubject(pitchTrackName.trim(), pitchArtistName, pitchLanguage);
      const body = generatePitchBody(
        detailLabel.name,
        pitchTrackName.trim(),
        pitchArtistName,
        pitchScLink,
        pitchTone,
        pitchNote,
        pitchLanguage
      );

      const result = await sendEmail(
        validAuth.accessToken,
        detailEmails,
        subject,
        body
      );

      if (result.success) {
        setEmailSent(true);
        toast({ title: "Email inviata! ✉️", description: `Demo inviato a ${detailLabel.name}` });
        // Auto-create demo tracking
        if (!demoAlreadyExists) {
          addDemo({
            trackName: pitchTrackName.trim(),
            labelId: detailLabel.id,
            status: "sent",
            sentDate: new Date().toISOString().split("T")[0],
            link: pitchScLink.trim(),
            notes: pitchNote.trim(),
            pitchText: pitchText,
            artistName: pitchArtistName.trim(),
          });
          setPitchDemoCreated(true);
        }
        setTimeout(() => setEmailSent(false), 4000);
      } else {
        toast({ title: "Errore invio", description: result.error || "Errore sconosciuto", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Errore invio", description: err.message || "Errore di connessione", variant: "destructive" });
    } finally {
      setSendingEmail(false);
    }
  }, [detailLabel, pitchTrackName, pitchArtistName, pitchScLink, pitchTone, pitchNote, pitchLanguage, detailEmails, gmailAuth, demoAlreadyExists, addDemo, pitchText, setGmailAuth, toast]);

  const handlePitchCopy = async () => {
    try {
      await navigator.clipboard.writeText(pitchText);
      setPitchCopied(true);
      setTimeout(() => setPitchCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = pitchText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setPitchCopied(true);
      setTimeout(() => setPitchCopied(false), 2000);
    }
  };

  const handleSave = () => {
    if (!formName.trim()) return;
    const data = {
      name: formName.trim(),
      genre: formGenre,
      submissionType: formSubmissionType,
      contactInfo: formContact.trim(),
      status: formStatus,
      notes: formNotes.trim(),
    };
    if (editingLabel) {
      updateLabel(editingLabel.id, data);
    } else {
      addLabel(data);
    }
    setShowAddDialog(false);
    resetForm();
  };

  const handleDelete = (id: string) => {
    deleteLabel(id);
    setDeleteConfirmId(null);
  };

  const getSubmissionLabel = (type: string) => {
    switch (type) {
      case "email":
        return t(locale, "labels.email");
      case "webform":
        return t(locale, "labels.webform");
      default:
        return t(locale, "labels.platform");
    }
  };

  const getTierBadge = (label: Label) => {
    const genre = genreFilter.length > 0 ? genreFilter[0] : label.genres[0];
    const tier = getLabelTier(label, genre);
    if (!tier) return null;
    if (tier === "top")
      return (
        <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-[10px] px-1.5 py-0">
          🟣 {t(locale, "labels.tierTop")}
        </Badge>
      );
    if (tier === "mid")
      return (
        <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-[10px] px-1.5 py-0">
          🔵 {t(locale, "labels.tierMid")}
        </Badge>
      );
    return (
      <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[10px] px-1.5 py-0">
        🟢 {t(locale, "labels.tierEmerging")}
      </Badge>
    );
  };

  const getBestRank = (label: Label, genre?: string) => {
    if (genre && label.rankByGenre?.[genre]) return `#${label.rankByGenre[genre]}`;
    const ranks = Object.values(label.rankByGenre || {});
    if (ranks.length === 0) return null;
    return `#${Math.min(...ranks)}`;
  };

  const hasUserData = (label: Label) => {
    return !!(
      label.contactInfo ||
      (label.emails && label.emails.length > 0) ||
      label.website ||
      label.demoLink ||
      label.socialLink ||
      label.soundcloudLink ||
      label.notes
    );
  };

  return (
    <div className="space-y-4">
      {/* Filters + Smart Match */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t(locale, "labels.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-secondary/50 border-border/50"
          />
        </div>
        <Popover open={genrePopoverOpen} onOpenChange={setGenrePopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full sm:w-auto min-w-[180px] max-w-[320px] bg-secondary/50 border-border/50 justify-start h-9 px-3">
              <Filter className="h-3.5 w-3.5 mr-1.5 shrink-0" />
              {genreFilter.length === 0 ? (
                <span className="text-muted-foreground">{t(locale, "labels.allGenres")}</span>
              ) : (
                <span className="truncate flex items-center gap-1">
                  {genreFilter.length === 1 ? genreFilter[0] : (
                    <>
                      {genreFilter.slice(0, 2).map((g) => (
                        <Badge key={g} className="bg-primary/20 text-primary border-primary/30 text-[10px] px-1.5 py-0 leading-4">{g}</Badge>
                      ))}
                      {genreFilter.length > 2 && <span className="text-[10px] text-muted-foreground">+{genreFilter.length - 2}</span>}
                    </>
                  )}
                </span>
              )}
              <ChevronDown className="h-3 w-3 ml-auto shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0 bg-card border-border/50" align="start">
            <div className="p-2 border-b border-border/30">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t(locale, "labels.filterByGenre")}</span>
                {genreFilter.length > 0 && (
                  <Button variant="ghost" size="sm" className="h-5 text-[10px] text-muted-foreground hover:text-foreground px-1.5" onClick={clearGenreFilter}>
                    <X className="h-2.5 w-2.5 mr-0.5" />{t(locale, "labels.clearFilter")}
                  </Button>
                )}
              </div>
              {genreFilter.length > 0 && (
                <p className="text-[10px] text-primary/70 mt-1">
                  {t(locale, "labels.andLogic")} ({genreFilter.length} {genreFilter.length === 1 ? t(locale, "labels.genreSingular") : t(locale, "labels.genrePlural")})
                </p>
              )}
            </div>
            <div className="max-h-[280px] overflow-y-auto p-1">
              {genres.map((g) => {
                const isSelected = genreFilter.includes(g);
                return (
                  <button key={g} onClick={() => toggleGenre(g)} className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm hover:bg-secondary/50 transition-colors text-left">
                    <Checkbox checked={isSelected} className="pointer-events-none" />
                    <span className={isSelected ? "text-foreground font-medium" : "text-muted-foreground"}>{g}</span>
                    {isSelected && <Check className="h-3 w-3 ml-auto text-primary" />}
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[150px] bg-secondary/50 border-border/50">
            <ChevronDown className="h-3.5 w-3.5 mr-1.5 shrink-0" />
            <SelectValue placeholder={t(locale, "labels.allStatus")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t(locale, "labels.allStatus")}</SelectItem>
            <SelectItem value="open">{t(locale, "labels.open")}</SelectItem>
            <SelectItem value="closed">{t(locale, "labels.closed")}</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => setShowSmartMatch(true)} variant="outline" className="border-primary/30 text-primary hover:bg-primary/10 shrink-0">
          <Target className="h-4 w-4 mr-1.5" />{t(locale, "labels.smartMatch")}
        </Button>
        <Button onClick={openAdd} className="glow-purple shrink-0">
          <Plus className="h-4 w-4 mr-1.5" />{t(locale, "labels.addLabel")}
        </Button>
      </div>

      {/* Results count */}
      <p className="text-xs text-muted-foreground font-mono">
        {filteredLabels.length} {t(locale, "labels.found")}
      </p>

      {/* Labels list */}
      <div className="grid gap-2">
        {filteredLabels.slice(0, 100).map((label) => {
          const bestGenre = genreFilter.length > 0 ? genreFilter[0] : label.genres[0];
          const rank = getBestRank(label, bestGenre);
          const enriched = hasUserData(label);
          return (
            <Card key={label.id} className="bg-card/60 border-border/40 hover:border-primary/30 transition-all group cursor-pointer" onClick={() => openDetail(label)}>
              <CardContent className="p-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Music2 className="h-3.5 w-3.5 text-primary shrink-0" />
                      <h3 className="font-semibold text-foreground text-sm truncate">{label.name}</h3>
                      {enriched && (
                        <Badge className="bg-primary/15 text-primary border-primary/20 text-[10px] px-1.5 py-0">
                          <CircleDot className="h-2.5 w-2.5 mr-0.5" />{t(locale, "labels.enriched")}
                        </Badge>
                      )}
                      {label.trending && (
                        <Badge className="bg-orange-500/20 text-orange-300 border-orange-500/30 text-[10px] px-1.5 py-0">
                          <TrendingUp className="h-2.5 w-2.5 mr-0.5" />🔥
                        </Badge>
                      )}
                      {rank && (
                        <span className="text-[10px] font-mono text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded">
                          {t(locale, "labels.rank")} {rank}
                        </span>
                      )}
                      {getTierBadge(label)}
                      <Badge variant={label.status === "open" ? "default" : "secondary"}
                        className={label.status === "open" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px] px-1.5 py-0" : "bg-red-500/20 text-red-400 border-red-500/30 text-[10px] px-1.5 py-0"}>
                        {label.status === "open" ? t(locale, "labels.open") : t(locale, "labels.closed")}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[11px] text-muted-foreground">
                      <span className="text-primary/60 font-medium truncate max-w-[200px]">{bestGenre || label.genre}</span>
                      {label.emails && label.emails.length > 0 && (
                        <span className="font-mono truncate max-w-[200px] flex items-center gap-0.5">
                          <Mail className="h-2.5 w-2.5" /> {label.emails[0]}{label.emails.length > 1 ? ` +${label.emails.length - 1}` : ""}
                        </span>
                      )}
                      {!label.emails?.length && label.contactInfo && (
                        <span className="font-mono truncate max-w-[200px] flex items-center gap-0.5">
                          <Mail className="h-2.5 w-2.5" /> {label.contactInfo}
                        </span>
                      )}
                      {label.website && (
                        <span className="font-mono truncate max-w-[160px] flex items-center gap-0.5">
                          <Globe className="h-2.5 w-2.5" /> {label.website}
                        </span>
                      )}
                      {bestGenre && label.pointsByGenre?.[bestGenre] && (
                        <span className="font-mono text-muted-foreground/50">
                          {label.pointsByGenre[bestGenre].toLocaleString()} {t(locale, "labels.points")}
                        </span>
                      )}
                    </div>
                  </div>
                  {label.isCustom && (
                    <div className="flex items-center gap-1 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(label.id); }}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}

        {filteredLabels.length > 100 && (
          <p className="text-xs text-muted-foreground text-center py-2">
            ...{t(locale, "labels.andOther")} {filteredLabels.length - 100} {t(locale, "labels.labelsLower")}. {t(locale, "labels.useFilters")}
          </p>
        )}
        {filteredLabels.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Music2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{t(locale, "labels.noLabels")}</p>
          </div>
        )}
      </div>

      {/* =========== DETAIL DIALOG =========== */}
      <Dialog open={!!detailLabel} onOpenChange={(open) => { if (!open) setDetailLabel(null); }}>
        <DialogContent className="sm:max-w-2xl bg-card border-border/50 max-h-[90vh] overflow-y-auto">
          {detailLabel && (() => {
            const bestGenre = genreFilter.length > 0 ? genreFilter[0] : detailLabel.genres[0];
            const rank = getBestRank(detailLabel, bestGenre);
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 flex-wrap">
                    <Music2 className="h-5 w-5 text-primary" />
                    <span>{detailLabel.name}</span>
                    {rank && <span className="text-xs font-mono text-primary/70 bg-primary/10 px-2 py-0.5 rounded">{t(locale, "labels.rank")} {rank}</span>}
                    {getTierBadge(detailLabel)}
                    {detailLabel.trending && <Badge className="bg-orange-500/20 text-orange-300 border-orange-500/30 text-[10px] px-1.5 py-0">🔥 Trending</Badge>}
                  </DialogTitle>
                </DialogHeader>

                {/* Beatport data (read-only) */}
                <div className="space-y-3 pb-3 border-b border-border/30">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{t(locale, "labels.beatportData")}</p>
                  <div className="flex flex-wrap gap-2">
                    {detailLabel.genres.map((g) => (
                      <Badge key={g} variant="secondary" className="text-[10px] bg-secondary/50">
                        {g}{detailLabel.rankByGenre?.[g] && <span className="ml-1 text-primary/60">#{detailLabel.rankByGenre[g]}</span>}
                      </Badge>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {bestGenre && detailLabel.rankByGenre?.[bestGenre] && (
                      <div className="bg-secondary/30 rounded-lg p-2">
                        <p className="text-[10px] text-muted-foreground uppercase">{t(locale, "labels.rank")}</p>
                        <p className="text-lg font-bold text-primary">#{detailLabel.rankByGenre[bestGenre]}</p>
                      </div>
                    )}
                    {bestGenre && detailLabel.pointsByGenre?.[bestGenre] && (
                      <div className="bg-secondary/30 rounded-lg p-2">
                        <p className="text-[10px] text-muted-foreground uppercase">{t(locale, "labels.points")}</p>
                        <p className="text-lg font-bold text-foreground">{detailLabel.pointsByGenre[bestGenre].toLocaleString()}</p>
                      </div>
                    )}
                    <div className="bg-secondary/30 rounded-lg p-2">
                      <p className="text-[10px] text-muted-foreground uppercase">{t(locale, "labels.status")}</p>
                      <p className={`text-sm font-bold ${detailLabel.status === "open" ? "text-emerald-400" : "text-red-400"}`}>
                        {detailLabel.status === "open" ? t(locale, "labels.open") : t(locale, "labels.closed")}
                      </p>
                    </div>
                  </div>
                </div>

                {/* User-editable fields with auto-save */}
                <div className="space-y-4 py-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{t(locale, "labels.yourData")}</p>
                    {detailSaved && (
                      <span className="text-[10px] text-emerald-400 flex items-center gap-1 animate-pulse">
                        <Save className="h-2.5 w-2.5" /> {t(locale, "labels.saved")}
                      </span>
                    )}
                  </div>

                  {/* Multiple emails */}
                  <div className="space-y-1.5">
                    <UILabel className="text-xs font-mono uppercase text-muted-foreground flex items-center gap-1.5">
                      <Mail className="h-3 w-3" /> {t(locale, "labels.demoEmails")}
                    </UILabel>
                    <div className="space-y-1.5">
                      {detailEmails.map((email, idx) => (
                        <div key={idx} className="flex items-center gap-1.5">
                          <div className="flex-1 px-3 py-1.5 rounded-md bg-secondary/50 border border-border/30 text-sm font-mono text-foreground flex items-center justify-between">
                            <span className="truncate">{email}</span>
                            <button
                              onClick={() => removeEmail(idx)}
                              className="text-muted-foreground hover:text-destructive transition-colors shrink-0 ml-2"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                          {idx === 0 && detailEmails.length > 1 && (
                            <Badge className="text-[8px] bg-primary/10 text-primary border-primary/20 px-1 py-0 shrink-0">TO</Badge>
                          )}
                          {idx > 0 && (
                            <Badge className="text-[8px] bg-secondary/50 text-muted-foreground border-border/30 px-1 py-0 shrink-0">CC</Badge>
                          )}
                        </div>
                      ))}
                      <div className="flex gap-1.5">
                        <Input
                          value={newEmailInput}
                          onChange={(e) => setNewEmailInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEmail(); } }}
                          placeholder={t(locale, "labels.addEmailPlaceholder")}
                          className="bg-secondary/50 text-sm"
                        />
                        <Button variant="outline" size="sm" onClick={addEmail} disabled={!newEmailInput.trim() || !newEmailInput.includes("@")} className="shrink-0">
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <UILabel className="text-xs font-mono uppercase text-muted-foreground flex items-center gap-1.5">
                      <Globe className="h-3 w-3" /> {t(locale, "labels.website")}
                    </UILabel>
                    <Input value={detailWebsite} onChange={(e) => setDetailWebsite(e.target.value)}
                      onBlur={() => saveDetailField("website", detailWebsite)} placeholder="https://www.label.com" className="bg-secondary/50" />
                  </div>

                  <div className="space-y-1.5">
                    <UILabel className="text-xs font-mono uppercase text-muted-foreground flex items-center gap-1.5">
                      <Link2 className="h-3 w-3" /> {t(locale, "labels.demoLink")}
                    </UILabel>
                    <Input value={detailDemoLink} onChange={(e) => setDetailDemoLink(e.target.value)}
                      onBlur={() => saveDetailField("demoLink", detailDemoLink)} placeholder="https://www.label.com/submit-demo" className="bg-secondary/50" />
                  </div>

                  <div className="space-y-1.5">
                    <UILabel className="text-xs font-mono uppercase text-muted-foreground flex items-center gap-1.5">
                      <ExternalLink className="h-3 w-3" /> {t(locale, "labels.socialLink")}
                    </UILabel>
                    <Input value={detailSocialLink} onChange={(e) => setDetailSocialLink(e.target.value)}
                      onBlur={() => saveDetailField("socialLink", detailSocialLink)} placeholder="https://instagram.com/label" className="bg-secondary/50" />
                  </div>

                  <div className="space-y-1.5">
                    <UILabel className="text-xs font-mono uppercase text-muted-foreground flex items-center gap-1.5">
                      <Music2 className="h-3 w-3" /> {t(locale, "labels.soundcloudLink")}
                    </UILabel>
                    <Input value={detailSoundcloudLink} onChange={(e) => setDetailSoundcloudLink(e.target.value)}
                      onBlur={() => saveDetailField("soundcloudLink", detailSoundcloudLink)} placeholder="https://soundcloud.com/label" className="bg-secondary/50" />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <UILabel className="text-xs font-mono uppercase text-muted-foreground">{t(locale, "labels.submissionType")}</UILabel>
                      <Select value={detailSubmissionType} onValueChange={(v) => {
                        const val = v as "email" | "webform" | "platform";
                        setDetailSubmissionType(val);
                        if (detailLabel) updateLabel(detailLabel.id, { submissionType: val });
                        setDetailSaved(true); setTimeout(() => setDetailSaved(false), 1500);
                      }}>
                        <SelectTrigger className="bg-secondary/50"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {SUBMISSION_TYPES.map((type) => (<SelectItem key={type} value={type}>{getSubmissionLabel(type)}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <UILabel className="text-xs font-mono uppercase text-muted-foreground">{t(locale, "labels.status")}</UILabel>
                      <Select value={detailStatus} onValueChange={(v) => {
                        const val = v as "open" | "closed";
                        setDetailStatus(val);
                        if (detailLabel) updateLabel(detailLabel.id, { status: val });
                        setDetailSaved(true); setTimeout(() => setDetailSaved(false), 1500);
                      }}>
                        <SelectTrigger className="bg-secondary/50"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">{t(locale, "labels.open")}</SelectItem>
                          <SelectItem value="closed">{t(locale, "labels.closed")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <UILabel className="text-xs font-mono uppercase text-muted-foreground">{t(locale, "labels.notes")}</UILabel>
                    <Textarea value={detailNotes} onChange={(e) => setDetailNotes(e.target.value)}
                      onBlur={() => saveDetailField("notes", detailNotes)} placeholder={t(locale, "labels.notesPlaceholder")} rows={2} className="bg-secondary/50 resize-none" />
                  </div>
                </div>

                {/* Pitch Section */}
                <div className="border-t border-border/30 pt-3">
                  <Button
                    variant="outline"
                    className="w-full border-primary/30 text-primary hover:bg-primary/10"
                    onClick={() => setShowPitch(!showPitch)}
                  >
                    <Sparkles className="h-4 w-4 mr-1.5" />
                    {showPitch ? t(locale, "labels.hidePitch") : t(locale, "labels.generatePitch")}
                  </Button>

                  {showPitch && (
                    <div className="space-y-3 mt-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <UILabel className="text-xs font-mono uppercase text-muted-foreground">{t(locale, "pitch.trackName")}</UILabel>
                          <Input value={pitchTrackName} onChange={(e) => { setPitchTrackName(e.target.value); setPitchDemoCreated(false); }} placeholder="e.g. Midnight Drive" className="bg-secondary/50 text-sm" />
                        </div>
                        <div className="space-y-1.5">
                          <UILabel className="text-xs font-mono uppercase text-muted-foreground">{t(locale, "pitch.artistName")}</UILabel>
                          <Input value={pitchArtistName} onChange={(e) => setPitchArtistName(e.target.value)} onBlur={handlePitchArtistBlur} placeholder="e.g. Traacia" className="bg-secondary/50 text-sm" />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                          <UILabel className="text-xs font-mono uppercase text-muted-foreground">{t(locale, "pitch.scLink")}</UILabel>
                          <Input value={pitchScLink} onChange={(e) => setPitchScLink(e.target.value)} onBlur={handlePitchScLinkBlur} placeholder="https://soundcloud.com/..." className="bg-secondary/50 text-sm" />
                        </div>
                        <div className="space-y-1.5">
                          <UILabel className="text-xs font-mono uppercase text-muted-foreground">{t(locale, "pitch.tone")}</UILabel>
                          <Select value={pitchTone} onValueChange={(v) => setPitchTone(v as PitchTone)}>
                            <SelectTrigger className="bg-secondary/50 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="professional">{t(locale, "pitch.toneProfessional")}</SelectItem>
                              <SelectItem value="confident">{t(locale, "pitch.toneConfident")}</SelectItem>
                              <SelectItem value="friendly">{t(locale, "pitch.toneFriendly")}</SelectItem>
                              <SelectItem value="storytelling">{t(locale, "pitch.toneStorytelling")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <UILabel className="text-xs font-mono uppercase text-muted-foreground flex items-center gap-1">
                            <Languages className="h-3 w-3" /> {t(locale, "pitch.emailLanguage")}
                          </UILabel>
                          <Select value={pitchLanguage} onValueChange={(v) => setPitchLanguage(v as PitchLanguage)}>
                            <SelectTrigger className="bg-secondary/50 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {(Object.keys(PITCH_LANGUAGES) as PitchLanguage[]).map((lang) => (
                                <SelectItem key={lang} value={lang}>{PITCH_LANGUAGES[lang]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <UILabel className="text-xs font-mono uppercase text-muted-foreground">{t(locale, "pitch.additionalNote")}</UILabel>
                        <Input value={pitchNote} onChange={(e) => setPitchNote(e.target.value)} placeholder="Optional note..." className="bg-secondary/50 text-sm" />
                      </div>

                      {/* Pitch preview */}
                      {pitchText && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                              <Sparkles className="h-3 w-3 text-primary" /> {t(locale, "pitch.preview")}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <Button onClick={handlePitchCopy} size="sm" className="h-7 text-xs border-border/50" variant="outline">
                                {pitchCopied ? <><Check className="h-3 w-3 mr-1" />{t(locale, "pitch.copied")}</> : <><Copy className="h-3 w-3 mr-1" />{t(locale, "pitch.copyToClipboard")}</>}
                              </Button>
                            </div>
                          </div>
                          <Card className="bg-card/80 border-border/30">
                            <CardContent className="p-3 max-h-[220px] overflow-y-auto">
                              <pre className="text-[11px] leading-relaxed whitespace-pre-wrap font-mono text-foreground/80">{pitchText}</pre>
                            </CardContent>
                          </Card>

                          {/* Action buttons */}
                          <div className="flex flex-col gap-2">
                            {/* Direct Gmail send — PRIMARY if connected */}
                            {gmailAuth.isConnected ? (
                              <Button
                                onClick={handleDirectSend}
                                className="w-full text-sm bg-emerald-600 hover:bg-emerald-500 text-white"
                                disabled={!pitchTrackName.trim() || !detailEmails.length || sendingEmail}
                              >
                                {emailSent ? (
                                  <><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Email inviata!</>
                                ) : sendingEmail ? (
                                  <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Invio in corso...</>
                                ) : pitchDemoCreated ? (
                                  <><Check className="h-3.5 w-3.5 mr-1" />{t(locale, "pitch.sentAndTracked")}</>
                                ) : (
                                  <><SendHorizonal className="h-3.5 w-3.5 mr-1.5" />Invia direttamente da Gmail</>
                                )}
                              </Button>
                            ) : (
                              /* Fallback: open Gmail in browser if not connected */
                              <Button
                                onClick={handleOpenGmail}
                                className="w-full glow-purple text-sm"
                                disabled={!pitchTrackName.trim()}
                              >
                                <MailOpen className="h-3.5 w-3.5 mr-1.5" />
                                {pitchDemoCreated
                                  ? <><Check className="h-3.5 w-3.5 mr-1" />{t(locale, "pitch.sentAndTracked")}</>
                                  : detailEmails.length > 0
                                    ? t(locale, "pitch.openGmail")
                                    : t(locale, "pitch.openGmailNoEmail")
                                }
                              </Button>
                            )}

                            {/* Secondary actions row */}
                            <div className="flex flex-col sm:flex-row gap-2">
                              {/* mailto: link — only when label has email */}
                              {detailEmails.length > 0 && detailSubmissionType === "email" && (
                                <Button
                                  onClick={handleSendAndTrack}
                                  variant="outline"
                                  className="flex-1 text-sm border-primary/20"
                                  disabled={!pitchTrackName.trim()}
                                >
                                  <Send className="h-3.5 w-3.5 mr-1.5" />
                                  {t(locale, "pitch.openEmailClient")}
                                </Button>
                              )}
                              {/* Track Demo Only */}
                              {!demoAlreadyExists && !pitchDemoCreated && (
                                <Button
                                  variant="outline"
                                  className="flex-1 text-sm border-border/50"
                                  disabled={!pitchTrackName.trim()}
                                  onClick={() => {
                                    if (!detailLabel || !pitchTrackName.trim()) return;
                                    addDemo({
                                      trackName: pitchTrackName.trim(),
                                      labelId: detailLabel.id,
                                      status: "ready",
                                      sentDate: null,
                                      link: pitchScLink.trim(),
                                      notes: pitchNote.trim(),
                                      pitchText: pitchText,
                                      artistName: pitchArtistName.trim(),
                                    });
                                    setPitchDemoCreated(true);
                                  }}
                                >
                                  <ClipboardCheck className="h-3.5 w-3.5 mr-1.5" />
                                  {t(locale, "pitch.addDemoOnly")}
                                </Button>
                              )}
                              {pitchDemoCreated && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-primary text-xs"
                                  onClick={() => { setActiveTab("demos"); setDetailLabel(null); }}
                                >
                                  {t(locale, "pitch.goToDemo")} →
                                </Button>
                              )}
                            </div>

                            {/* Info message when no email is set */}
                            {!detailEmails.length && (
                              <p className="text-[10px] text-amber-400/70 flex items-center gap-1">
                                <Mail className="h-3 w-3" /> {t(locale, "pitch.addEmailFirst")}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <DialogFooter className="gap-2">
                  {detailLabel.isCustom && (
                    <Button variant="destructive" size="sm" onClick={() => { setDeleteConfirmId(detailLabel.id); setDetailLabel(null); }}>
                      <Trash2 className="h-3 w-3 mr-1" />{t(locale, "labels.delete")}
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => setDetailLabel(null)}>{t(locale, "labels.close")}</Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Smart Match Dialog */}
      <Dialog open={showSmartMatch} onOpenChange={setShowSmartMatch}>
        <DialogContent className="sm:max-w-2xl bg-card border-border/50 max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />{t(locale, "labels.smartMatchTitle")}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t(locale, "labels.smartMatchDesc")}</p>
          <Select value={smartMatchGenre} onValueChange={setSmartMatchGenre}>
            <SelectTrigger className="bg-secondary/50"><SelectValue placeholder={t(locale, "labels.selectGenre")} /></SelectTrigger>
            <SelectContent>{genres.map((g) => (<SelectItem key={g} value={g}>{g}</SelectItem>))}</SelectContent>
          </Select>

          {smartMatchGenre && (
            <div className="space-y-4 mt-2">
              {smartMatchResults.top.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-purple-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Award className="h-3.5 w-3.5" />{t(locale, "labels.topTier")}
                  </h4>
                  <div className="grid gap-1.5">
                    {smartMatchResults.top.map((l) => (
                      <div key={l.id} className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-purple-500/5 border border-purple-500/10 text-sm cursor-pointer hover:bg-purple-500/10 transition-colors"
                        onClick={() => { setShowSmartMatch(false); openDetail(l); }}>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-purple-400 w-8">#{l.rankByGenre?.[smartMatchGenre]}</span>
                          <span className="font-medium text-foreground">{l.name}</span>
                          {l.trending && <span className="text-orange-400 text-[10px]">🔥</span>}
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground">{l.pointsByGenre?.[smartMatchGenre]?.toLocaleString()} pts</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {smartMatchResults.mid.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-blue-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5" />{t(locale, "labels.midTier")}
                  </h4>
                  <div className="grid gap-1.5">
                    {smartMatchResults.mid.map((l) => (
                      <div key={l.id} className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-blue-500/5 border border-blue-500/10 text-sm cursor-pointer hover:bg-blue-500/10 transition-colors"
                        onClick={() => { setShowSmartMatch(false); openDetail(l); }}>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-blue-400 w-8">#{l.rankByGenre?.[smartMatchGenre]}</span>
                          <span className="font-medium text-foreground">{l.name}</span>
                          {l.trending && <span className="text-orange-400 text-[10px]">🔥</span>}
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground">{l.pointsByGenre?.[smartMatchGenre]?.toLocaleString()} pts</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {smartMatchResults.emerging.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-emerald-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5" />{t(locale, "labels.emerging")}
                  </h4>
                  <div className="grid gap-1.5">
                    {smartMatchResults.emerging.map((l) => (
                      <div key={l.id} className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-emerald-500/5 border border-emerald-500/10 text-sm cursor-pointer hover:bg-emerald-500/10 transition-colors"
                        onClick={() => { setShowSmartMatch(false); openDetail(l); }}>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-orange-400">🔥</span>
                          <span className="font-medium text-foreground">{l.name}</span>
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground">{l.trendingPointsByGenre?.[smartMatchGenre]?.toLocaleString()} pts (14d)</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {smartMatchResults.top.length === 0 && smartMatchResults.mid.length === 0 && smartMatchResults.emerging.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No data for this genre yet.</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md bg-card border-border/50">
          <DialogHeader>
            <DialogTitle>{editingLabel ? t(locale, "labels.editLabel") : t(locale, "labels.addLabel")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <UILabel className="text-xs font-mono uppercase text-muted-foreground">{t(locale, "labels.labelName")}</UILabel>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Drumcode" className="bg-secondary/50" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <UILabel className="text-xs font-mono uppercase text-muted-foreground">{t(locale, "labels.genre")}</UILabel>
                <Select value={formGenre} onValueChange={setFormGenre}>
                  <SelectTrigger className="bg-secondary/50"><SelectValue /></SelectTrigger>
                  <SelectContent>{genres.slice(0, 20).map((g) => (<SelectItem key={g} value={g}>{g}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <UILabel className="text-xs font-mono uppercase text-muted-foreground">{t(locale, "labels.submissionType")}</UILabel>
                <Select value={formSubmissionType} onValueChange={(v) => setFormSubmissionType(v as "email" | "webform" | "platform")}>
                  <SelectTrigger className="bg-secondary/50"><SelectValue /></SelectTrigger>
                  <SelectContent>{SUBMISSION_TYPES.map((type) => (<SelectItem key={type} value={type}>{getSubmissionLabel(type)}</SelectItem>))}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <UILabel className="text-xs font-mono uppercase text-muted-foreground">{t(locale, "labels.arContact")}</UILabel>
              <Input value={formContact} onChange={(e) => setFormContact(e.target.value)} placeholder="demos@label.com or https://..." className="bg-secondary/50" />
            </div>
            <div className="space-y-1.5">
              <UILabel className="text-xs font-mono uppercase text-muted-foreground">{t(locale, "labels.status")}</UILabel>
              <Select value={formStatus} onValueChange={(v) => setFormStatus(v as "open" | "closed")}>
                <SelectTrigger className="bg-secondary/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">{t(locale, "labels.open")}</SelectItem>
                  <SelectItem value="closed">{t(locale, "labels.closed")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <UILabel className="text-xs font-mono uppercase text-muted-foreground">{t(locale, "labels.notes")}</UILabel>
              <Textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="..." rows={2} className="bg-secondary/50 resize-none" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAddDialog(false)}>{t(locale, "labels.cancel")}</Button>
            <Button onClick={handleSave} disabled={!formName.trim()}>{editingLabel ? t(locale, "labels.update") : t(locale, "labels.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent className="sm:max-w-sm bg-card border-border/50">
          <DialogHeader><DialogTitle>{t(locale, "labels.deleteConfirm")}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{t(locale, "labels.deleteConfirmMsg")}</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteConfirmId(null)}>{t(locale, "labels.cancel")}</Button>
            <Button variant="destructive" onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}>{t(locale, "labels.delete")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
