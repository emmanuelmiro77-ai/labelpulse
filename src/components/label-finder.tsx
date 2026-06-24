"use client";

import { useAppStore, getLabelTier, type Label, type Artist, type ArtistTrack } from "@/lib/store";
import { t } from "@/lib/i18n";
import { getLabelDiscoveryUrls } from "@/lib/label-links";
import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
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
  Disc3,
  Play,
  Pause,
  Headphones,
  BarChart3,
  Users,
  RotateCcw,
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
  parsePitchText,
  PITCH_LANGUAGES,
  type PitchTone,
  type PitchLanguage,
} from "@/lib/pitch-utils";

const SUBMISSION_TYPES = ["email", "webform", "platform"] as const;

// ==================== SMART URL HELPER ====================
// Converts partial usernames/handles into full clickable URLs.
// E.g. "spectrummusicnl" → "https://instagram.com/spectrummusicnl"
// If already a full URL, returns as-is.

// ==================== LINK TYPE DEFINITIONS ====================
const LINK_TYPES = [
  { id: "website", labelKey: "labels.linkTypeWebsite", icon: Globe, placeholder: "https://www.label.com", color: "text-blue-400" },
  { id: "instagram", labelKey: "labels.linkTypeInstagram", icon: ExternalLink, placeholder: "username", color: "text-pink-400" },
  { id: "soundcloud", labelKey: "labels.linkTypeSoundcloud", icon: Music2, placeholder: "username", color: "text-orange-400" },
  { id: "beatport", labelKey: "labels.linkTypeBeatport", icon: Disc3, placeholder: "label-slug", color: "text-forest-400" },
  { id: "spotify", labelKey: "labels.linkTypeSpotify", icon: Music2, placeholder: "artist-id", color: "text-green-400" },
  { id: "youtube", labelKey: "labels.linkTypeYoutube", icon: ExternalLink, placeholder: "@channel", color: "text-red-400" },
  { id: "bandcamp", labelKey: "labels.linkTypeBandcamp", icon: Music2, placeholder: "username", color: "text-cyan-400" },
  { id: "demoLink", labelKey: "labels.linkTypeDemoLink", icon: Link2, placeholder: "https://www.label.com/submit-demo", color: "text-purple-400" },
  { id: "other", labelKey: "labels.linkTypeOther", icon: ExternalLink, placeholder: "https://...", color: "text-gray-400" },
] as const;

type LinkTypeId = typeof LINK_TYPES[number]["id"];

interface DetailLink {
  type: LinkTypeId | string;
  value: string;
}

