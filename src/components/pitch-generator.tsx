"use client";

import { useAppStore, getLabelTier, type Label } from "@/lib/store";
import { t } from "@/lib/i18n";
import { useState, useMemo, useCallback } from "react";
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
} from "@/lib/pitch-utils";
import { useToast } from "@/hooks/use-toast";

export function PitchGenerator() {
  const { labels, demos, addDemo, locale, userProfile, setUserProfile, getGenres } = useAppStore();
  const { toast } = useToast();
  const genres = getGenres();

  // Pre-fill from user profile
  const initialArtistName = userProfile.artistName || "";
  const initialScLink = userProfile.scLink || "";

  // Track setup state
  const [trackName, setTrackName] = useState("");
  const [artistName, setArtistName] = useState(initialArtistName);
  const [scLink, setScLink] = useState(initialScLink);
  const [tone, setTone] = useState<PitchTone>("professional");
  const [language, setLanguage] = useState<PitchLanguage>("en");
  const [customNote, setCustomNote] = useState("");
  const [selectedGenre, setSelectedGenre] = useState("");

  // Target labels state
  const [selectedLabelIds, setSelectedLabelIds] = useState<Set<string>>(new Set());
  const [onlyWithEmail, setOnlyWithEmail] = useState(false);
  const [expandedTiers, setExpandedTiers] = useState<Record<string, boolean>>({ top: true, mid: true, emerging: true });

  // Campaign state
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState({ current: 0, total: 0 });
  const [campaignComplete, setCampaignComplete] = useState(false);
  const [campaignResults, setCampaignResults] = useState({ sent: 0, skipped: 0 });

  // Save profile fields on blur
  const handleArtistBlur = () => {
    if (artistName.trim() && artistName.trim() !== userProfile.artistName) {
      setUserProfile({ artistName: artistName.trim() });
    }
  };

  const handleScLinkBlur = () => {
    if (scLink.trim() && scLink.trim() !== userProfile.scLink) {
      setUserProfile({ scLink: scLink.trim() });
    }
  };

  // Get matching labels by genre, grouped by tier
  const matchingLabels = useMemo(() => {
    if (!selectedGenre) return { top: [], mid: [], emerging: [] };
    const genreLabels = labels.filter((l) =>
      l.genres.includes(selectedGenre) && l.status === "open"
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

  // Generate personalized pitch preview for a label
  const getPitchForLabel = useCallback(
    (label: Label) => {
      if (!trackName.trim()) return { subject: "", body: "" };
      const subject = generateSubject(trackName.trim(), artistName, language);
      const body = generatePitchBody(label.name, trackName.trim(), artistName, scLink, tone, customNote, language);
      return { subject, body };
    },
    [trackName, artistName, scLink, tone, customNote, language]
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

      // Auto-create demo entry
      const demoAlreadyExists = demos.some(
        (d) => d.labelId === label.id && d.trackName.toLowerCase() === trackName.trim().toLowerCase()
      );
      if (!demoAlreadyExists) {
        addDemo({
          trackName: trackName.trim(),
          labelId: label.id,
          status: "sent",
          sentDate: new Date().toISOString().split("T")[0],
          link: scLink.trim(),
          notes: customNote.trim() ? `${customNote.trim()} (Campaign)` : "Campaign",
          pitchText: `Subject: ${subject}\n\n${body}`,
          artistName: artistName.trim(),
        });
      }

      // Small delay between opens to avoid popup blocking
      if (i < toSend.length - 1) {
        await new Promise((r) => setTimeout(r, 800));
      }
    }

    setCampaignResults({ sent: sentCount, skipped });
    setCampaignComplete(true);
    setSending(false);

    toast({
      title: t(locale, "campaign.complete"),
      description: t(locale, "campaign.reviewAndSend").replace("{count}", String(sentCount)),
    });
  }, [selectedWithEmail, selectedWithoutEmail, getLabelEmails, getPitchForLabel, demos, trackName, scLink, customNote, artistName, addDemo, locale, toast]);

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

  // Track if campaign params changed (to reset completion state)
  const campaignParamsKey = `${selectedLabelIds.size}-${trackName}-${tone}-${language}-${customNote}`;
  const [lastCampaignKey, setLastCampaignKey] = useState(campaignParamsKey);
  if (campaignParamsKey !== lastCampaignKey) {
    setLastCampaignKey(campaignParamsKey);
    if (campaignComplete) setCampaignComplete(false);
  }

  return (
    <div className="space-y-6">
      {/* ===== TOP SECTION: Track Setup ===== */}
      <Card className="bg-card/60 border-border/30">
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Target className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-mono uppercase tracking-wider text-muted-foreground">
              {t(locale, "campaign.trackSetup")}
            </h3>
          </div>

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

          <div className="space-y-1.5 mt-3">
            <UILabel className="text-xs font-mono uppercase text-muted-foreground">{t(locale, "pitch.scLink")}</UILabel>
            <Input
              value={scLink}
              onChange={(e) => setScLink(e.target.value)}
              onBlur={handleScLinkBlur}
              placeholder="https://soundcloud.com/..."
              className="bg-secondary/50 border-border/50"
            />
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
    </div>
  );
}
