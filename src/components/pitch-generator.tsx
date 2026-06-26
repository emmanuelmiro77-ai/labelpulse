"use client";

import { useAppStore, getLabelTier, type Label, type Demo, type SavedPitch, type SentCampaign, type SentCampaignRecipient } from "@/lib/store";
import { t, type Locale } from "@/lib/i18n";
import { useState, useMemo, useCallback, useEffect } from "react";
import {
  Zap,
  Mail,
  Check,
  Languages,
  Music2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Send,
  Target,
  Copy,
  ExternalLink,
  Activity,
  Upload,
  Loader2,
  Sparkles,
  Disc3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label as UILabel } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  generateSubject,
  generatePitchBody,
  generateGmailLink,
  generateMailtoLink,
  PITCH_LANGUAGES,
  type PitchTone,
  type PitchLanguage,
  type PitchShape,
  type PitchTrackEntry,
} from "@/lib/pitch-utils";
import { useToast } from "@/hooks/use-toast";
import { SimilarSuggestions } from "@/components/similar-suggestions";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FileEdit, Inbox, Send as SendIcon, Trash2, RotateCcw, Eye, CheckCircle2 } from "lucide-react";

export function PitchGenerator() {
  const { labels, demos, releases, addDemo, locale, userProfile, setUserProfile, getGenres, artists, setActiveTab, setSelectedLabelId, setSelectedArtistId, savedPitches, sentCampaigns, addSavedPitch, updateSavedPitch, deleteSavedPitch, addSentCampaign, deleteSentCampaign } = useAppStore();
  const { toast } = useToast();
  const genres = getGenres();

  // Sub-tab state: "new" = pitch form, "drafts" = draft list (status='draft'),
  // "ready" = ready-to-send list (status='ready'), "sent" = sent campaigns.
  // The "ready" sub-tab is a 2026-06-25 addition — previously, ready pitches
  // were mixed into "drafts" with just a colored badge, which made them hard
  // to spot. Now they get their own dedicated sub-tab with a purple badge.
  const [pitchSubTab, setPitchSubTab] = useState<"new" | "drafts" | "ready" | "sent">("new");
  // When the user clicks "Riprendi" on a draft, we store the draft here
  // and a useEffect loads it into the form. (Direct setter calls during
  // the click handler would race with React's batching.)
  const [pendingResume, setPendingResume] = useState<SavedPitch | null>(null);

  // Pre-fill from user profile (artistName only — scLink is per-track, not
  // a profile field, so it must NOT be pre-filled here. See bug fix below.)
  const initialArtistName = userProfile.artistName || "";

  // Track setup state
  // ⚠️ scLink is the SoundCloud link OF THE TRACK being pitched, NOT the
  // user's profile SoundCloud link. Previously this was initialized from
  // userProfile.scLink, which (combined with the onBlur handler that saved
  // the field back to userProfile.scLink) caused the user's profile link
  // to be silently overwritten with the link of whatever track they last
  // pitched — and then re-displayed as a default on every subsequent
  // visit. The field is now empty by default; it only fills when the user
  // picks an existing demo (chip) or types a link manually.
  const [trackName, setTrackName] = useState("");
  const [artistName, setArtistName] = useState(initialArtistName);
  const [scLink, setScLink] = useState("");
  const [tone, setTone] = useState<PitchTone>("professional");
  const [language, setLanguage] = useState<PitchLanguage>("en");
  const [customNote, setCustomNote] = useState("");
  const [selectedGenre, setSelectedGenre] = useState("");

  // Track audio profile — user can type BPM/key manually OR run an analysis
  // on the SoundCloud link. Used by SimilarSuggestions to mine the scraped
  // DB for labels/artists that match the user's track.
  const [trackBpm, setTrackBpm] = useState("");
  const [trackKey, setTrackKey] = useState("");
  const [trackAnalysis, setTrackAnalysis] = useState<{
    bpm: number;
    bpmConfidence: number;
    key: { camelot: string; confidence: number };
  } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Target labels state
  const [selectedLabelIds, setSelectedLabelIds] = useState<Set<string>>(new Set());
  const [onlyWithEmail, setOnlyWithEmail] = useState(false);
  const [expandedTiers, setExpandedTiers] = useState<Record<string, boolean>>({ top: true, mid: true, emerging: true });

  // Campaign state
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState({ current: 0, total: 0 });
  const [campaignComplete, setCampaignComplete] = useState(false);
  const [campaignResults, setCampaignResults] = useState({ sent: 0, skipped: 0 });

  // Demo picker EP mode state — mirrors the same feature in the label detail
  // dialog (label-finder.tsx). When `epMode` is on, clicking a demo chip
  // adds/removes it from `selectedDemoIds`; with 2+ demos selected, the form
  // auto-builds an EP pitch (trackName = "EP (N tracce)", note = tracklist).
  const [epMode, setEpMode] = useState(false);
  // Pitch workflow type — 2026-06-25 addition. Gives the user an explicit
  // top-level choice instead of forcing them to discover the EP/single
  // distinction by toggling buttons inside the demo picker.
  //   "single"  → single-track pitch (default, backward compatible)
  //   "ep"      → multi-track EP pitch (auto-enables epMode)
  //   "manual"  → no demo picker, user fills the form by hand
  // The selector only changes the demo picker UX; the underlying pitch
  // shape is still derived from epMode + selectedDemoIds (see pitchShape
  // memo below). This keeps backward compat with saved drafts, the resume
  // flow, and the label-finder inline pitch form.
  const [pitchWorkflow, setPitchWorkflow] = useState<"single" | "ep" | "manual">("single");
  const [selectedDemoIds, setSelectedDemoIds] = useState<Set<string>>(new Set());
  // EP link mode: "separate" (each track keeps its own SC link, body lists
  // them all with format left open) or "single" (one album/private set URL
  // for the whole EP). Mirrors the label-finder.tsx picker.
  const [epLinkMode, setEpLinkMode] = useState<"separate" | "single">("separate");
  const [epSingleLink, setEpSingleLink] = useState("");

  // Draft name input (shown when saving)
  const [draftName, setDraftName] = useState("");
  const [showDraftNameInput, setShowDraftNameInput] = useState<false | "draft" | "ready">(false);

  // Helper: extract the SoundCloud link from a Demo.
  const getDemoScLink = useCallback((d: Demo): string => {
    if (d.link) return d.link;
    const sc = d.links?.find((l) => l.type === "soundcloud");
    return sc?.value || "";
  }, []);

  // Helper: extract the primary artist from a Demo.
  const getDemoPrimaryArtist = useCallback((d: Demo): string => {
    return d.artists?.[0] || d.artistName || "";
  }, []);

  // Helper: format the collaborator suffix for a Demo.
  const getDemoCollaborators = useCallback((d: Demo): string => {
    if (d.artists && d.artists.length > 1) {
      return ` × ${d.artists.slice(1).join(", ")}`;
    }
    return "";
  }, []);

  // Demo picker handler — same UX as the label detail dialog.
  // See handlePickDemoForPitch in label-finder.tsx for the full design.
  const handlePickDemo = useCallback((demo: Demo) => {
    if (!epMode) {
      // === Single-pick mode ===
      setTrackName(demo.trackName);
      const primaryArtist = getDemoPrimaryArtist(demo);
      if (primaryArtist) setArtistName(primaryArtist);
      const scLinkValue = getDemoScLink(demo);
      setScLink(scLinkValue);
      if (demo.genre) setSelectedGenre(demo.genre);
      if (demo.bpm) setTrackBpm(demo.bpm);
      if (demo.key) setTrackKey(demo.key);
      if (demo.analysis) {
        setTrackAnalysis({
          bpm: demo.analysis.bpm,
          bpmConfidence: demo.analysis.bpmConfidence,
          key: {
            camelot: demo.analysis.key.camelot,
            confidence: demo.analysis.key.confidence,
          },
        });
      } else {
        setTrackAnalysis(null);
      }

      // If this demo is part of a Release (EP), expand the form to pitch
      // the whole EP. The Release may have a single SC album URL
      // (epSoundCloudUrl) → ep-single template. Otherwise → ep-multi.
      if (demo.parentReleaseId) {
        const release = releases.find((r) => r.id === demo.parentReleaseId);
        const epTracks = demos
          .filter((d) => d.parentReleaseId === demo.parentReleaseId)
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        if (release && epTracks.length > 1) {
          setTrackName(release.title);
          if (release.epSoundCloudUrl && release.epSoundCloudUrl.trim()) {
            // Release has a single EP SoundCloud URL → ep-single
            setEpLinkMode("single");
            setEpSingleLink(release.epSoundCloudUrl.trim());
            setScLink(release.epSoundCloudUrl.trim());
            // Names-only tracklist in the note
            const tracklist = epTracks
              .map((t, i) => `${i + 1}. ${t.trackName}`)
              .join("\n");
            setCustomNote(tracklist);
            toast({
              title: locale === "it" ? "EP caricato (link unico)" : "EP loaded (single link)",
              description: `${release.title} (${epTracks.length} ${locale === "it" ? "tracce" : "tracks"})`,
            });
          } else {
            // No single EP URL → ep-multi with per-track links
            setEpLinkMode("separate");
            setEpSingleLink("");
            setScLink(getDemoScLink(epTracks[0]));
            setCustomNote("");
            toast({
              title: locale === "it" ? "EP caricato (link separati)" : "EP loaded (separate links)",
              description: `${release.title} (${epTracks.length} ${locale === "it" ? "tracce" : "tracks"})`,
            });
          }
          return;
        }
      }

      // Standalone single demo (no Release) → classic single-track pitch
      setEpLinkMode("separate");
      setEpSingleLink("");
      setCustomNote("");
      toast({
        title: locale === "it" ? "Demo caricata" : "Demo loaded",
        description: `"${demo.trackName}"${getDemoCollaborators(demo)}`,
      });
      return;
    }

    // === EP multi-select mode ===
    const next = new Set(selectedDemoIds);
    if (next.has(demo.id)) next.delete(demo.id);
    else next.add(demo.id);
    setSelectedDemoIds(next);

    const selectedDemos = demos
      .filter((d) => next.has(d.id))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    if (selectedDemos.length === 0) {
      setTrackName("");
      setScLink("");
      setEpSingleLink("");
      setCustomNote("");
      setTrackAnalysis(null);
      return;
    }

    if (selectedDemos.length === 1) {
      const d = selectedDemos[0];
      setTrackName(d.trackName);
      const primaryArtist = getDemoPrimaryArtist(d);
      if (primaryArtist) setArtistName(primaryArtist);
      setScLink(getDemoScLink(d));
      setEpSingleLink("");
      setCustomNote("");
      setTrackAnalysis(null);
      return;
    }

    // Multiple demos — build an EP form
    const firstDemo = selectedDemos[0];
    const primaryArtist = getDemoPrimaryArtist(firstDemo) || userProfile.artistName || "";
    const firstScLink = getDemoScLink(firstDemo);
    setTrackName(
      locale === "it"
        ? `EP (${selectedDemos.length} tracce)`
        : `EP (${selectedDemos.length} tracks)`
    );
    if (primaryArtist) setArtistName(primaryArtist);
    setScLink(firstScLink);
    if (epLinkMode === "single" && !epSingleLink.trim()) {
      setEpSingleLink(firstScLink);
    }

    if (epLinkMode === "single") {
      // Names-only tracklist in the note
      const tracklist = selectedDemos
        .map((t, i) => `${i + 1}. ${t.trackName}`)
        .join("\n");
      setCustomNote(tracklist);
    } else {
      // Separate mode — note stays empty; per-track links go in body
      setCustomNote("");
    }
    setTrackAnalysis(null);
  }, [
    epMode,
    epLinkMode,
    epSingleLink,
    selectedDemoIds,
    demos,
    releases,
    userProfile.artistName,
    locale,
    toast,
    getDemoScLink,
    getDemoPrimaryArtist,
    getDemoCollaborators,
  ]);

  // Save profile fields on blur
  // ⚠️ Only artistName is saved — scLink is per-track, not a profile field,
  // so we don't persist it to userProfile. (See bug fix above.)
  const handleArtistBlur = () => {
    if (artistName.trim() && artistName.trim() !== userProfile.artistName) {
      setUserProfile({ artistName: artistName.trim() });
    }
  };

  const handleScLinkBlur = () => {
    // Intentionally a no-op: scLink is the SoundCloud link of the track
    // being pitched, not the user's profile SoundCloud link. Previously
    // this saved the field to userProfile.scLink, which contaminated the
    // profile with per-track links. The user's profile SoundCloud link
    // is managed on the Profile page instead.
  };

  // Run audio analysis on the SoundCloud link OR a user-uploaded file.
  // Result fills trackBpm / trackKey + trackAnalysis (used by SimilarSuggestions).
  const handleAnalyzeTrack = async (file?: File) => {
    const audioUrl = scLink.trim();
    if (!file && !audioUrl) {
      setAnalysisError(locale === "it"
        ? "Inserisci un link SoundCloud o carica un file"
        : "Provide a SoundCloud link or upload a file");
      return;
    }
    setIsAnalyzing(true);
    setAnalysisError(null);
    try {
      const { analyzeAudio, analyzeAudioFile } = await import("@/lib/audio-analysis");
      const result = file
        ? await analyzeAudioFile(file, () => {})
        : await analyzeAudio(audioUrl, () => {});
      setTrackAnalysis({
        bpm: result.bpm,
        bpmConfidence: result.bpmConfidence,
        key: {
          camelot: result.key.camelot,
          confidence: result.key.confidence,
        },
      });
      setTrackBpm(String(result.bpm));
      if (result.key.confidence > 0) {
        setTrackKey(result.key.camelot);
      }
    } catch (err: any) {
      console.error("[pitch analyze]", err);
      setAnalysisError(err?.message || (locale === "it" ? "Errore analisi" : "Analysis failed"));
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Cross-tab navigation from SimilarSuggestions
  const handleOpenLabel = useCallback(
    (label: Label) => {
      setSelectedLabelId?.(label.id || label.name);
      setActiveTab("labels");
    },
    [setActiveTab, setSelectedLabelId]
  );
  const handleOpenArtist = useCallback(
    (artistId: string) => {
      setSelectedArtistId?.(artistId);
      setActiveTab("artists");
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    },
    [setActiveTab, setSelectedArtistId]
  );
  // "Use as target" in SimilarSuggestions → toggle the label in the
  // selectedLabelIds set so it gets included in the campaign.
  const handleSelectLabelAsTarget = useCallback(
    (label: Label) => {
      setSelectedLabelIds((prev) => {
        const next = new Set(prev);
        if (next.has(label.id)) {
          next.delete(label.id);
        } else {
          next.add(label.id);
        }
        return next;
      });
    },
    []
  );

  // Get matching labels by genre, grouped by tier
  // Counts for the sub-tab badges — split savedPitches by status so the
  // "Bozze" badge shows only true drafts, and "Pronta per invio" shows
  // only ready pitches. (Before this, the "Bozze" badge counted both,
  // which was misleading once the dedicated ready sub-tab landed.)
  const draftCount = useMemo(
    () => savedPitches.filter((p) => p.status === "draft").length,
    [savedPitches]
  );
  const readyCount = useMemo(
    () => savedPitches.filter((p) => p.status === "ready").length,
    [savedPitches]
  );

  // Note: include both "open" (confirmed) AND "unknown" (default seed) labels.
  // Excluding "unknown" would hide every label the user hasn't manually
  // confirmed yet — which, after the 2026-06-25 fix, is the vast majority.
  // Only exclude "closed" (user explicitly said no).
  const matchingLabels = useMemo(() => {
    if (!selectedGenre) return { top: [], mid: [], emerging: [] };
    const genreLabels = labels.filter((l) =>
      l.genres.includes(selectedGenre) && l.status !== "closed"
    );
    const top = genreLabels
      .filter((l) => getLabelTier(l, selectedGenre) === "top")
      .sort((a, b) => (a.rankByGenre?.[selectedGenre] || 999) - (b.rankByGenre?.[selectedGenre] || 999));
    const mid = genreLabels
      .filter((l) => getLabelTier(l, selectedGenre) === "mid")
      .sort((a, b) => (a.rankByGenre?.[selectedGenre] || 999) - (b.rankByGenre?.[selectedGenre] || 999));
    const emerging = genreLabels
      .filter((l) => getLabelTier(l, selectedGenre) === "emerging")
      .sort((a, b) => (b.trendingPointsByGenre?.[selectedGenre] || 0) - (a.trendingPointsByGenre?.[selectedGenre] || 0));
    return { top, mid, emerging };
  }, [labels, selectedGenre]);

  const allMatchingLabels = useMemo(
    () => [...matchingLabels.top, ...matchingLabels.mid, ...matchingLabels.emerging],
    [matchingLabels]
  );

  // Get emails for a label
  const getLabelEmails = useCallback((label: Label): string[] => {
    if (label.emails?.length) return label.emails;
    if (label.contactInfo) return [label.contactInfo];
    return [];
  }, []);

  // Filtered labels (only with email toggle)
  const filteredLabels = useMemo(() => {
    if (!onlyWithEmail) return allMatchingLabels;
    return allMatchingLabels.filter((l) => getLabelEmails(l).length > 0);
  }, [allMatchingLabels, onlyWithEmail, getLabelEmails]);

  const filteredByTier = useMemo(() => {
    const top = filteredLabels.filter((l) => getLabelTier(l, selectedGenre) === "top");
    const mid = filteredLabels.filter((l) => getLabelTier(l, selectedGenre) === "mid");
    const emerging = filteredLabels.filter((l) => getLabelTier(l, selectedGenre) === "emerging");
    return { top, mid, emerging };
  }, [filteredLabels, selectedGenre]);

  // Selection management
  const toggleLabel = useCallback((id: string) => {
    setSelectedLabelIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    const ids = new Set(filteredLabels.map((l) => l.id));
    setSelectedLabelIds(ids);
  }, [filteredLabels]);

  const deselectAll = useCallback(() => {
    setSelectedLabelIds(new Set());
  }, []);

  // Selected label stats
  const selectedLabels = useMemo(
    () => allMatchingLabels.filter((l) => selectedLabelIds.has(l.id)),
    [allMatchingLabels, selectedLabelIds]
  );

  const selectedWithEmail = useMemo(
    () => selectedLabels.filter((l) => getLabelEmails(l).length > 0),
    [selectedLabels, getLabelEmails]
  );

  const selectedWithoutEmail = useMemo(
    () => selectedLabels.filter((l) => getLabelEmails(l).length === 0),
    [selectedLabels, getLabelEmails]
  );

  // Switch the pitch workflow type. Side-effects on epMode keep the
  // underlying state consistent with the user's choice:
  //   "single" → epMode=false (single-track pick mode)
  //   "ep"     → epMode=true (multi-select mode), clears any single-pick
  //              state so the user starts the EP selection fresh
  //   "manual" → epMode=false AND clears selectedDemoIds so the form
  //              doesn't auto-fill from a previously-picked demo
  // The demo picker UI is hidden entirely in "manual" mode (see JSX below).
  const handleSetPitchWorkflow = useCallback((wf: "single" | "ep" | "manual") => {
    setPitchWorkflow(wf);
    if (wf === "single") {
      setEpMode(false);
    } else if (wf === "ep") {
      setEpMode(true);
    } else if (wf === "manual") {
      setEpMode(false);
      setSelectedDemoIds(new Set());
      // Clear the auto-filled fields so the user truly starts from blank
      setTrackName("");
      setScLink("");
      setTrackBpm("");
      setTrackKey("");
      setTrackAnalysis(null);
      setCustomNote("");
    }
  }, []);

  // When the user toggles the EP link mode (separate ↔ single) after
  // selecting demos, recompute the note (single = names-only tracklist,
  // separate = empty) and sync scLink/epSingleLink. Mirrors the same
  // function in label-finder.tsx.
  const handleToggleEpLinkMode = useCallback((mode: "separate" | "single") => {
    if (mode === epLinkMode) return;
    setEpLinkMode(mode);

    const selectedDemos = demos
      .filter((d) => selectedDemoIds.has(d.id))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    if (selectedDemos.length < 2) {
      if (mode === "single" && selectedDemos.length === 1) {
        setEpSingleLink(getDemoScLink(selectedDemos[0]));
      } else {
        setEpSingleLink("");
      }
      return;
    }

    if (mode === "single") {
      setEpSingleLink(getDemoScLink(selectedDemos[0]) || scLink);
      const tracklist = selectedDemos
        .map((t, i) => `${i + 1}. ${t.trackName}`)
        .join("\n");
      setCustomNote(tracklist);
    } else {
      setEpSingleLink("");
      setCustomNote("");
    }
  }, [epLinkMode, selectedDemoIds, demos, scLink, getDemoScLink]);

  // Derived: the list of PitchTrackEntry objects for the current EP
  // selection. Used by generatePitchBody to render the per-track list in
  // ep-multi mode, and to render the names-only tracklist section in
  // ep-single mode.
  const epTracks = useMemo<PitchTrackEntry[]>(() => {
    const ids = epMode
      ? selectedDemoIds
      : (() => {
          // In single-pick mode, if the picked demo is part of a Release,
          // include all of the Release's tracks.
          const pickedDemo = demos.find(
            (d) => d.trackName === trackName &&
              (d.artists?.[0] || d.artistName) === artistName
          );
          if (!pickedDemo || !pickedDemo.parentReleaseId) return new Set<string>();
          const release = releases.find((r) => r.id === pickedDemo.parentReleaseId);
          if (!release || (release.trackIds?.length ?? 0) < 2) return new Set<string>();
          return new Set(release.trackIds);
        })();
    return demos
      .filter((d) => ids.has(d.id))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((d) => ({
        trackName: d.trackName,
        artistName: getDemoPrimaryArtist(d) + getDemoCollaborators(d),
        scLink: getDemoScLink(d),
      }));
  }, [
    epMode, selectedDemoIds, trackName, artistName, demos, releases,
    getDemoPrimaryArtist, getDemoCollaborators, getDemoScLink,
  ]);

  // Derived: the PitchShape to pass to generatePitch / generatePitchBody.
  const pitchShape = useMemo<PitchShape>(() => {
    if (epTracks.length >= 2) {
      return epLinkMode === "single" ? "ep-single" : "ep-multi";
    }
    return "single";
  }, [epTracks.length, epLinkMode]);

  // Derived: the effective scLink to pass to generatePitchBody.
  const effectiveScLink = useMemo(() => {
    if (pitchShape === "ep-single") return epSingleLink;
    if (pitchShape === "ep-multi") return "";
    return scLink;
  }, [pitchShape, epSingleLink, scLink]);

  // Generate personalized pitch preview for a label — passes pitchShape +
  // epTracks + effectiveScLink so the right template is used.
  const getPitchForLabel = useCallback(
    (label: Label) => {
      if (!trackName.trim()) return { subject: "", body: "" };
      const subject = generateSubject(trackName.trim(), artistName, language, pitchShape, epTracks.length);
      const body = generatePitchBody(label.name, trackName.trim(), artistName, effectiveScLink, tone, customNote, language, pitchShape, epTracks);
      // Track first pitch generated (only once per user)
      if (typeof window !== "undefined") {
        const firstPitchKey = "lp_first_pitch_tracked";
        if (!localStorage.getItem(firstPitchKey)) {
          localStorage.setItem(firstPitchKey, new Date().toISOString());
          void import("@/lib/analytics").then(({ trackEvent }) => {
            trackEvent("first_pitch_generated", {
              label_name: label.name,
              pitch_shape: pitchShape,
              is_ep: pitchShape !== "single",
            });
          });
        }
      }
      return { subject, body };
    },
    [trackName, artistName, effectiveScLink, tone, customNote, language, pitchShape, epTracks]
  );

  // Tier badge component
  const tierBadge = (tier: "top" | "mid" | "emerging") => {
    if (tier === "top")
      return <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-[10px] px-1.5 py-0">🟣 {t(locale, "labels.tierTop")}</Badge>;
    if (tier === "mid")
      return <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-[10px] px-1.5 py-0">🔵 {t(locale, "labels.tierMid")}</Badge>;
    return <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[10px] px-1.5 py-0">🟢 {t(locale, "labels.tierEmerging")}</Badge>;
  };

  // Toggle tier expand
  const toggleTier = (tier: string) => {
    setExpandedTiers((prev) => ({ ...prev, [tier]: !prev[tier] }));
  };

  // Bulk send campaign via Gmail Web Compose
  const handleSendCampaign = useCallback(async () => {
    if (!selectedWithEmail.length || !trackName.trim()) return;
    setSending(true);
    setCampaignComplete(false);
    setCampaignResults({ sent: 0, skipped: 0 });

    const toSend = selectedWithEmail.filter((l) => getLabelEmails(l).length > 0);
    const skipped = selectedWithoutEmail.length;
    let sentCount = 0;

    // Build the SentCampaign recipient list as we go
    const recipients: SentCampaignRecipient[] = [];

    setSendProgress({ current: 0, total: toSend.length });

    for (let i = 0; i < toSend.length; i++) {
      const label = toSend[i];
      const emails = getLabelEmails(label);
      if (!emails.length) continue;

      const { subject, body } = getPitchForLabel(label);
      if (!subject || !body) continue;

      setSendProgress({ current: i + 1, total: toSend.length });

      // Open Gmail compose in new tab with pre-filled content
      const gmailUrl = generateGmailLink(emails, subject, body);
      window.open(gmailUrl, `_blank`, "noopener");

      sentCount++;

      // Auto-create demo entry (returns the new demo id so we can link it
      // from the SentCampaign record for later review)
      let demoId: string | null = null;
      const demoAlreadyExists = demos.some(
        (d) => d.labelId === label.id && d.trackName.toLowerCase() === trackName.trim().toLowerCase()
      );
      if (!demoAlreadyExists) {
        // In EP multi-track mode, capture the structured per-track list so
        // the demo detail dialog can render every track's SoundCloud link
        // (instead of just the first track's URL that ended up in `link`).
        // epTracks is empty in single-track mode → pitchTracks stays undefined.
        const pitchTracksForDemo = epTracks.length >= 2 ? epTracks : undefined;
        demoId = addDemo({
          trackName: trackName.trim(),
          labelId: label.id,
          status: "sent",
          sentDate: new Date().toISOString().split("T")[0],
          link: effectiveScLink.trim() || scLink.trim(),
          notes: customNote.trim() ? `${customNote.trim()} (Campaign)` : "Campaign",
          pitchText: `Subject: ${subject}\n\n${body}`,
          artistName: artistName.trim(),
          pitchTracks: pitchTracksForDemo,
        });
      }

      recipients.push({
        labelId: label.id,
        labelName: label.name,
        email: emails[0],
        subject,
        body,
        gmailUrl,
        demoId,
        status: "opened",
      });

      // Small delay between opens to avoid popup blocking
      if (i < toSend.length - 1) {
        await new Promise((r) => setTimeout(r, 800));
      }
    }

    // Add skipped (no-email) labels to the recipient list for the record
    for (const label of selectedWithoutEmail) {
      recipients.push({
        labelId: label.id,
        labelName: label.name,
        email: "",
        subject: "",
        body: "",
        gmailUrl: "",
        demoId: null,
        status: "skipped",
      });
    }

    // Record the SentCampaign for the "Inviati" tab
    const campaignName = draftName.trim() || `${trackName.trim()} \u2192 ${sentCount} ${locale === "it" ? "label" : "label"}`;
    addSentCampaign({
      name: campaignName,
      trackName: trackName.trim(),
      artistName: artistName.trim(),
      scLink: effectiveScLink || scLink,
      tone,
      language,
      customNote,
      selectedGenre,
      epMode,
      epLinkMode,
      epSingleLink,
      selectedDemoIds: Array.from(selectedDemoIds),
      selectedLabelIds: Array.from(selectedLabelIds),
      recipients,
      sentCount,
      skippedCount: skipped,
      savedPitchId: null,
    });

    setCampaignResults({ sent: sentCount, skipped });
    setCampaignComplete(true);
    setSending(false);
    // Clear the draft name input (if any) after a successful send
    setDraftName("");
    setShowDraftNameInput(false);

    toast({
      title: t(locale, "campaign.complete"),
      description: t(locale, "campaign.reviewAndSend").replace("{count}", String(sentCount)),
    });
  }, [selectedWithEmail, selectedWithoutEmail, getLabelEmails, getPitchForLabel, demos, trackName, scLink, effectiveScLink, customNote, artistName, addDemo, locale, toast, draftName, tone, language, selectedGenre, epMode, epLinkMode, epSingleLink, selectedDemoIds, selectedLabelIds, addSentCampaign, epTracks]);

  // Copy all emails to clipboard
  const handleCopyEmails = useCallback(async () => {
    const emails = selectedWithEmail.flatMap((l) => getLabelEmails(l));
    const emailText = emails.join(", ");
    try {
      await navigator.clipboard.writeText(emailText);
      toast({ title: t(locale, "campaign.emailsCopied") });
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = emailText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      toast({ title: t(locale, "campaign.emailsCopied") });
    }
  }, [selectedWithEmail, getLabelEmails, locale, toast]);

  // ==================== SAVED PITCH HANDLERS ====================

  // Build a SavedPitch snapshot from the current form state. Used by both
  // handleSaveDraft (status="draft") and handleSaveReady (status="ready").
  const buildSavedPitchSnapshot = useCallback((status: "draft" | "ready", name: string): Omit<SavedPitch, "id" | "createdAt" | "updatedAt"> => {
    const autoName = `${trackName.trim() || (locale === "it" ? "Senza nome" : "Untitled")} \u2192 ${selectedLabelIds.size} ${locale === "it" ? "label" : "label"}`;
    return {
      name: name.trim() || autoName,
      status,
      trackName: trackName.trim(),
      artistName: artistName.trim(),
      scLink,
      tone,
      language,
      customNote,
      selectedGenre,
      trackBpm,
      trackKey,
      epMode,
      epLinkMode,
      epSingleLink,
      selectedDemoIds: Array.from(selectedDemoIds),
      selectedLabelIds: Array.from(selectedLabelIds),
    };
  }, [trackName, artistName, scLink, tone, language, customNote, selectedGenre, trackBpm, trackKey, epMode, epLinkMode, epSingleLink, selectedDemoIds, selectedLabelIds, locale]);

  // Save as draft (private — does NOT appear in Demo section)
  const handleSaveDraft = useCallback(() => {
    if (!trackName.trim()) {
      toast({
        title: t(locale, "pitch.noTrackName"),
        description: t(locale, "pitch.needTrackName"),
        variant: "destructive",
      });
      return;
    }
    const snapshot = buildSavedPitchSnapshot("draft", draftName);
    addSavedPitch(snapshot);
    toast({ title: t(locale, "pitch.draftSaved") });
    setDraftName("");
    setShowDraftNameInput(false);
    setPitchSubTab("drafts");
  }, [trackName, draftName, buildSavedPitchSnapshot, addSavedPitch, locale, toast]);

  // Save as ready-to-send — pitch is complete and ready to fire, but the
  // user doesn't want to send it just yet (e.g. waiting on a final master,
  // or batching sends for a specific day). It lands in the new "ready"
  // sub-tab so it's easy to find and resume when the time comes.
  const handleSaveReady = useCallback(() => {
    if (!trackName.trim()) {
      toast({
        title: t(locale, "pitch.noTrackName"),
        description: t(locale, "pitch.needTrackName"),
        variant: "destructive",
      });
      return;
    }
    const snapshot = buildSavedPitchSnapshot("ready", draftName);
    addSavedPitch(snapshot);
    toast({ title: t(locale, "pitch.readySaved") });
    setDraftName("");
    setShowDraftNameInput(false);
    setPitchSubTab("ready");
  }, [trackName, draftName, buildSavedPitchSnapshot, addSavedPitch, locale, toast]);

  // Resume a saved draft — loads its snapshot back into the form state,
  // then switches to the "new" tab so the user can review & send.
  const handleResumeDraft = useCallback((pitch: SavedPitch) => {
    setPendingResume(pitch);
  }, []);

  // useEffect that processes the pending resume. Doing this in a useEffect
  // (rather than directly in the click handler) ensures React batches all
  // the state updates together and the form re-renders consistently.
  useEffect(() => {
    if (!pendingResume) return;
    const p = pendingResume;
    setTrackName(p.trackName);
    setArtistName(p.artistName);
    setScLink(p.scLink);
    setTone(p.tone);
    setLanguage(p.language);
    setCustomNote(p.customNote);
    setSelectedGenre(p.selectedGenre);
    setTrackBpm(p.trackBpm);
    setTrackKey(p.trackKey);
    setEpMode(p.epMode);
    setEpLinkMode(p.epLinkMode);
    setEpSingleLink(p.epSingleLink);
    setSelectedDemoIds(new Set(p.selectedDemoIds));
    setSelectedLabelIds(new Set(p.selectedLabelIds));
    // Infer pitchWorkflow from the resumed draft state:
    //   - epMode=true → "ep"
    //   - selectedDemoIds has 1+ entries → "single" (single-track pick)
    //   - otherwise → "manual"
    // This makes the workflow selector reflect the draft's nature so the
    // user sees the right demo picker UX after resume.
    setPitchWorkflow(
      p.epMode ? "ep" : (p.selectedDemoIds && p.selectedDemoIds.length > 0 ? "single" : "manual")
    );
    setPendingResume(null);
    setPitchSubTab("new");
    setCampaignComplete(false);

    // Warn if some labels/demos referenced in the draft no longer exist
    const missingLabels = p.selectedLabelIds.filter((id) => !labels.some((l) => l.id === id));
    const missingDemos = p.selectedDemoIds.filter((id) => !demos.some((d) => d.id === id));
    if (missingLabels.length > 0 || missingDemos.length > 0) {
      toast({
        title: t(locale, "pitch.cannotResume"),
        description: t(locale, "pitch.cannotResumeDesc"),
        variant: "destructive",
      });
    } else {
      toast({ title: t(locale, "pitch.resumeLoaded") });
    }
  }, [pendingResume, labels, demos, locale, toast]);

  // Delete a saved draft
  const handleDeleteDraft = useCallback((id: string) => {
    if (!window.confirm(t(locale, "pitch.confirmDelete"))) return;
    deleteSavedPitch(id);
    toast({ title: t(locale, "pitch.draftDeleted") });
  }, [deleteSavedPitch, locale, toast]);

  // Delete a sent campaign record (does NOT delete the linked Demo rows)
  const handleDeleteSent = useCallback((id: string) => {
    if (!window.confirm(t(locale, "pitch.confirmDeleteSent"))) return;
    deleteSentCampaign(id);
    toast({ title: t(locale, "pitch.sentDeleted") });
  }, [deleteSentCampaign, locale, toast]);

  // Track if campaign params changed (to reset completion state)
  const campaignParamsKey = `${selectedLabelIds.size}-${trackName}-${tone}-${language}-${customNote}`;
  const [lastCampaignKey, setLastCampaignKey] = useState(campaignParamsKey);
  if (campaignParamsKey !== lastCampaignKey) {
    setLastCampaignKey(campaignParamsKey);
    if (campaignComplete) setCampaignComplete(false);
  }

  return (
    <div className="space-y-4">
      {/* Sub-tab switcher: Nuova Campagna | Bozze | Inviati */}
      <Tabs value={pitchSubTab} onValueChange={(v) => setPitchSubTab(v as "new" | "drafts" | "ready" | "sent")}>
        <TabsList className="bg-card/60 border border-border/30 h-auto py-1">
          <TabsTrigger value="new" className="gap-1.5">
            <SendIcon className="h-3.5 w-3.5" />
            {t(locale, "pitch.tab.new")}
          </TabsTrigger>
          <TabsTrigger value="drafts" className="gap-1.5">
            <FileEdit className="h-3.5 w-3.5" />
            {t(locale, "pitch.tab.drafts")}
            {draftCount > 0 && (
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px] bg-cyan-500/20 text-cyan-300 border-cyan-500/30">
                {draftCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="ready" className="gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {t(locale, "pitch.tab.ready")}
            {readyCount > 0 && (
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px] bg-purple-500/20 text-purple-300 border-purple-500/30">
                {readyCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="sent" className="gap-1.5">
            <Inbox className="h-3.5 w-3.5" />
            {t(locale, "pitch.tab.sent")}
            {sentCampaigns.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px] bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                {sentCampaigns.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ===== TAB: Nuova Campagna (existing pitch form) ===== */}
        <TabsContent value="new" className="space-y-6 mt-4">
      {/* ===== TOP SECTION: Track Setup ===== */}
      <Card className="bg-card/60 border-border/30">
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Target className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-mono uppercase tracking-wider text-muted-foreground">
              {t(locale, "campaign.trackSetup")}
            </h3>
          </div>

          {/* ===== Pitch workflow selector — 2026-06-25 addition =====
              Gives the user an explicit top-level choice between:
                • Singola demo  → single-track pitch (default)
                • EP            → multi-track EP pitch (auto-enables epMode)
                • Manuale       → no demo picker, blank form
              The selector only changes the demo picker UX; the underlying
              pitch shape is still derived from epMode + selectedDemoIds,
              so saved drafts and resume flow keep working. */}
          <div className="mb-4">
            <UILabel className="text-xs font-mono uppercase text-muted-foreground flex items-center gap-1.5 mb-2">
              <Zap className="h-3 w-3" />
              {locale === "it" ? "Tipo di pitch" : "Pitch type"}
            </UILabel>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleSetPitchWorkflow("single")}
                className={`px-3 py-2 rounded-md text-xs font-medium border transition-colors flex items-center justify-center gap-1.5 ${
                  pitchWorkflow === "single"
                    ? "bg-primary/15 border-primary text-primary"
                    : "bg-background/40 border-border/40 text-muted-foreground hover:text-foreground hover:border-border/60"
                }`}
              >
                <Music2 className="h-3.5 w-3.5" />
                {locale === "it" ? "Singola demo" : "Single demo"}
              </button>
              <button
                type="button"
                onClick={() => handleSetPitchWorkflow("ep")}
                className={`px-3 py-2 rounded-md text-xs font-medium border transition-colors flex items-center justify-center gap-1.5 ${
                  pitchWorkflow === "ep"
                    ? "bg-purple-500/15 border-purple-500 text-purple-300"
                    : "bg-background/40 border-border/40 text-muted-foreground hover:text-foreground hover:border-border/60"
                }`}
              >
                <Disc3 className="h-3.5 w-3.5" />
                {locale === "it" ? "EP multi-traccia" : "Multi-track EP"}
              </button>
              <button
                type="button"
                onClick={() => handleSetPitchWorkflow("manual")}
                className={`px-3 py-2 rounded-md text-xs font-medium border transition-colors flex items-center justify-center gap-1.5 ${
                  pitchWorkflow === "manual"
                    ? "bg-amber-500/15 border-amber-500 text-amber-300"
                    : "bg-background/40 border-border/40 text-muted-foreground hover:text-foreground hover:border-border/60"
                }`}
              >
                <Eye className="h-3.5 w-3.5" />
                {locale === "it" ? "Manuale" : "Manual"}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground/70 mt-1.5">
              {pitchWorkflow === "single" && (
                locale === "it"
                  ? "Scegli una demo salvata per precompilare i campi, oppure compila a mano."
                  : "Pick a saved demo to auto-fill the form, or type everything manually."
              )}
              {pitchWorkflow === "ep" && (
                locale === "it"
                  ? "Seleziona 2+ demo per costruire un EP. Ogni traccia mantiene il proprio link SC."
                  : "Select 2+ demos to build an EP. Each track keeps its own SC link."
              )}
              {pitchWorkflow === "manual" && (
                locale === "it"
                  ? "Nessun demo picker — compila manualmente tutti i campi."
                  : "No demo picker — fill in all fields by hand."
              )}
            </p>
          </div>

          {/* Demo picker — hidden in "manual" mode. Lets the user recall a
              saved demo (or build an EP pitch from multiple demos) from
              their archive instead of retyping everything. When a demo is
              picked, we auto-fill trackName, artistName, scLink, genre,
              BPM, key (and for EPs, the tracklist goes in the note). */}
          {pitchWorkflow !== "manual" && demos.length > 0 && (
            <div className="space-y-1.5 mb-3 rounded-md border border-primary/20 bg-primary/5 p-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <UILabel className="text-xs font-mono uppercase text-primary flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3" />
                  {locale === "it" ? "Scegli demo salvata" : "Pick a saved demo"}
                  <span className="ml-1 text-[10px] text-muted-foreground/60 normal-case font-sans">
                    {locale === "it"
                      ? "(precompila i campi — modificabili dopo)"
                      : "(auto-fills the form — editable afterwards)"}
                  </span>
                </UILabel>
                <button
                  type="button"
                  onClick={() => {
                    const newMode = !epMode;
                    setEpMode(newMode);
                    if (!newMode) {
                      setSelectedDemoIds(new Set());
                    } else {
                      // Entering EP mode — clear the current form so the
                      // user starts fresh
                      setTrackName("");
                      setScLink("");
                      setCustomNote("");
                      setTrackAnalysis(null);
                    }
                  }}
                  className={`text-[10px] font-medium px-2 py-0.5 rounded border transition-colors inline-flex items-center gap-1 ${
                    epMode
                      ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                      : "bg-secondary/50 text-muted-foreground border-border/50 hover:border-purple-500/30 hover:text-purple-300"
                  }`}
                  title={locale === "it"
                    ? "Modalità EP: seleziona più tracce per creare un pitch EP"
                    : "EP mode: select multiple tracks to build an EP pitch"}
                >
                  <Disc3 className="h-3 w-3" />
                  {epMode
                    ? (locale === "it"
                        ? `EP attivo (${selectedDemoIds.size})`
                        : `EP active (${selectedDemoIds.size})`)
                    : (locale === "it" ? "Modalità EP" : "EP mode")}
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {demos
                  .slice()
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                  .slice(0, 50)
                  .map((d) => {
                    const isActive = epMode
                      ? selectedDemoIds.has(d.id)
                      : (trackName === d.trackName &&
                          (d.artists?.[0] || d.artistName) === artistName);
                    const otherArtists = getDemoCollaborators(d);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => handlePickDemo(d)}
                        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                          isActive
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-secondary/50 text-foreground border-border/50 hover:border-primary/30 hover:bg-primary/10"
                        }`}
                      >
                        <Music2 className="h-3 w-3" />
                        {d.trackName}
                        {otherArtists && (
                          <span className="text-[9px] opacity-70 truncate max-w-[120px]">{otherArtists}</span>
                        )}
                        {d.parentReleaseId && (
                          <span className="text-[9px] opacity-60 border border-current/30 rounded px-0.5">EP</span>
                        )}
                      </button>
                    );
                  })}
                {demos.length > 50 && (
                  <span className="text-[10px] text-muted-foreground/60 self-center">
                    {locale === "it"
                      ? `+${demos.length - 50} altre demo…`
                      : `+${demos.length - 50} more demos…`}
                  </span>
                )}
              </div>
              {epMode && selectedDemoIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDemoIds(new Set());
                    setTrackName("");
                    setScLink("");
                    setCustomNote("");
                    setTrackAnalysis(null);
                  }}
                  className="text-[10px] text-muted-foreground hover:text-foreground underline"
                >
                  {locale === "it" ? "Cancella selezione EP" : "Clear EP selection"}
                </button>
              )}
              {epMode && selectedDemoIds.size === 1 && (
                <p className="text-[10px] text-amber-400/70">
                  {locale === "it"
                    ? "Seleziona almeno 2 tracce per creare un pitch EP."
                    : "Select at least 2 tracks to build an EP pitch."}
                </p>
              )}
              {epMode && selectedDemoIds.size >= 2 && (
                <div className="mt-1 pt-1.5 border-t border-border/30 space-y-1.5">
                  <p className="text-[10px] font-mono uppercase text-muted-foreground/80">
                    {locale === "it"
                      ? "Come vuoi gestire i link SoundCloud?"
                      : "How do you want to handle SoundCloud links?"}
                  </p>
                  <div className="flex gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleToggleEpLinkMode("separate")}
                      className={`text-[10px] font-medium px-2 py-1 rounded border transition-colors inline-flex items-center gap-1 ${
                        epLinkMode === "separate"
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-secondary/50 text-muted-foreground border-border/50 hover:border-primary/30 hover:bg-primary/10"
                      }`}
                      title={locale === "it"
                        ? "Ogni traccia mantiene il suo link SoundCloud. L'email li elenca tutti, lasciando alla label la scelta del formato."
                        : "Each track keeps its own SoundCloud link. The email lists them all, leaving the format choice to the label."}
                    >
                      <Music2 className="h-3 w-3" />
                      {locale === "it" ? "Link separati" : "Separate links"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleEpLinkMode("single")}
                      className={`text-[10px] font-medium px-2 py-1 rounded border transition-colors inline-flex items-center gap-1 ${
                        epLinkMode === "single"
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-secondary/50 text-muted-foreground border-border/50 hover:border-primary/30 hover:bg-primary/10"
                      }`}
                      title={locale === "it"
                        ? "Hai creato l'EP come album/set privato su SoundCloud. L'email usa un solo link + tracklist nomi nel corpo."
                        : "You've created the EP as a private album/set on SoundCloud. The email uses one link + names-only tracklist in the body."}
                    >
                      <Disc3 className="h-3 w-3" />
                      {locale === "it" ? "Link unico EP" : "Single EP link"}
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground/70 leading-snug">
                    {epLinkMode === "separate"
                      ? (locale === "it"
                          ? "Modalità flessibile: la mail dice «queste tracce funzionano sia come EP sia come singoli — scegliete voi»."
                          : "Flexible mode: the email says «these tracks work both as an EP and as separate singles — your choice».")
                      : (locale === "it"
                          ? "Modalità EP vero: la mail presenta l'EP come un viaggio continuo con un solo link. Richiede album/set privato su SoundCloud."
                          : "True EP mode: the email presents the EP as a continuous journey with a single link. Requires private album/set on SoundCloud.")}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <UILabel className="text-xs font-mono uppercase text-muted-foreground">{t(locale, "pitch.trackName")}</UILabel>
              <Input
                value={trackName}
                onChange={(e) => setTrackName(e.target.value)}
                placeholder="e.g. Midnight Drive"
                className="bg-secondary/50 border-border/50"
              />
            </div>
            <div className="space-y-1.5">
              <UILabel className="text-xs font-mono uppercase text-muted-foreground">{t(locale, "pitch.artistName")}</UILabel>
              <Input
                value={artistName}
                onChange={(e) => setArtistName(e.target.value)}
                onBlur={handleArtistBlur}
                placeholder="e.g. Traacia"
                className="bg-secondary/50 border-border/50"
              />
            </div>
          </div>

          {/* scLink field — behavior depends on pitchShape (same UX as the
              label detail dialog). In ep-multi mode the per-track links are
              baked into the email body, so the single-link field is replaced
              by an explanatory note. In ep-single mode the field becomes the
              "EP SoundCloud URL" input (bound to epSingleLink). */}
          <div className="space-y-1.5 mt-3">
            {pitchShape === "ep-multi" ? (
              <>
                <UILabel className="text-xs font-mono uppercase text-muted-foreground">
                  {t(locale, "pitch.scLink")}
                </UILabel>
                <div className="text-[11px] text-muted-foreground/80 italic leading-snug bg-secondary/30 border border-dashed border-border/40 rounded px-2 py-1.5">
                  {locale === "it"
                    ? "I link SoundCloud di ogni traccia vengono inseriti automaticamente nel corpo dell'email (uno per traccia, con attribuzione)."
                    : "Each track's SoundCloud link is automatically included in the email body (one per track, with attribution)."}
                </div>
              </>
            ) : pitchShape === "ep-single" ? (
              <>
                <UILabel className="text-xs font-mono uppercase text-primary flex items-center gap-1">
                  <Disc3 className="h-3 w-3" />
                  {locale === "it" ? "Link EP SoundCloud" : "EP SoundCloud URL"}
                </UILabel>
                <Input
                  value={epSingleLink}
                  onChange={(e) => setEpSingleLink(e.target.value)}
                  placeholder={locale === "it"
                    ? "https://soundcloud.com/.../sets/ep-title"
                    : "https://soundcloud.com/.../sets/ep-title"}
                  className="bg-secondary/50 border-border/50"
                />
                <p className="text-[10px] text-muted-foreground/60 leading-tight">
                  {locale === "it"
                    ? "URL dell'album/set privato SoundCloud che contiene tutte le tracce dell'EP in sequenza."
                    : "URL of the private SoundCloud album/set containing all EP tracks in sequence."}
                </p>
              </>
            ) : (
              <>
                <UILabel className="text-xs font-mono uppercase text-muted-foreground">{t(locale, "pitch.scLink")}</UILabel>
                <Input
                  value={scLink}
                  onChange={(e) => setScLink(e.target.value)}
                  onBlur={handleScLinkBlur}
                  placeholder="https://soundcloud.com/..."
                  className="bg-secondary/50 border-border/50"
                />
              </>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
            <div className="space-y-1.5">
              <UILabel className="text-xs font-mono uppercase text-muted-foreground">{t(locale, "pitch.tone")}</UILabel>
              <Select value={tone} onValueChange={(v) => setTone(v as PitchTone)}>
                <SelectTrigger className="bg-secondary/50 border-border/50">
                  <SelectValue />
                </SelectTrigger>
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
              <Select value={language} onValueChange={(v) => setLanguage(v as PitchLanguage)}>
                <SelectTrigger className="bg-secondary/50 border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PITCH_LANGUAGES) as PitchLanguage[]).map((lang) => (
                    <SelectItem key={lang} value={lang}>{PITCH_LANGUAGES[lang]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <UILabel className="text-xs font-mono uppercase text-muted-foreground">
                {t(locale, "labels.selectGenre")} 🎯
              </UILabel>
              <Select value={selectedGenre} onValueChange={(v) => { setSelectedGenre(v); setSelectedLabelIds(new Set()); setCampaignComplete(false); }}>
                <SelectTrigger className="bg-secondary/50 border-border/50">
                  <SelectValue placeholder={t(locale, "campaign.selectGenreFirst")} />
                </SelectTrigger>
                <SelectContent>
                  {genres.map((g) => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5 mt-3">
            <UILabel className="text-xs font-mono uppercase text-muted-foreground">{t(locale, "pitch.additionalNote")}</UILabel>
            <Textarea
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              placeholder="..."
              rows={2}
              className="bg-secondary/50 border-border/50 resize-none"
            />
          </div>

          {/* ===== Track audio profile (BPM / key + audio analysis) =====
              These power the SimilarSuggestions panel below: by analyzing
              your track (or typing BPM/key manually), the app can mine the
              scraped Beatport DB and surface labels / artists that already
              release tracks like yours. */}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <UILabel className="text-xs font-mono uppercase text-muted-foreground flex items-center gap-1">
                <Activity className="h-3 w-3" /> BPM
              </UILabel>
              <Input
                value={trackBpm}
                onChange={(e) => setTrackBpm(e.target.value)}
                placeholder="128"
                className="bg-secondary/50 border-border/50"
              />
            </div>
            <div className="space-y-1.5">
              <UILabel className="text-xs font-mono uppercase text-muted-foreground">Key (Camelot)</UILabel>
              <Input
                value={trackKey}
                onChange={(e) => setTrackKey(e.target.value)}
                placeholder="8A"
                className="bg-secondary/50 border-border/50"
              />
            </div>
          </div>

          <div className="mt-2 flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAnalyzeTrack()}
              disabled={isAnalyzing || !scLink.trim()}
              className="h-7 text-xs"
            >
              {isAnalyzing ? (
                <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> {locale === "it" ? "Analisi..." : "Analyzing..."}</>
              ) : (
                <><Activity className="h-3 w-3 mr-1" /> {locale === "it" ? "Analizza link" : "Analyze link"}</>
              )}
            </Button>
            <label className="cursor-pointer">
              <input
                type="file"
                accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleAnalyzeTrack(f);
                  e.target.value = "";
                }}
              />
              <span className="inline-flex items-center gap-1 px-2.5 h-7 text-xs bg-secondary hover:bg-secondary/70 rounded-md border border-border/50 transition-colors">
                <Upload className="h-3 w-3" /> {locale === "it" ? "Carica file" : "Upload file"}
              </span>
            </label>
            {analysisError && (
              <span className="text-[10px] text-destructive">{analysisError}</span>
            )}
            {trackAnalysis && (
              <Badge variant="outline" className="text-[10px] bg-primary/10 border-primary/30 text-primary">
                <Sparkles className="h-2.5 w-2.5 mr-0.5" /> {trackAnalysis.bpm} BPM · {trackAnalysis.key.confidence === 0 ? "Key N/A" : trackAnalysis.key.camelot}
              </Badge>
            )}
          </div>

          {/* Similar labels & artists — appears as soon as BPM or key is set.
              Click a label name to open its detail page in the Labels tab,
              or click "use as target" (chevron) to add it to the campaign
              selection above. */}
          <div className="mt-3">
            <SimilarSuggestions
              analysis={trackAnalysis}
              genre={selectedGenre}
              manualBpm={trackBpm}
              manualKey={trackKey}
              artists={artists}
              labels={labels}
              locale={locale}
              onOpenLabel={handleOpenLabel}
              onOpenArtist={handleOpenArtist}
              onSelectLabel={handleSelectLabelAsTarget}
            />
          </div>
        </CardContent>
      </Card>

      {/* ===== MIDDLE SECTION: Target Labels ===== */}
      <Card className="bg-card/60 border-border/30">
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Music2 className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-mono uppercase tracking-wider text-muted-foreground">
                {t(locale, "campaign.targetLabels")}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                <Checkbox
                  checked={onlyWithEmail}
                  onCheckedChange={(checked) => setOnlyWithEmail(!!checked)}
                />
                {t(locale, "campaign.onlyWithEmail")}
              </label>
            </div>
          </div>

          {/* Selection stats */}
          {selectedLabelIds.size > 0 && (
            <div className="mb-3 flex items-center gap-3 flex-wrap">
              <span className="text-sm font-medium text-foreground">
                {t(locale, "campaign.selectedCount").replace("{count}", String(selectedLabelIds.size))}
              </span>
              <span className="text-xs text-emerald-400 flex items-center gap-1">
                <Mail className="h-3 w-3" />
                {selectedWithEmail.length} {t(locale, "campaign.withEmail")}
              </span>
              {selectedWithoutEmail.length > 0 && (
                <span className="text-xs text-amber-400 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {selectedWithoutEmail.length} {t(locale, "campaign.noEmail")}
                </span>
              )}
            </div>
          )}

          {/* Select all / Deselect all */}
          {allMatchingLabels.length > 0 && (
            <div className="flex items-center gap-2 mb-3">
              <Button variant="outline" size="sm" className="text-xs border-border/50" onClick={selectAll}>
                {t(locale, "campaign.selectAll")}
              </Button>
              <Button variant="outline" size="sm" className="text-xs border-border/50" onClick={deselectAll}>
                {t(locale, "campaign.deselectAll")}
              </Button>
            </div>
          )}

          {/* No genre selected */}
          {!selectedGenre && (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground/40">
              <Target className="h-10 w-10 mb-2" />
              <p className="text-sm">{t(locale, "campaign.selectGenreFirst")}</p>
            </div>
          )}

          {/* No matching labels */}
          {selectedGenre && allMatchingLabels.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground/40">
              <Music2 className="h-10 w-10 mb-2" />
              <p className="text-sm">{t(locale, "campaign.noMatchingLabels")}</p>
            </div>
          )}

          {/* Labels grouped by tier */}
          {selectedGenre && allMatchingLabels.length > 0 && (
            <div className="space-y-2">
              {(["top", "mid", "emerging"] as const).map((tier) => {
                const tierLabels = filteredByTier[tier];
                if (tierLabels.length === 0) return null;
                const tierLabel = tier === "top" ? t(locale, "labels.topTier") : tier === "mid" ? t(locale, "labels.midTier") : t(locale, "labels.emerging");
                const isExpanded = expandedTiers[tier] !== false;

                return (
                  <div key={tier} className="border border-border/20 rounded-lg overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between px-3 py-2 bg-secondary/30 hover:bg-secondary/50 transition-colors"
                      onClick={() => toggleTier(tier)}
                    >
                      <div className="flex items-center gap-2">
                        {tierBadge(tier)}
                        <span className="text-xs text-muted-foreground">{tierLabel}</span>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{tierLabels.length}</Badge>
                      </div>
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                    </button>
                    {isExpanded && (
                      <div className="divide-y divide-border/10 max-h-72 overflow-y-auto">
                        {tierLabels.map((label) => {
                          const emails = getLabelEmails(label);
                          const hasEmail = emails.length > 0;
                          const isSelected = selectedLabelIds.has(label.id);
                          const rank = label.rankByGenre?.[selectedGenre];

                          return (
                            <label
                              key={label.id}
                              className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-secondary/20 transition-colors ${
                                !hasEmail ? "opacity-60" : ""
                              }`}
                            >
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleLabel(label.id)}
                              />
                              <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium text-foreground truncate">{label.name}</span>
                                {rank && (
                                  <span className="text-[10px] font-mono text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded">
                                    #{rank}
                                  </span>
                                )}
                                <span className="text-[10px] text-primary/60 font-medium truncate max-w-[120px]">
                                  {selectedGenre}
                                </span>
                              </div>
                              <div className="shrink-0 flex items-center gap-1.5">
                                {hasEmail ? (
                                  <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[10px] px-1.5 py-0">
                                    <Mail className="h-2.5 w-2.5 mr-0.5" /> ✓
                                  </Badge>
                                ) : (
                                  <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[10px] px-1.5 py-0">
                                    <AlertCircle className="h-2.5 w-2.5 mr-0.5" />
                                  </Badge>
                                )}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===== BOTTOM SECTION: Campaign Preview & Send ===== */}
      <Card className="bg-card/60 border-border/30">
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-mono uppercase tracking-wider text-muted-foreground">
              {t(locale, "campaign.preview")}
            </h3>
          </div>

          {/* No labels selected */}
          {selectedLabelIds.size === 0 && (
            <div className="flex flex-col items-center justify-center py-6 text-muted-foreground/40">
              <Zap className="h-8 w-8 mb-2" />
              <p className="text-sm">{t(locale, "campaign.noLabelsSelected")}</p>
            </div>
          )}

          {/* Compact preview list */}
          {selectedLabelIds.size > 0 && (
            <div className="space-y-4">
              {/* Preview items */}
              <div className="divide-y divide-border/10 max-h-64 overflow-y-auto rounded-lg border border-border/20">
                {selectedLabels.map((label) => {
                  const emails = getLabelEmails(label);
                  const hasEmail = emails.length > 0;
                  const { subject } = getPitchForLabel(label);
                  const tier = getLabelTier(label, selectedGenre);

                  return (
                    <div key={label.id} className="flex items-start gap-2 px-3 py-2">
                      <div className="shrink-0 mt-0.5">
                        {hasEmail ? (
                          <Mail className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-medium text-foreground">{label.name}</span>
                          {tier && tierBadge(tier)}
                          {!hasEmail && (
                            <span className="text-[10px] text-amber-400/70">({t(locale, "campaign.noEmail")})</span>
                          )}
                        </div>
                        {subject && hasEmail && (
                          <p className="text-[11px] text-muted-foreground/60 font-mono truncate mt-0.5">{subject}</p>
                        )}
                        {hasEmail && (
                          <p className="text-[10px] text-emerald-400/50 font-mono truncate">{emails[0]}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Send section */}
              <div className="space-y-3">
                {/* Info about how campaign works */}
                <div className="flex items-start gap-2 p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                  <ExternalLink className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-cyan-300">{t(locale, "campaign.howItWorks")}</p>
                </div>

                {/* Copy emails button */}
                {selectedWithEmail.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={handleCopyEmails}
                    className="w-full border-border/50 text-muted-foreground hover:text-foreground"
                    disabled={!trackName.trim()}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    {t(locale, "campaign.copyAllEmails")} ({selectedWithEmail.length})
                  </Button>
                )}

                {/* Save as draft / ready-to-send — alternative to immediate send.
                    Lets the user prepare the campaign now and send it later
                    (or from another device). Drafts are private; ready-to-send
                    also appears in the Demo section as 'pronta per invio'. */}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowDraftNameInput(showDraftNameInput === "draft" ? false : "draft")}
                    className="border-border/50 text-muted-foreground hover:text-foreground"
                    disabled={!trackName.trim() || sending}
                  >
                    <FileEdit className="h-4 w-4 mr-2" />
                    {t(locale, "pitch.saveDraft")}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowDraftNameInput(showDraftNameInput === "ready" ? false : "ready")}
                    className="border-purple-500/30 text-purple-300 hover:text-purple-200 hover:bg-purple-500/10"
                    disabled={!trackName.trim() || sending}
                  >
                    <Inbox className="h-4 w-4 mr-2" />
                    {t(locale, "pitch.saveReady")}
                  </Button>
                </div>

                {/* Draft name input (conditionally shown) */}
                {showDraftNameInput && (
                  <div className="p-3 rounded-lg bg-cyan-500/5 border border-cyan-500/20 space-y-2">
                    <p className="text-xs text-cyan-300/80">
                      {showDraftNameInput === "ready" ? t(locale, "pitch.saveReadyDesc") : t(locale, "pitch.saveDraftDesc")}
                    </p>
                    <Input
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      placeholder={t(locale, "pitch.draftNamePlaceholder")}
                      className="bg-background/50 border-border/50"
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={showDraftNameInput === "ready" ? handleSaveReady : handleSaveDraft}
                        className={`flex-1 h-10 ${showDraftNameInput === "ready" ? "bg-purple-600 hover:bg-purple-700 text-white" : "bg-cyan-600 hover:bg-cyan-700 text-white"}`}
                      >
                        <Check className="h-4 w-4 mr-2" />
                        {showDraftNameInput === "ready" ? t(locale, "pitch.saveReady") : t(locale, "pitch.saveDraft")}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => { setShowDraftNameInput(false); setDraftName(""); }}
                        className="text-muted-foreground"
                      >
                        {t(locale, "pitch.delete")}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Send button - opens Gmail compose for each */}
                <Button
                  onClick={handleSendCampaign}
                  className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white h-12 text-base font-semibold"
                  disabled={
                    selectedWithEmail.length === 0 ||
                    sending ||
                    !trackName.trim()
                  }
                >
                  {sending ? (
                    <>
                      <ExternalLink className="h-5 w-5 mr-2" />
                      {t(locale, "campaign.opening")
                        .replace("{current}", String(sendProgress.current))
                        .replace("{total}", String(sendProgress.total))}
                    </>
                  ) : campaignComplete ? (
                    <>
                      <Check className="h-5 w-5 mr-2" />
                      {t(locale, "campaign.complete")}
                    </>
                  ) : (
                    <>
                      <Send className="h-5 w-5 mr-2" />
                      {t(locale, "campaign.sendCampaign")}
                    </>
                  )}
                </Button>

                {/* Campaign summary */}
                {campaignComplete && (
                  <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 space-y-2">
                    <div className="flex items-center gap-2 text-emerald-300">
                      <Check className="h-4 w-4" />
                      <span className="text-sm font-medium">{t(locale, "campaign.complete")}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-emerald-400 flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {t(locale, "campaign.sentCount").replace("{count}", String(campaignResults.sent))}
                      </span>
                      {campaignResults.skipped > 0 && (
                        <span className="text-amber-400 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {t(locale, "campaign.skippedCount").replace("{count}", String(campaignResults.skipped))}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        {/* ===== TAB: Bozze (saved drafts — status='draft' only) ===== */}
        <TabsContent value="drafts" className="mt-4">
          <PitchListCard
            status="draft"
            pitches={savedPitches}
            labels={labels}
            demos={demos}
            locale={locale}
            onResume={handleResumeDraft}
            onDelete={handleDeleteDraft}
            onGoNew={() => setPitchSubTab("new")}
          />
        </TabsContent>

        {/* ===== TAB: Pronta per invio (saved pitches — status='ready' only) =====
            2026-06-25 addition. Ready pitches used to be mixed into "Bozze"
            with a colored badge — they now have their own dedicated sub-tab
            so the user can find them at a glance and fire them off when ready. */}
        <TabsContent value="ready" className="mt-4">
          <PitchListCard
            status="ready"
            pitches={savedPitches}
            labels={labels}
            demos={demos}
            locale={locale}
            onResume={handleResumeDraft}
            onDelete={handleDeleteDraft}
            onGoNew={() => setPitchSubTab("new")}
          />
        </TabsContent>

        {/* ===== TAB: Inviati (sent campaigns) ===== */}
        <TabsContent value="sent" className="mt-4">
          <Card className="bg-card/60 border-border/30">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <Inbox className="h-4 w-4 text-emerald-400" />
                <h3 className="text-sm font-mono uppercase tracking-wider text-muted-foreground">
                  {t(locale, "pitch.tab.sent")}
                </h3>
                {sentCampaigns.length > 0 && (
                  <Badge variant="secondary" className="ml-auto bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                    {sentCampaigns.length}
                  </Badge>
                )}
              </div>

              {sentCampaigns.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground/40 text-center">
                  <Inbox className="h-10 w-10 mb-3" />
                  <p className="text-sm font-medium">{t(locale, "pitch.sentEmpty")}</p>
                  <p className="text-xs mt-1 max-w-md">{t(locale, "pitch.sentEmptyDesc")}</p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => setPitchSubTab("new")}
                  >
                    <SendIcon className="h-4 w-4 mr-2" />
                    {t(locale, "pitch.tab.new")}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {sentCampaigns.map((campaign) => {
                    const openedRecipients = campaign.recipients.filter((r) => r.status === "opened");
                    const skippedRecipients = campaign.recipients.filter((r) => r.status === "skipped");
                    return (
                      <div
                        key={campaign.id}
                        className="p-4 rounded-lg border border-border/30 bg-background/40"
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-foreground truncate">{campaign.name}</span>
                              <Badge variant="secondary" className="h-5 text-[10px] bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                                {campaign.sentCount} {locale === "it" ? "inviate" : "sent"}
                              </Badge>
                              {campaign.skippedCount > 0 && (
                                <Badge variant="secondary" className="h-5 text-[10px] bg-amber-500/20 text-amber-300 border-amber-500/30">
                                  {campaign.skippedCount} {locale === "it" ? "saltate" : "skipped"}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 truncate">
                              {campaign.trackName}
                              {campaign.epMode && campaign.selectedDemoIds.length > 0 && (
                                <span className="ml-2 text-purple-300/70">
                                  · {t(locale, "pitch.trackCount").replace("{count}", String(campaign.selectedDemoIds.length))}
                                </span>
                              )}
                            </p>
                            <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                              {t(locale, "pitch.sentDate")}: {new Date(campaign.sentAt).toLocaleString(locale)}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteSent(campaign.id)}
                            className="h-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>

                        {/* Recipients list — collapsible */}
                        {openedRecipients.length > 0 && (
                          <details className="mt-2 group">
                            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                              <ChevronDown className="h-3 w-3 group-open:hidden" />
                              <ChevronUp className="h-3 w-3 hidden group-open:inline" />
                              {t(locale, "pitch.recipients")} ({openedRecipients.length})
                            </summary>
                            <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto">
                              {openedRecipients.map((r, idx) => (
                                <div key={idx} className="text-xs p-2 rounded bg-background/30 border border-border/20">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-medium text-foreground">{r.labelName}</span>
                                    {r.gmailUrl && (
                                      <a
                                        href={r.gmailUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 shrink-0"
                                      >
                                        <Eye className="h-3 w-3" />
                                        {t(locale, "pitch.viewEmail")}
                                      </a>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-emerald-400/60 font-mono truncate mt-0.5">{r.email}</p>
                                  <p className="text-[10px] text-muted-foreground/60 font-mono truncate mt-0.5">{r.subject}</p>
                                </div>
                              ))}
                            </div>
                          </details>
                        )}

                        {skippedRecipients.length > 0 && (
                          <details className="mt-1 group">
                            <summary className="cursor-pointer text-xs text-amber-400/70 hover:text-amber-400 transition-colors">
                              {locale === "it" ? `${skippedRecipients.length} label senza email` : `${skippedRecipients.length} labels without email`}
                            </summary>
                            <div className="mt-1 text-[10px] text-muted-foreground/60">
                              {skippedRecipients.map((r, idx) => r.labelName).join(", ")}
                            </div>
                          </details>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================================
// PitchListCard — internal sub-component used by the "Bozze" and
// "Pronta per invio" sub-tabs. Renders a list of SavedPitch items filtered
// by status, with empty-state, badges, "Riprendi" and "Delete" actions.
// Extracted from the inline JSX on 2026-06-25 to avoid duplicating ~100
// lines when the dedicated "ready" sub-tab was added.
// ============================================================================
interface PitchListCardProps {
  status: "draft" | "ready";
  pitches: SavedPitch[];
  labels: Label[];
  demos: Demo[];
  locale: Locale;
  onResume: (pitch: SavedPitch) => void;
  onDelete: (id: string) => void;
  onGoNew: () => void;
}

function PitchListCard({
  status,
  pitches,
  labels,
  demos,
  locale,
  onResume,
  onDelete,
  onGoNew,
}: PitchListCardProps) {
  const filtered = useMemo(
    () =>
      pitches
        .filter((p) => p.status === status)
        .sort(
          (a, b) =>
            new Date(b.updatedAt || b.createdAt).getTime() -
            new Date(a.updatedAt || a.createdAt).getTime()
        ),
    [pitches, status]
  );

  // Visual config per status
  const config = {
    draft: {
      Icon: FileEdit,
      iconColor: "text-cyan-400",
      badgeClass: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
      emptyTitleKey: "pitch.draftsEmpty" as const,
      emptyDescKey: "pitch.draftsEmptyDesc" as const,
      emptyIcon: FileEdit,
    },
    ready: {
      Icon: CheckCircle2,
      iconColor: "text-purple-400",
      badgeClass: "bg-purple-500/20 text-purple-300 border-purple-500/30",
      emptyTitleKey: "pitch.readyEmpty" as const,
      emptyDescKey: "pitch.readyEmptyDesc" as const,
      emptyIcon: CheckCircle2,
    },
  }[status];

  const EmptyIcon = config.emptyIcon;

  return (
    <Card className="bg-card/60 border-border/30">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <config.Icon className={`h-4 w-4 ${config.iconColor}`} />
          <h3 className="text-sm font-mono uppercase tracking-wider text-muted-foreground">
            {t(locale, status === "draft" ? "pitch.tab.drafts" : "pitch.tab.ready")}
          </h3>
          {filtered.length > 0 && (
            <Badge variant="secondary" className={`ml-auto ${config.badgeClass}`}>
              {filtered.length}
            </Badge>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground/40 text-center">
            <EmptyIcon className="h-10 w-10 mb-3" />
            <p className="text-sm font-medium">{t(locale, config.emptyTitleKey)}</p>
            <p className="text-xs mt-1 max-w-md">{t(locale, config.emptyDescKey)}</p>
            <Button variant="outline" className="mt-4" onClick={onGoNew}>
              <SendIcon className="h-4 w-4 mr-2" />
              {t(locale, "pitch.tab.new")}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((pitch) => {
              const validLabelCount = pitch.selectedLabelIds.filter((id) =>
                labels.some((l) => l.id === id)
              ).length;
              const validDemoCount = pitch.selectedDemoIds.filter((id) =>
                demos.some((d) => d.id === id)
              ).length;
              const hasMissingRefs =
                validLabelCount < pitch.selectedLabelIds.length ||
                validDemoCount < pitch.selectedDemoIds.length;
              return (
                <div
                  key={pitch.id}
                  className="p-4 rounded-lg border border-border/30 bg-background/40 hover:border-border/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground truncate">
                          {pitch.name}
                        </span>
                        <Badge variant="secondary" className={`h-5 text-[10px] ${config.badgeClass}`}>
                          {pitch.status === "ready"
                            ? t(locale, "pitch.readyToSend")
                            : t(locale, "pitch.draft")}
                        </Badge>
                        {hasMissingRefs && (
                          <Badge
                            variant="secondary"
                            className="h-5 text-[10px] bg-amber-500/20 text-amber-300 border-amber-500/30"
                          >
                            !
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {pitch.trackName || <em>(no name)</em>}
                        {pitch.epMode && pitch.selectedDemoIds.length > 0 && (
                          <span className="ml-2 text-purple-300/70">
                            ·{" "}
                            {t(locale, "pitch.trackCount").replace(
                              "{count}",
                              String(pitch.selectedDemoIds.length)
                            )}
                          </span>
                        )}
                        <span className="ml-2 text-cyan-300/70">
                          ·{" "}
                          {t(locale, "pitch.labelCount").replace(
                            "{count}",
                            String(pitch.selectedLabelIds.length)
                          )}
                        </span>
                      </p>
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                        {new Date(pitch.updatedAt || pitch.createdAt).toLocaleString(locale)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onResume(pitch)}
                        className="h-8 border-border/50"
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1" />
                        {t(locale, "pitch.resume")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onDelete(pitch.id)}
                        className="h-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