// Format seconds as M:SS (e.g. 73 -> "1:13"). Used by the audio seek bar.
function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Smart URL builder for each link type
function toClickableUrl(value: string, linkType: string): string | null {
  if (!value || !value.trim()) return null;
  const v = value.trim();

  // Already a full URL
  if (/^https?:\/\//i.test(v)) return v;

  // Email
  if (v.includes("@") && linkType !== "instagram" && linkType !== "soundcloud") {
    return `mailto:${v}`;
  }

  // Type-specific smart defaults
  switch (linkType) {
    case "instagram":
      if (/^[a-zA-Z0-9._]{1,30}$/.test(v)) {
        return `https://instagram.com/${v.replace(/^@/, "")}`;
      }
      return `https://${v}`;
    case "soundcloud":
      if (/^[a-zA-Z0-9._-]{1,30}$/.test(v)) {
        return `https://soundcloud.com/${v.replace(/^@/, "")}`;
      }
      return `https://${v}`;
    case "beatport":
      if (/^[a-zA-Z0-9._-]{1,50}$/.test(v)) {
        return `https://www.beatport.com/label/${v.replace(/^@/, "")}`;
      }
      return `https://${v}`;
    case "spotify":
      if (/^[a-zA-Z0-9._-]{1,40}$/.test(v)) {
        return `https://open.spotify.com/artist/${v.replace(/^@/, "")}`;
      }
      return `https://${v}`;
    case "youtube":
      if (/^@?[a-zA-Z0-9._-]{1,40}$/.test(v)) {
        return `https://youtube.com/${v.replace(/^@/, "@")}`;
      }
      return `https://${v}`;
    case "bandcamp":
      if (/^[a-zA-Z0-9._-]{1,40}$/.test(v)) {
        return `https://${v}.bandcamp.com`;
      }
      return `https://${v}`;
    case "website":
    case "demoLink":
    case "other":
    default:
      return `https://${v}`;
  }
}

// Get placeholder for a link type
function getLinkPlaceholder(linkType: string): string {
  const found = LINK_TYPES.find(lt => lt.id === linkType);
  return found?.placeholder || "https://...";
}

// Get icon component for a link type
function getLinkIcon(linkType: string): React.ComponentType<{ className?: string }> {
  const found = LINK_TYPES.find(lt => lt.id === linkType);
  return found?.icon || ExternalLink;
}

// Get color class for a link type
function getLinkColor(linkType: string): string {
  const found = LINK_TYPES.find(lt => lt.id === linkType);
  return found?.color || "text-cyan-400";
}

// Convert fixed link fields + customLinks into a unified DetailLink array
function labelToDetailLinks(label: Label): DetailLink[] {
  const links: DetailLink[] = [];
  if (label.website?.trim()) links.push({ type: "website", value: label.website });
  if (label.socialLink?.trim()) links.push({ type: "instagram", value: label.socialLink });
  if (label.soundcloudLink?.trim()) links.push({ type: "soundcloud", value: label.soundcloudLink });
  if (label.beatportLink?.trim()) links.push({ type: "beatport", value: label.beatportLink });
  if (label.demoLink?.trim()) links.push({ type: "demoLink", value: label.demoLink });
  // Add custom links
  if (label.customLinks?.length) {
    for (const cl of label.customLinks) {
      if (cl.value?.trim()) links.push({ type: cl.type, value: cl.value });
    }
  }
  return links;
}

// Save a DetailLink array back to the fixed fields + customLinks
function detailLinksToFields(links: DetailLink[]): Partial<Label> {
  const fields: Partial<Label> = {
    website: "",
    socialLink: "",
    soundcloudLink: "",
    beatportLink: "",
    demoLink: "",
    customLinks: [],
  };
  for (const link of links) {
    if (!link.value?.trim()) continue;
    switch (link.type) {
      case "website":
        fields.website = link.value;
        break;
      case "instagram":
        fields.socialLink = link.value;
        break;
      case "soundcloud":
        fields.soundcloudLink = link.value;
        break;
      case "beatport":
        fields.beatportLink = link.value;
        break;
      case "demoLink":
        fields.demoLink = link.value;
        break;
      default:
        // Custom type - goes into customLinks
        if (!fields.customLinks) fields.customLinks = [];
        fields.customLinks.push({ type: link.type, value: link.value });
        break;
    }
  }
  return fields;
}

// Get display text for a link (strips protocol for cleaner display)
function getLinkDisplay(value: string): string {
  return value
    .replace(/^https?:\/\//, "")
    .replace(/^mailto:/, "")
    .replace(/\/$/, "");
}

/**
 * Shorten a URL for DISPLAY ONLY — the clickable href stays the full URL.
 *
 * Strategy:
 *   - For short URLs (<= maxLen chars without protocol), show as-is.
 *   - For long URLs, show:  hostname/.../last-path-segment?query
 *     Example:
 *       https://www.beatport.com/label/hilomatik-records/12345/release/67890?utm_source=google&utm_campaign=...
 *       →  www.beatport.com/.../67890?utm_source=google&utm_campaign=...
 *
 * This keeps the link recognizable (hostname + final destination visible)
 * while preventing ultra-long tracking URLs from breaking the layout on
 * mobile. The href attribute is NEVER shortened — clicks still go to the
 * original URL.
 */
function shortenUrlForDisplay(rawUrl: string, maxLen: number = 60): string {
  if (!rawUrl) return "";
  // Strip protocol
  let s = rawUrl.replace(/^https?:\/\//i, "").replace(/^mailto:/i, "");
  // Strip trailing slash
  s = s.replace(/\/$/, "");
  if (s.length <= maxLen) return s;

  // Try to parse: hostname + path + ?query
  // We do this manually (not new URL) because some inputs may be partial URLs.
  const slashIdx = s.indexOf("/");
  const hostname = slashIdx >= 0 ? s.slice(0, slashIdx) : s;
  const rest = slashIdx >= 0 ? s.slice(slashIdx) : "";

  // Find query string
  const qIdx = rest.indexOf("?");
  const path = qIdx >= 0 ? rest.slice(0, qIdx) : rest;
  const query = qIdx >= 0 ? rest.slice(qIdx) : "";

  // Last path segment
  const segments = path.split("/").filter(Boolean);
  const lastSeg = segments.length > 0 ? segments[segments.length - 1] : "";

  // Build shortened version
  let shortPath: string;
  if (lastSeg) {
    shortPath = `/.../${lastSeg}`;
  } else {
    shortPath = "/...";
  }

  // If query is very long, truncate it too
  let shortQuery = query;
  if (query.length > 25) {
    shortQuery = query.slice(0, 22) + "...";
  }

  const result = hostname + shortPath + shortQuery;
  // Final safety cap
  if (result.length > maxLen + 10) {
    return result.slice(0, maxLen - 1) + "…";
  }
  return result;
}

/**
 * Compact row of clickable discovery icons for a label.
 * Renders tiny icon-buttons that open Beatport / Beatstats / SoundCloud /
 * Website in a new tab. Mirrors the same component in rankings-page.tsx
 * so the UX is identical across the two pages.
 *
 * Each click handler stops propagation so the parent card's onClick
 * (which opens the detail dialog) doesn't also fire.
 */
function LabelDiscoveryIcons({
  label,
  size = 12,
}: {
  label: Label;
  size?: number;
}) {
  if (!label?.name) return null;
  const urls = getLabelDiscoveryUrls(label);
  const btnClass =
    "inline-flex items-center justify-center rounded p-0.5 transition-colors hover:bg-accent/40 shrink-0";

  return (
    <div className="inline-flex items-center gap-0.5 ml-1">
      {/* Beatport — direct (green) if user-saved, search (muted) otherwise */}
      <a
        href={urls.beatport}
        target="_blank"
        rel="noopener noreferrer"
        title={
          urls.beatportIsDirect
            ? `Apri ${label.name} su Beatport (link diretto)`
            : `Cerca ${label.name} su Beatport`
        }
        className={`${btnClass} ${
          urls.beatportIsDirect
            ? "text-emerald-400 hover:text-emerald-300"
            : "text-muted-foreground hover:text-emerald-400"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <ExternalLink style={{ width: size, height: size }} />
      </a>

      {/* Beatstats — always search */}
      <a
        href={urls.beatstats}
        target="_blank"
        rel="noopener noreferrer"
        title={`Cerca ${label.name} su Beatstats`}
        className={`${btnClass} text-muted-foreground hover:text-amber-400`}
        onClick={(e) => e.stopPropagation()}
      >
        <BarChart3 style={{ width: size, height: size }} />
      </a>

      {/* SoundCloud — only if direct link exists */}
      {label.soundcloudLink && (
        <a
          href={urls.soundcloud}
          target="_blank"
          rel="noopener noreferrer"
          title={`Apri ${label.name} su SoundCloud`}
          className={`${btnClass} text-muted-foreground hover:text-orange-400`}
          onClick={(e) => e.stopPropagation()}
        >
          <Music2 style={{ width: size, height: size }} />
        </a>
      )}
    </div>
  );
}

export function LabelFinder() {
  const { labels, demos, addLabel, updateLabel, deleteLabel, addDemo, locale, getGenres, setActiveTab, userProfile, setUserProfile, gmailAuth, setGmailAuth, selectedLabelId, setSelectedLabelId, selectedArtistId, setSelectedArtistId, setNavigationReturnTo, artists } =
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
  const [detailLinks, setDetailLinks] = useState<DetailLink[]>([]);
  const [detailNotes, setDetailNotes] = useState("");
  const [detailStatus, setDetailStatus] = useState<"open" | "closed">("open");
  const [detailSubmissionType, setDetailSubmissionType] = useState<"email" | "webform" | "platform">("email");
  const [detailSaved, setDetailSaved] = useState(false);

  // Audio preview state — for the "Top tracks on Beatport" section in the
  // label detail dialog. We only play one sample at a time; clicking play
  // on another track stops the previous one.
  const [playingTrackId, setPlayingTrackId] = useState<number | null>(null);
  // Seek bar state — currentTime and duration for the currently-playing track.
  // Updated via the <audio> timeupdate event listener; reset on track change.
  const [audioProgress, setAudioProgress] = useState<{ current: number; duration: number }>({ current: 0, duration: 0 });
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Derive the label's Top 10 tracks from the scraped artist data. Each
  // artist has tracksByGenre; we flatten and filter by `track.label ===
  // detailLabel.name` (case-insensitive). We dedupe by track.id (the same
  // track can appear under multiple artists/genres). Sorted by chart
  // position ascending (1 = highest). Capped at 10 to match Beatport's
  // "Top 10" label page format.
  const labelTopTracks = useMemo<ArtistTrack[]>(() => {
    if (!detailLabel) return [];
    const targetName = detailLabel.name.toLowerCase().trim();
    const seen = new Set<number>();
    const tracks: ArtistTrack[] = [];
    const safeArtists: Artist[] = Array.isArray(artists) ? artists : [];
    for (const artist of safeArtists) {
      const genres = artist.tracksByGenre || {};
      for (const genre of Object.keys(genres)) {
        for (const track of genres[genre] || []) {
          if (!track || !track.label) continue;
          if (track.label.toLowerCase().trim() !== targetName) continue;
          if (seen.has(track.id)) continue;
          seen.add(track.id);
          tracks.push(track);
        }
      }
    }
    // Sort by chart position (1 first), then by points descending as tiebreaker
    tracks.sort((a, b) => {
      if (a.position !== b.position) return a.position - b.position;
      return (b.points || 0) - (a.points || 0);
    });
    return tracks.slice(0, 10);
  }, [detailLabel, artists]);

  // Derive the label's Top artists from the scraped artist data. We look
  // at every artist whose `labelsPublishedOn` array contains this label's
  // name (case-insensitive), or who has at least one track published on
  // this label (defensive — labelsPublishedOn is best-effort and may miss
  // some entries). Each artist's "label score" = sum of points of all
  // their tracks on this label (across all genres). Sorted desc, top 10.
  //
  // The user can then click an artist name to jump to the Artist Explorer
  // detail page (cross-tab navigation via selectedArtistId + setActiveTab).
  const labelTopArtists = useMemo<Array<{
    id: string;
    name: string;
    imageUrl: string;
    totalLabelPoints: number;
    trackCount: number;
    bestPosition: number | null;
    isRemixerOnly: boolean;
  }>>(() => {
    if (!detailLabel) return [];
    const targetName = detailLabel.name.toLowerCase().trim();
    const safeArtists: Artist[] = Array.isArray(artists) ? artists : [];
    const results: Array<{
      id: string;
      name: string;
      imageUrl: string;
      totalLabelPoints: number;
      trackCount: number;
      bestPosition: number | null;
      isRemixerOnly: boolean;
    }> = [];

    for (const artist of safeArtists) {
      // Match: artist explicitly lists this label OR has at least one track
      // on this label in any genre.
      const listsLabel = (artist.labelsPublishedOn || []).some(
        (ln) => ln.toLowerCase().trim() === targetName
      );
      let totalLabelPoints = 0;
      let trackCount = 0;
      let bestPosition: number | null = null;
      for (const genre of Object.keys(artist.tracksByGenre || {})) {
        for (const track of artist.tracksByGenre[genre] || []) {
          if (!track || !track.label) continue;
          if (track.label.toLowerCase().trim() !== targetName) continue;
          trackCount += 1;
          totalLabelPoints += track.points || 0;
          if (bestPosition === null || track.position < bestPosition) {
            bestPosition = track.position;
          }
        }
      }
      if (!listsLabel && trackCount === 0) continue;
      results.push({
        id: artist.id,
        name: artist.name,
        imageUrl: artist.imageUrl || "",
        totalLabelPoints,
        trackCount,
        bestPosition,
        isRemixerOnly: !!artist.isRemixerOnly,
      });
    }

    // Sort: total label points desc; tiebreak by best chart position asc;
    // final tiebreak by name asc for stable ordering.
    results.sort((a, b) => {
      if (a.totalLabelPoints !== b.totalLabelPoints) {
        return b.totalLabelPoints - a.totalLabelPoints;
      }
      if (a.bestPosition !== null && b.bestPosition !== null && a.bestPosition !== b.bestPosition) {
        return a.bestPosition - b.bestPosition;
      }
      return a.name.localeCompare(b.name);
    });
    return results.slice(0, 10);
  }, [detailLabel, artists]);

  // Navigate to the Artist Explorer detail page for the given artist id.
  // Closes the label dialog first so the artist page is fully visible.
  // ALSO records a navigation return-to so the user can come back to this
  // exact label via the Artist Explorer's Back button.
  const handleOpenArtist = useCallback(
    (artistId: string) => {
      // Record where we came from so Artist Explorer's Back can return here.
      // We use the label's id (preferred) or name as fallback. The LabelFinder
      // dialog re-opens via the `selectedLabelId` mechanism.
      if (detailLabel) {
        const labelId = detailLabel.id || detailLabel.name;
        setNavigationReturnTo?.({ kind: "label", labelId, labelName: detailLabel.name });
      }
      setDetailLabel(null);
      setSelectedArtistId?.(artistId);
      setActiveTab("artists");
      // Scroll to top so the artist hero is visible.
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    },
    [setActiveTab, setSelectedArtistId, setNavigationReturnTo, detailLabel]
  );

  const togglePlayTrack = useCallback((track: ArtistTrack) => {
    if (!audioRef.current) return;
    if (playingTrackId === track.id) {
      audioRef.current.pause();
      setPlayingTrackId(null);
      return;
    }
    audioRef.current.src = track.sampleUrl;
    // Force the browser to start loading the audio so loadedmetadata fires
    // ASAP. Without this, preload="none" delays metadata loading and the
    // seek bar stays inert for the first second of playback.
    audioRef.current.load();
    audioRef.current.play().catch(() => {
      // CORS or network failure — silently ignore, the play button just
      // won't toggle. The Beatport sample URL is meant to be hot-linkable.
    });
    setPlayingTrackId(track.id);
    // Reset progress for the new track. The actual currentTime/duration
    // will be filled in by the timeupdate + progress listeners.
    setAudioProgress({ current: 0, duration: 0 });
  }, [playingTrackId]);

  // Resolve the effective duration for the currently-playing track.
  // We try, in order:
  //   1. audio.duration — works if the server sends Content-Length
  //   2. audio.seekable.end(last) — works as soon as the browser has
  //      buffered enough to know the end of the stream, even for chunked
  //      transfer encoding where duration stays Infinity
  // Returns 0 if neither is available yet (UI shows "loading" state).
  const computeEffectiveDuration = useCallback((audio: HTMLAudioElement): number => {
    const d = audio.duration;
    if (Number.isFinite(d) && d > 0) return d;
    // seekable is a TimeRanges object; if it has at least one range, the
    // end of the last range is the furthest point the browser knows about.
    // For chunked audio with no Content-Length, this becomes accurate as
    // soon as the first chunk downloads (often < 500ms after play()).
    try {
      const seekable = audio.seekable;
      if (seekable && seekable.length > 0) {
        const end = seekable.end(seekable.length - 1);
        if (Number.isFinite(end) && end > 0) return end;
      }
    } catch {
      /* seekable can throw if not yet ready */
    }
    return 0;
  }, []);

  // Seek handler — called when the user clicks/drags the progress bar.
  // Uses computeEffectiveDuration() at call-time instead of relying on
  // audioProgress.duration, so the seek works even before the React state
  // has been updated by the progress event. This is important because
  // there's a small window between "browser knows the duration" and
  // "React state has been updated" where the user might click.
  const seekToClientX = useCallback((clientX: number, barEl: HTMLElement) => {
    const audio = audioRef.current;
    if (!audio) return;
    const dur = computeEffectiveDuration(audio);
    if (dur <= 0) return;
    const rect = barEl.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const newTime = ratio * dur;
    // Clamp to seekable range to avoid InvalidStateError on chunked audio
    // where the very end of the stream might not yet be buffered.
    try {
      const seekable = audio.seekable;
      if (seekable && seekable.length > 0) {
        const maxSeek = seekable.end(seekable.length - 1);
        if (Number.isFinite(maxSeek) && newTime > maxSeek) {
          // Seek to the furthest available position instead.
          audio.currentTime = Math.max(0, maxSeek - 0.05);
          setAudioProgress((p) => ({ ...p, current: audio.currentTime, duration: dur }));
          return;
        }
      }
    } catch {
      /* ignore */
    }
    audio.currentTime = newTime;
    setAudioProgress((p) => ({ ...p, current: newTime, duration: dur }));
  }, [computeEffectiveDuration]);

  // Pointer-based drag scrubbing. onPointerDown starts a drag capture, then
  // we listen on window for pointermove (to update position live) and
  // pointerup (to release). This makes the bar feel like a real audio scrubber
  // instead of a single-shot click.
  const dragStateRef = useRef<{ bar: HTMLDivElement | null; } | null>(null);
  const handleSeekPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const bar = e.currentTarget;
    dragStateRef.current = { bar };
    // Seek immediately to the clicked position (so a single click works even
    // without a drag).
    seekToClientX(e.clientX, bar);
    // Capture pointer so we keep receiving move events even if the cursor
    // leaves the bar.
    try { bar.setPointerCapture(e.pointerId); } catch { /* ignore */ }

    const onMove = (ev: PointerEvent) => {
      if (!dragStateRef.current?.bar) return;
      seekToClientX(ev.clientX, dragStateRef.current.bar);
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      try { bar.releasePointerCapture(ev.pointerId); } catch { /* ignore */ }
      dragStateRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [seekToClientX]);

  // Keyboard seeking — when the slider has focus, ArrowLeft/ArrowRight seek
  // by 5 seconds, Home/End jump to start/end. Required for accessibility
  // and a nice power-user shortcut.
  const handleSeekKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const dur = computeEffectiveDuration(audio);
    if (dur <= 0) return;
    let newTime: number | null = null;
    switch (e.key) {
      case "ArrowLeft":
        newTime = Math.max(0, audio.currentTime - 5);
        break;
      case "ArrowRight":
        newTime = Math.min(dur, audio.currentTime + 5);
        break;
      case "Home":
        newTime = 0;
        break;
      case "End":
        newTime = dur;
        break;
      default:
        return;
    }
    e.preventDefault();
    audio.currentTime = newTime;
    setAudioProgress((p) => ({ ...p, current: newTime, duration: dur }));
  }, [computeEffectiveDuration]);

  // Reset audio state when dialog closes
  useEffect(() => {
    if (!detailLabel && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      setPlayingTrackId(null);
      setAudioProgress({ current: 0, duration: 0 });
    }
  }, [detailLabel]);

  // Attach listeners to the audio element. These keep the progress bar in
  // sync with playback and resolve the duration for chunked-transfer audio
  // (Beatport CDN serves samples without Content-Length, so audio.duration
  // returns Infinity — we use audio.seekable.end() as a fallback).
  //
  // Events we listen to:
  //  - timeupdate: fires ~4x/sec during playback, gives us currentTime
  //  - loadedmetadata: fires once when headers are parsed (duration may
  //    still be Infinity for chunked audio)
  //  - progress: fires whenever the browser downloads more audio data.
  //    This is the key event for chunked audio — once the first chunk is
  //    in, audio.seekable has a range and we can read seekable.end(0).
  //  - durationchange: fires when audio.duration changes (e.g. browser
  //    finally computes it after buffering the whole file)
  //  - canplay: fires when the browser can start playing. Sometimes the
  //    seekable range becomes available here even if progress didn't fire.
  //  - ended: reset state for the next track
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateDurationFromAudio = () => {
      const dur = computeEffectiveDuration(audio);
      setAudioProgress((p) => {
        // Only update if we discovered a real duration (don't overwrite
        // a known good value with 0).
        if (dur > 0 && p.duration !== dur) {
          return { ...p, duration: dur };
        }
        return p;
      });
    };

    const onTimeUpdate = () => {
      setAudioProgress((p) => ({ ...p, current: audio.currentTime || 0 }));
      // Also opportunistically refresh duration — sometimes seekable
      // becomes available mid-playback and we want to pick it up.
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
        updateDurationFromAudio();
      }
    };
    const onLoadedMetadata = () => {
      updateDurationFromAudio();
    };
    const onProgress = () => {
      // progress fires when new bytes are downloaded. For chunked audio
      // this is when seekable.end(0) becomes meaningful.
      updateDurationFromAudio();
    };
    const onDurationChange = () => {
      updateDurationFromAudio();
    };
    const onCanPlay = () => {
      updateDurationFromAudio();
    };
    const onEnded = () => {
      setPlayingTrackId(null);
      setAudioProgress({ current: 0, duration: 0 });
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("progress", onProgress);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("progress", onProgress);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("ended", onEnded);
    };
  }, [computeEffectiveDuration]);

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
  // Manual edits to the pitch preview — when non-null, the user has typed into
  // the preview textarea and we use their text instead of the auto-generated
  // pitchText. Reset to null when the dialog switches to a different label.
  const [pitchEditedText, setPitchEditedText] = useState<string | null>(null);

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
    setDetailLinks(labelToDetailLinks(label));
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
    // Reset any manual edits from a previously-opened label so the user
    // starts fresh with the auto-generated pitch text for the new label.
    setPitchEditedText(null);
  }, [userProfile]);

  // Cross-tab navigation: if another tab (e.g. Artist Explorer) sets
  // selectedLabelId, open the detail dialog for that label and clear the
  // signal so it doesn't re-open on every re-render. Matches by id first,
  // then by case-insensitive name as a fallback (artist.labelsPublishedOn
  // only stores names, not ids).
  useEffect(() => {
    if (!selectedLabelId) return;
    const byId = labels.find(l => l.id === selectedLabelId);
    if (byId) {
      openDetail(byId);
      setSelectedLabelId(null);
      return;
    }
    // Fallback: selectedLabelId might actually be a label name passed
    // through from artist-explorer (we set both id and name there).
    const byName = labels.find(l => l.name.toLowerCase().trim() === String(selectedLabelId).toLowerCase().trim());
    if (byName) {
      openDetail(byName);
      setSelectedLabelId(null);
    }
  }, [selectedLabelId, labels, openDetail, setSelectedLabelId]);

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

  // Link management
  const saveLinksToStore = useCallback((links: DetailLink[]) => {
    if (!detailLabel) return;
    const exists = labels.find(l => l.id === detailLabel.id);
    if (!exists) return;
    const fields = detailLinksToFields(links);
    updateLabel(detailLabel.id, fields);
    setDetailSaved(true);
    setTimeout(() => setDetailSaved(false), 1500);
  }, [detailLabel, updateLabel, labels]);

  const addDetailLink = useCallback((type: string) => {
    const newLinks = [...detailLinks, { type, value: "" }];
    setDetailLinks(newLinks);
    // Don't save to store yet - value is empty
  }, [detailLinks]);

  const updateDetailLink = useCallback((index: number, field: "type" | "value", val: string) => {
    const newLinks = [...detailLinks];
    newLinks[index] = { ...newLinks[index], [field]: val };
    setDetailLinks(newLinks);
    // NOTE: We do NOT call saveLinksToStore here. Saving on every keystroke
    // was causing React render thrashing + "page couldn't load" crashes on
    // mobile when pasting ultra-long URLs (each keystroke triggered
    // updateLabel → syncToCloud → setTimeout). Saving now happens only on
    // blur via saveDetailLinkOnBlur, which is called from the Input's
    // onBlur handler. For "type" changes (dropdown), we DO save immediately
    // because there's no onBlur for Select.
    if (field === "type") {
      saveLinksToStore(newLinks);
    }
  }, [detailLinks, saveLinksToStore]);

  const removeDetailLink = useCallback((index: number) => {
    const newLinks = detailLinks.filter((_, i) => i !== index);
    setDetailLinks(newLinks);
    saveLinksToStore(newLinks);
  }, [detailLinks, saveLinksToStore]);

  const saveDetailLinkOnBlur = useCallback((index: number) => {
    saveLinksToStore(detailLinks);
  }, [detailLinks, saveLinksToStore]);

  // Explicit "Save all" action — the user-facing save button at the bottom
  // of the dialog. Commits ALL pending detail state to the store in one shot:
  //   - newEmailInput (if the user typed an email but didn't press + or Enter)
  //   - detailEmails (re-persisted to be safe)
  //   - detailLinks (links as currently shown in the UI)
  //   - detailNotes
  //   - detailStatus
  //   - detailSubmissionType
  // This complements (does NOT replace) the existing auto-save onBlur/onEnter
  // handlers — users who press + or click away still get auto-save, but users
  // who type and then click "Salva" without pressing + will NOT lose data.
  const saveAllDetails = useCallback(() => {
    if (!detailLabel) return;
    const exists = labels.find(l => l.id === detailLabel.id);
    if (!exists) return;

    // Commit pending email input
    let finalEmails = detailEmails;
    const pendingEmail = newEmailInput.trim();
    if (pendingEmail && pendingEmail.includes("@") && !detailEmails.includes(pendingEmail)) {
      finalEmails = [...detailEmails, pendingEmail];
      setDetailEmails(finalEmails);
      setNewEmailInput("");
    }

    const linkFields = detailLinksToFields(detailLinks);
    updateLabel(detailLabel.id, {
      emails: finalEmails,
      contactInfo: finalEmails[0] || "",
      notes: detailNotes,
      status: detailStatus,
      submissionType: detailSubmissionType,
      ...linkFields,
    });
    setDetailSaved(true);
    setTimeout(() => setDetailSaved(false), 1500);
  }, [detailLabel, labels, detailEmails, newEmailInput, detailLinks, detailNotes, detailStatus, detailSubmissionType, updateLabel]);

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

  // Effective pitch text — what the user actually sees, copies, and sends.
  // If the user has manually edited the preview, use their version; otherwise
  // fall back to the generated pitchText. This is the single source of truth
  // for the textarea value, the Copy button, the Save-to-Tracker action, and
  // the pitchText that gets stored on the Demo record.
  const displayPitchText = pitchEditedText ?? pitchText;

  // Effective subject + body for sending. When the user has edited the text,
  // we parse the subject and body out of their edited version. Otherwise we
  // use the generated subject/body as before. Used by mailto:, Gmail web link,
  // and Gmail API direct send.
  const effectivePitchSubject = useMemo(() => {
    if (pitchEditedText !== null) {
      return parsePitchText(displayPitchText).subject;
    }
    return generateSubject(pitchTrackName.trim(), pitchArtistName, pitchLanguage);
  }, [pitchEditedText, displayPitchText, pitchTrackName, pitchArtistName, pitchLanguage]);

  const effectivePitchBody = useMemo(() => {
    if (pitchEditedText !== null) {
      return parsePitchText(displayPitchText).body;
    }
    if (!detailLabel) return "";
    return generatePitchBody(
      detailLabel.name,
      pitchTrackName.trim(),
      pitchArtistName,
      pitchScLink,
      pitchTone,
      pitchNote,
      pitchLanguage
    );
  }, [pitchEditedText, displayPitchText, detailLabel, pitchTrackName, pitchArtistName, pitchScLink, pitchTone, pitchNote, pitchLanguage]);

  // Effective mailto: link — uses edited subject/body when the user has typed
  // into the preview; otherwise the generated one. Falls back to "" if no email
  // is set on the label (mailto: requires a recipient).
  const effectiveMailtoLink = useMemo(() => {
    if (!detailLabel || !pitchTrackName.trim() || !detailEmails.length) return "";
    return generateMailtoLink(detailEmails, effectivePitchSubject, effectivePitchBody);
  }, [detailLabel, pitchTrackName, detailEmails, effectivePitchSubject, effectivePitchBody]);

  // Effective Gmail web link — uses edited subject/body when available.
  // Doesn't require an email address (Gmail compose can be opened with just
  // subject+body, the user fills in the recipient).
  const effectiveGmailLink = useMemo(() => {
    if (!detailLabel || !pitchTrackName.trim()) return "";
    return generateGmailLink(detailEmails, effectivePitchSubject, effectivePitchBody);
  }, [detailLabel, pitchTrackName, detailEmails, effectivePitchSubject, effectivePitchBody]);

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

  // Open Gmail and auto-create demo. Uses the effective Gmail link +
  // displayPitchText so manual edits flow through to both the email
  // compose window and the stored demo record.
  const handleOpenGmail = useCallback(() => {
    if (!detailLabel || !pitchTrackName.trim()) return;
    window.open(effectiveGmailLink, "_blank");
    if (!demoAlreadyExists) {
      addDemo({
        trackName: pitchTrackName.trim(),
        labelId: detailLabel.id,
        status: "sent",
        sentDate: new Date().toISOString().split("T")[0],
        link: pitchScLink.trim(),
        links: [],
        notes: pitchNote.trim(),
        pitchText: displayPitchText,
        artistName: pitchArtistName.trim(),
        genre: "",
        bpm: "",
        key: "",
      });
      setPitchDemoCreated(true);
    }
  }, [detailLabel, pitchTrackName, pitchScLink, pitchNote, effectiveGmailLink, demoAlreadyExists, addDemo, displayPitchText, pitchArtistName]);

  // Open email client (mailto:) and auto-create demo. Uses the effective
  // mailto link so the user's manual edits to subject/body are reflected.
  const handleSendAndTrack = useCallback(() => {
    if (!detailLabel || !pitchTrackName.trim()) return;
    if (effectiveMailtoLink) {
      window.open(effectiveMailtoLink, "_blank");
    }
    if (!demoAlreadyExists) {
      addDemo({
        trackName: pitchTrackName.trim(),
        labelId: detailLabel.id,
        status: "sent",
        sentDate: new Date().toISOString().split("T")[0],
        link: pitchScLink.trim(),
        links: [],
        notes: pitchNote.trim(),
        pitchText: displayPitchText,
        artistName: pitchArtistName.trim(),
        genre: "",
        bpm: "",
        key: "",
      });
      setPitchDemoCreated(true);
    }
  }, [detailLabel, pitchTrackName, pitchScLink, pitchNote, effectiveMailtoLink, demoAlreadyExists, addDemo, displayPitchText, pitchArtistName]);

  // Send email directly via Gmail API. Uses the effective subject + body so
  // manual edits to the preview are honored when sending through the API.
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

      // Use effective subject + body so manual edits to the preview textarea
      // are honored when sending via the Gmail API.
      const subject = effectivePitchSubject;
      const body = effectivePitchBody;

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
            links: [],
            notes: pitchNote.trim(),
            pitchText: displayPitchText,
            artistName: pitchArtistName.trim(),
            genre: "",
            bpm: "",
            key: "",
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
  }, [detailLabel, pitchTrackName, pitchScLink, pitchTone, pitchNote, pitchLanguage, detailEmails, gmailAuth, demoAlreadyExists, addDemo, displayPitchText, effectivePitchSubject, effectivePitchBody, setGmailAuth, toast]);

  const handlePitchCopy = async () => {
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
      label.beatportLink ||
      (label.customLinks && label.customLinks.length > 0) ||
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
                      {/* Beatport / Beatstats / SoundCloud discovery icons.
                          Same pattern as the rankings page: the label NAME
                          opens the detail dialog (card onClick), while these
                          icons jump straight to the external sites. */}
                      <LabelDiscoveryIcons label={label} size={11} />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[11px] text-muted-foreground">
                      <span className="text-primary/60 font-medium truncate max-w-[200px]">{bestGenre || label.genre}</span>
                      {label.emails && label.emails.length > 0 && (
                        <a
                          href={`mailto:${label.emails[0]}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-mono truncate max-w-[200px] flex items-center gap-0.5 hover:text-foreground transition-colors"
                        >
                          <Mail className="h-2.5 w-2.5" /> {label.emails[0]}{label.emails.length > 1 ? ` +${label.emails.length - 1}` : ""}
                        </a>
                      )}
                      {!label.emails?.length && label.contactInfo && (
                        <a
                          href={label.contactInfo.includes("@") ? `mailto:${label.contactInfo}` : toClickableUrl(label.contactInfo, "website") || "#"}
                          onClick={(e) => e.stopPropagation()}
                          className="font-mono truncate max-w-[200px] flex items-center gap-0.5 hover:text-foreground transition-colors"
                        >
                          <Mail className="h-2.5 w-2.5" /> {label.contactInfo}
                        </a>
                      )}
                      {label.website && (
                        <a
                          href={toClickableUrl(label.website, "website") || "#"}
                          onClick={(e) => e.stopPropagation()}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono truncate max-w-[160px] flex items-center gap-0.5 hover:text-cyan-400 transition-colors"
                        >
                          <Globe className="h-2.5 w-2.5" /> {getLinkDisplay(label.website)}
                        </a>
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
        <DialogContent className="sm:max-w-2xl bg-card border-border/50 max-h-[90vh] overflow-y-auto max-w-[calc(100vw-1rem)] overflow-x-hidden">
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
                    {/* Quick discovery icons — Beatport / Beatstats / SoundCloud */}
                    <span className="ml-auto flex items-center gap-1 pr-6">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-0.5 hidden sm:inline">
                        {locale === "it" ? "Esplora:" : "Discover:"}
                      </span>
                      <LabelDiscoveryIcons label={detailLabel} size={16} />
                    </span>
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

                {/* Top tracks on Beatport (from scraped artist data) */}
                {/* Hidden audio element for sample preview */}
                <audio ref={audioRef} preload="none" />
                {labelTopTracks.length > 0 && (
                  <div className="space-y-3 py-3 border-b border-border/30">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Headphones className="h-4 w-4 text-primary" />
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                          {locale === "it" ? "Top tracce Beatport" : "Top Beatport tracks"}
                        </p>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {labelTopTracks.length} {locale === "it" ? "tracce" : "tracks"}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground/70 -mt-1">
                      {locale === "it"
                        ? "Anteprime audio dai dati scraping. Clicca play per ascoltare."
                        : "Audio previews from scraped data. Click play to listen."}
                    </p>
                    <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                      {labelTopTracks.map((track, idx) => {
                        const isPlaying = playingTrackId === track.id;
                        const progressPct = isPlaying && audioProgress.duration > 0
                          ? Math.min(100, (audioProgress.current / audioProgress.duration) * 100)
                          : 0;
                        return (
                        <div
                          key={track.id}
                          className={`rounded-md border bg-secondary/20 p-2 transition-colors ${
                            isPlaying ? "border-primary/40 bg-primary/5" : "border-border/30 hover:bg-secondary/40"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => togglePlayTrack(track)}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary hover:bg-primary/25 transition-colors"
                            title={isPlaying
                              ? (locale === "it" ? "Pausa" : "Pause")
                              : (locale === "it" ? "Riproduci anteprima" : "Play preview")}
                          >
                            {isPlaying
                              ? <Pause className="h-3 w-3" />
                              : <Play className="h-3 w-3 ml-0.5" />}
                          </button>
                          {track.coverArt ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={track.coverArt}
                              alt=""
                              className="h-9 w-9 shrink-0 rounded object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-secondary/50">
                              <Music2 className="h-3.5 w-3.5 text-muted-foreground" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium text-foreground">
                              <span className="text-muted-foreground mr-1">#{idx + 1}</span>
                              {track.name}
                              {track.mixName && track.mixName !== "Original Mix" && (
                                <span className="text-muted-foreground"> ({track.mixName})</span>
                              )}
                            </p>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                              {track.bpm && <span>{track.bpm} BPM</span>}
                              {track.keyCamelot && <span>· {track.keyCamelot}</span>}
                              {track.releaseDate && (
                                <span className="ml-auto">
                                  {new Date(track.releaseDate).toLocaleDateString(
                                    locale === "it" ? "it-IT" : "en-US",
                                    { year: "numeric", month: "short", day: "numeric" }
                                  )}
                                </span>
                              )}
                            </div>
                          </div>
                          </div>
                          {/* Seekable progress bar — only shown for the currently-playing track */}
                          {isPlaying && (
                            (() => {
                              // durationReady — true when EITHER:
                              //   1. We have a finite, positive duration in React state (the
                              //      common case after progress event fires), OR
                              //   2. The underlying audio element has a seekable range right
                              //      now (checked live so the UI unlocks the instant the
                              //      browser has buffered the first chunk, even before React
                              //      state has updated).
                              // This double-check is important because there's a small async
                              // gap between "browser knows the duration" and "React state
                              // has re-rendered with the new duration" where the user might
                              // try to click the bar.
                              let durationReady = Number.isFinite(audioProgress.duration) && audioProgress.duration > 0;
                              if (!durationReady && audioRef.current) {
                                try {
                                  const seekable = audioRef.current.seekable;
                                  if (seekable && seekable.length > 0) {
                                    const end = seekable.end(seekable.length - 1);
                                    if (Number.isFinite(end) && end > 0) {
                                      durationReady = true;
                                    }
                                  }
                                } catch { /* ignore */ }
                              }
                              return (
                            <div className="mt-1.5 flex items-center gap-2">
                              <span className="text-[9px] text-muted-foreground font-mono tabular-nums w-9 text-right shrink-0">
                                {formatTime(audioProgress.current)}
                              </span>
                              <div
                                role="slider"
                                aria-label={locale === "it" ? "Posizione traccia" : "Track position"}
                                aria-valuenow={Math.round(progressPct)}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-disabled={durationReady ? undefined : true}
                                tabIndex={0}
                                onPointerDown={handleSeekPointerDown}
                                onKeyDown={handleSeekKeyDown}
                                className={`group relative flex-1 h-3 flex items-center touch-none select-none ${
                                  durationReady ? "cursor-pointer" : "cursor-wait"
                                }`}
                                title={
                                  durationReady
                                    ? (locale === "it" ? "Trascina o clicca per spostarti · frecce ←/→ per 5s" : "Drag or click to seek · ←/→ arrows for 5s")
                                    : (locale === "it" ? "Caricamento durata in corso…" : "Loading duration…")
                                }
                              >
                                {/* Track background */}
                                <div className="absolute inset-x-0 h-1 rounded-full bg-border/60" />
                                {/* Filled portion */}
                                <div
                                  className={`absolute h-1 rounded-full transition-colors ${
                                    durationReady ? "bg-primary group-hover:bg-primary/80" : "bg-muted-foreground/40"
                                  }`}
                                  style={{ width: `${progressPct}%` }}
                                />
                                {/* Drag handle (visible on hover, only when ready) */}
                                {durationReady && (
                                  <div
                                    className="absolute h-2.5 w-2.5 rounded-full bg-primary shadow-sm opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity -translate-x-1/2 pointer-events-none"
                                    style={{ left: `${progressPct}%` }}
                                  />
                                )}
                                {/* Pulsing dot when duration isn't ready yet — visual cue that
                                    we're still figuring out how long the track is. */}
                                {!durationReady && (
                                  <div
                                    className="absolute h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-pulse"
                                    style={{ left: `${Math.min(95, Math.max(2, progressPct))}%`, transform: "translateX(-50%)" }}
                                  />
                                )}
                              </div>
                              <span className="text-[9px] text-muted-foreground font-mono tabular-nums w-9 shrink-0">
                                {durationReady ? formatTime(audioProgress.duration) : "—:—"}
                              </span>
                            </div>
                              );
                            })()
                          )}
                        </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Top artists on this label — derived from scraped artist data.
                    Each artist's score = sum of points of their tracks on this
                    label. Clicking a name navigates to the Artist Explorer
                    detail page (cross-tab via selectedArtistId). */}
                {labelTopArtists.length > 0 && (
                  <div className="space-y-3 py-3 border-b border-border/30">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-primary" />
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                          {locale === "it" ? "Top artisti della label" : "Top artists on label"}
                        </p>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {labelTopArtists.length} {locale === "it" ? "artisti" : "artists"}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground/70 -mt-1">
                      {locale === "it"
                        ? "Punteggio totale dell'artista su questa label. Clicca sul nome per aprire la pagina artista."
                        : "Artist's total score on this label. Click a name to open the artist page."}
                    </p>
                    <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                      {labelTopArtists.map((artist, idx) => (
                        <button
                          key={artist.id}
                          type="button"
                          onClick={() => handleOpenArtist(artist.id)}
                          className="w-full flex items-center gap-2 rounded-md border border-border/30 bg-secondary/20 p-2 hover:bg-secondary/40 hover:border-primary/30 transition-colors text-left group"
                          title={locale === "it"
                            ? `Apri la pagina di ${artist.name}`
                            : `Open ${artist.name}'s page`}
                        >
                          <span className="text-xs font-mono text-muted-foreground shrink-0 w-6 text-right">
                            #{idx + 1}
                          </span>
                          {artist.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={artist.imageUrl}
                              alt=""
                              className="h-8 w-8 shrink-0 rounded-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary/50">
                              <Users className="h-3.5 w-3.5 text-muted-foreground" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium text-foreground group-hover:text-primary transition-colors">
                              {artist.name}
                              {artist.isRemixerOnly && (
                                <span className="text-[10px] text-muted-foreground ml-1">(remixer)</span>
                              )}
                            </p>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                              <span>{artist.trackCount} {locale === "it" ? "tracce" : "tracks"}</span>
                              {artist.bestPosition !== null && (
                                <span>· {locale === "it" ? "migliore" : "best"} #{artist.bestPosition}</span>
                              )}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-sm font-bold text-primary">
                              {artist.totalLabelPoints.toLocaleString()}
                            </p>
                            <p className="text-[9px] text-muted-foreground uppercase">pts</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

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

                  {/* Unified Links & Social section */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <UILabel className="text-xs font-mono uppercase text-muted-foreground flex items-center gap-1.5">
                        <ExternalLink className="h-3 w-3" /> {t(locale, "labels.linksSection")}
                      </UILabel>
                    </div>
                    {/* Existing links */}
                    {detailLinks.map((link, idx) => {
                      const Icon = getLinkIcon(link.type);
                      const color = getLinkColor(link.type);
                      const clickUrl = link.value?.trim() ? toClickableUrl(link.value, link.type) : null;
                      // Find which types are already used (to limit dropdown choices)
                      const usedTypes = new Set(detailLinks.map((l, i) => i !== idx ? l.type : null).filter(Boolean));
                      return (
                        <div key={idx} className="space-y-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            {/* Type selector */}
                            <Select value={link.type} onValueChange={(v) => updateDetailLink(idx, "type", v)}>
                              <SelectTrigger className="bg-secondary/50 w-[130px] shrink-0 h-9 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {LINK_TYPES.map((lt) => (
                                  <SelectItem key={lt.id} value={lt.id} disabled={usedTypes.has(lt.id) && lt.id !== link.type}>
                                    {t(locale, lt.labelKey as any)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {/* Value input */}
                            <Input value={link.value} onChange={(e) => updateDetailLink(idx, "value", e.target.value)}
                              onBlur={() => saveDetailLinkOnBlur(idx)}
                              maxLength={2000}
                              placeholder={getLinkPlaceholder(link.type)} className="bg-secondary/50 flex-1 text-sm min-w-0" />
                            {/* Open link button */}
                            {clickUrl && (
                              <Button variant="ghost" size="icon" className={`shrink-0 h-9 w-9 ${color} hover:opacity-80 hover:bg-white/5`}
                                onClick={() => window.open(clickUrl, "_blank")}
                                title={t(locale, "labels.openLink")}>
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {/* Remove button */}
                            <Button variant="ghost" size="icon" className="shrink-0 h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              onClick={() => removeDetailLink(idx)}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          {/* Clickable URL preview — shortened for display, full URL for click */}
                          {clickUrl && (
                            <a href={clickUrl} target="_blank" rel="noopener noreferrer"
                              className={`text-[11px] font-mono ${color} hover:underline block pl-[138px] truncate`}
                              title={clickUrl}>
                              {shortenUrlForDisplay(clickUrl, 70)}
                            </a>
                          )}
                        </div>
                      );
                    })}
                    {/* Add new link button */}
                    <div className="flex items-center gap-1.5">
                      <Select value="" onValueChange={(v) => addDetailLink(v)}>
                        <SelectTrigger className="bg-secondary/30 border-dashed border-muted-foreground/30 w-full h-9 text-xs text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors">
                          <Plus className="h-3 w-3 mr-1" />
                          <SelectValue placeholder={t(locale, "labels.addLinkPlaceholder")} />
                        </SelectTrigger>
                        <SelectContent>
                          {LINK_TYPES.map((lt) => {
                            const alreadyUsed = detailLinks.some(l => l.type === lt.id);
                            return (
                              <SelectItem key={lt.id} value={lt.id} disabled={alreadyUsed}>
                                {t(locale, lt.labelKey as any)}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
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
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1 flex-wrap">
                              <Sparkles className="h-3 w-3 text-primary" /> {t(locale, "pitch.preview")}
                              {pitchEditedText !== null && (
                                <Badge variant="outline" className="ml-1 text-[9px] py-0 px-1.5 h-4 border-amber-500/40 text-amber-500">
                                  {t(locale, "pitch.edited")}
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
                                      links: [],
                                      notes: pitchNote.trim(),
                                      pitchText: displayPitchText,
                                      artistName: pitchArtistName.trim(),
                                      genre: "",
                                      bpm: "",
                                      key: "",
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

                <DialogFooter className="gap-2 sm:justify-between">
                  <div className="flex items-center gap-2">
                    {detailLabel.isCustom && (
                      <Button variant="destructive" size="sm" onClick={() => { setDeleteConfirmId(detailLabel.id); setDetailLabel(null); }}>
                        <Trash2 className="h-3 w-3 mr-1" />{t(locale, "labels.delete")}
                      </Button>
                    )}
                    {detailSaved && (
                      <span className="text-[11px] text-emerald-400 flex items-center gap-1 animate-pulse">
                        <Check className="h-3 w-3" /> {locale === "it" ? "Salvato" : "Saved"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="default"
                      onClick={saveAllDetails}
                      className="gap-1.5"
                      title={locale === "it"
                        ? "Salva le modifiche a questa label (email, note, status, link) nello store locale e nel cloud. Non scarica file."
                        : "Save changes to this label (emails, notes, status, links) to local store and cloud. Doesn't download a file."}
                    >
                      <Save className="h-3.5 w-3.5" />
                      {locale === "it" ? "Salva modifiche" : "Save changes"}
                    </Button>
                    <Button variant="ghost" onClick={() => setDetailLabel(null)}>{t(locale, "labels.close")}</Button>
                  </div>
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
                        onClick={() => openDetail(l)}>
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
                        onClick={() => openDetail(l)}>
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
                        onClick={() => openDetail(l)}>
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
