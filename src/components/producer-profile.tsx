"use client";

import { useAppStore } from "@/lib/store";
import { t } from "@/lib/i18n";
import React, { useState, useCallback } from "react";
import {
  Pencil,
  Plus,
  ExternalLink,
  X,
  Save,
  Globe,
  Music2,
  Disc3,
  Link2,
  Camera,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label as UILabel } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

// ==================== LINK TYPES ====================

const LINK_TYPES = [
  { id: "website", labelKey: "profile.linkTypeWebsite", icon: Globe, placeholder: "https://www.yoursite.com", color: "text-blue-400" },
  { id: "instagram", labelKey: "profile.linkTypeInstagram", icon: ExternalLink, placeholder: "username", color: "text-pink-400" },
  { id: "soundcloud", labelKey: "profile.linkTypeSoundcloud", icon: Music2, placeholder: "username", color: "text-orange-400" },
  { id: "beatport", labelKey: "profile.linkTypeBeatport", icon: Disc3, placeholder: "artist-slug", color: "text-forest-400" },
  { id: "spotify", labelKey: "profile.linkTypeSpotify", icon: Music2, placeholder: "artist-id", color: "text-green-400" },
  { id: "youtube", labelKey: "profile.linkTypeYoutube", icon: ExternalLink, placeholder: "@channel", color: "text-red-400" },
  { id: "bandcamp", labelKey: "profile.linkTypeBandcamp", icon: Music2, placeholder: "username", color: "text-cyan-400" },
  { id: "other", labelKey: "profile.linkTypeOther", icon: ExternalLink, placeholder: "https://...", color: "text-gray-400" },
] as const;

// ==================== SMART URL BUILDER ====================

function toClickableUrl(value: string, linkType: string): string | null {
  if (!value || !value.trim()) return null;
  const v = value.trim();
  if (/^https?:\/\//i.test(v)) return v;
  switch (linkType) {
    case "instagram":
      if (/^[a-zA-Z0-9._]{1,30}$/.test(v)) return `https://instagram.com/${v.replace(/^@/, "")}`;
      return `https://${v}`;
    case "soundcloud":
      if (/^[a-zA-Z0-9._-]{1,30}$/.test(v)) return `https://soundcloud.com/${v.replace(/^@/, "")}`;
      return `https://${v}`;
    case "beatport":
      if (/^[a-zA-Z0-9._-]{1,50}$/.test(v)) return `https://www.beatport.com/label/${v.replace(/^@/, "")}`;
      return `https://${v}`;
    case "spotify":
      if (/^[a-zA-Z0-9._-]{1,40}$/.test(v)) return `https://open.spotify.com/artist/${v.replace(/^@/, "")}`;
      return `https://${v}`;
    case "youtube":
      if (/^@?[a-zA-Z0-9._-]{1,40}$/.test(v)) return `https://youtube.com/${v.replace(/^@/, "@")}`;
      return `https://${v}`;
    case "bandcamp":
      if (/^[a-zA-Z0-9._-]{1,40}$/.test(v)) return `https://${v}.bandcamp.com`;
      return `https://${v}`;
    default:
      return `https://${v}`;
  }
}

// Get placeholder for a link type
function getLinkPlaceholder(linkType: string): string {
  const found = LINK_TYPES.find((lt) => lt.id === linkType);
  return found?.placeholder || "https://...";
}

// Get icon component for a link type
function getLinkIcon(linkType: string): React.ComponentType<{ className?: string }> {
  const found = LINK_TYPES.find((lt) => lt.id === linkType);
  return found?.icon || ExternalLink;
}

// Get color class for a link type
function getLinkColor(linkType: string): string {
  const found = LINK_TYPES.find((lt) => lt.id === linkType);
  return found?.color || "text-cyan-400";
}

// ==================== COMPONENT ====================

export function ProducerProfile() {
  const { userProfile, setUserProfile, locale } = useAppStore();
  const [detailSaved, setDetailSaved] = useState(false);
  const [showPhotoInput, setShowPhotoInput] = useState(false);
  const [photoUrlDraft, setPhotoUrlDraft] = useState(userProfile.photoUrl);

  // Local links state for editing before blur-save
  const [localLinks, setLocalLinks] = useState<{ type: string; value: string }[]>(
    userProfile.links?.length ? userProfile.links : []
  );

  // Auto-save indicator trigger
  const triggerSaved = useCallback(() => {
    setDetailSaved(true);
    setTimeout(() => setDetailSaved(false), 1500);
  }, []);

  // ==================== HANDLERS ====================

  const handleFieldBlur = useCallback(
    (field: "artistName" | "email" | "bio" | "scLink" | "photoUrl", value: string) => {
      // Only save if value actually changed
      if (userProfile[field] !== value) {
        setUserProfile({ [field]: value });
        triggerSaved();
      }
    },
    [userProfile, setUserProfile, triggerSaved]
  );

  const handlePhotoUrlBlur = useCallback(() => {
    if (photoUrlDraft !== userProfile.photoUrl) {
      setUserProfile({ photoUrl: photoUrlDraft });
      triggerSaved();
    }
    setShowPhotoInput(false);
  }, [photoUrlDraft, userProfile.photoUrl, setUserProfile, triggerSaved]);

  const handlePhotoUrlKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.currentTarget.blur();
      } else if (e.key === "Escape") {
        setPhotoUrlDraft(userProfile.photoUrl);
        setShowPhotoInput(false);
      }
    },
    [userProfile.photoUrl]
  );

  // Links handlers
  const updateLocalLink = useCallback(
    (idx: number, field: "type" | "value", val: string) => {
      setLocalLinks((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], [field]: val };
        return next;
      });
    },
    []
  );

  const saveLinksOnBlur = useCallback(() => {
    // Filter out empty links before saving
    const cleaned = localLinks.filter((l) => l.value?.trim());
    if (JSON.stringify(cleaned) !== JSON.stringify(userProfile.links)) {
      setUserProfile({ links: cleaned });
      triggerSaved();
    }
  }, [localLinks, userProfile.links, setUserProfile, triggerSaved]);

  const removeLink = useCallback(
    (idx: number) => {
      setLocalLinks((prev) => prev.filter((_, i) => i !== idx));
      // Save immediately on remove
      const updated = localLinks.filter((_, i) => i !== idx).filter((l) => l.value?.trim());
      setUserProfile({ links: updated });
      triggerSaved();
    },
    [localLinks, setUserProfile, triggerSaved]
  );

  const addLink = useCallback(() => {
    // Find first unused type
    const usedTypes = new Set(localLinks.map((l) => l.type));
    const firstAvailable = LINK_TYPES.find((lt) => !usedTypes.has(lt.id));
    const newLink = { type: firstAvailable?.id || "other", value: "" };
    setLocalLinks((prev) => [...prev, newLink]);
  }, [localLinks]);

  // Derive initials from artist name
  const initials = userProfile.artistName
    ? userProfile.artistName
        .split(/\s+/)
        .map((w) => w[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "DJ";

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            {t(locale, "profile.title" as any)}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t(locale, "profile.subtitle" as any)}
          </p>
        </div>
        {detailSaved && (
          <span className="text-[10px] text-emerald-400 flex items-center gap-1 animate-pulse">
            <Save className="h-2.5 w-2.5" /> {t(locale, "profile.saved" as any)}
          </span>
        )}
      </div>

      {/* ==================== PHOTO SECTION ==================== */}
      <Card className="bg-card/60 border-border/40">
        <CardContent className="p-6">
          <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground mb-4">
            {t(locale, "profile.photoUrl" as any)}
          </p>
          <div className="flex items-start gap-5">
            {/* Avatar */}
            <div className="relative group shrink-0">
              <Avatar className="h-24 w-24 ring-2 ring-border/40 ring-offset-2 ring-offset-background">
                {userProfile.photoUrl ? (
                  <AvatarImage
                    src={userProfile.photoUrl}
                    alt={userProfile.artistName || "Profile photo"}
                  />
                ) : null}
                <AvatarFallback className="bg-primary/15 text-primary text-2xl font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              {/* Edit overlay */}
              <button
                type="button"
                onClick={() => {
                  setPhotoUrlDraft(userProfile.photoUrl);
                  setShowPhotoInput(true);
                }}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                aria-label="Change photo"
              >
                <Camera className="h-5 w-5 text-white" />
              </button>
            </div>

            {/* Photo URL input */}
            <div className="flex-1 space-y-2">
              {showPhotoInput ? (
                <Input
                  value={photoUrlDraft}
                  onChange={(e) => setPhotoUrlDraft(e.target.value)}
                  onBlur={handlePhotoUrlBlur}
                  onKeyDown={handlePhotoUrlKeyDown}
                  placeholder="https://example.com/photo.jpg"
                  className="bg-secondary/50 text-sm"
                  autoFocus
                />
              ) : (
                <div
                  className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors min-h-9"
                  onClick={() => {
                    setPhotoUrlDraft(userProfile.photoUrl);
                    setShowPhotoInput(true);
                  }}
                >
                  {userProfile.photoUrl ? (
                    <span className="truncate font-mono text-xs">{userProfile.photoUrl}</span>
                  ) : (
                    <span className="text-xs italic">Click to add a photo URL</span>
                  )}
                  <Pencil className="h-3 w-3 shrink-0 opacity-50" />
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ==================== BASIC INFO SECTION ==================== */}
      <Card className="bg-card/60 border-border/40">
        <CardContent className="p-6 space-y-5">
          {/* Artist Name */}
          <div className="space-y-2">
            <UILabel className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
              {t(locale, "profile.artistName" as any)}
            </UILabel>
            <Input
              defaultValue={userProfile.artistName}
              onBlur={(e) => handleFieldBlur("artistName", e.target.value)}
              placeholder="Your artist name"
              className="bg-secondary/50 text-sm"
            />
          </div>

          {/* Email */}
          <div className="space-y-2">
            <UILabel className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
              {t(locale, "profile.email" as any)}
            </UILabel>
            <Input
              type="email"
              defaultValue={userProfile.email}
              onBlur={(e) => handleFieldBlur("email", e.target.value)}
              placeholder="your@email.com"
              className="bg-secondary/50 text-sm"
            />
          </div>

          {/* Bio */}
          <div className="space-y-2">
            <UILabel className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
              {t(locale, "profile.bio" as any)}
            </UILabel>
            <Textarea
              defaultValue={userProfile.bio}
              onBlur={(e) => handleFieldBlur("bio", e.target.value)}
              placeholder={t(locale, "profile.bioPlaceholder" as any)}
              rows={3}
              className="bg-secondary/50 text-sm resize-none"
            />
          </div>
        </CardContent>
      </Card>

      {/* ==================== LINKS SECTION ==================== */}
      <Card className="bg-card/60 border-border/40">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
              {t(locale, "profile.linksSection" as any)}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={addLink}
              className="h-7 text-[10px] uppercase tracking-wider text-primary hover:bg-primary/15 gap-1"
            >
              <Plus className="h-3 w-3" />
              {t(locale, "profile.addLinkPlaceholder" as any)}
            </Button>
          </div>

          {localLinks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Link2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-xs">No links added yet</p>
              <p className="text-[10px] opacity-60 mt-0.5">
                Click the + button to add your first link
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {localLinks.map((link, idx) => {
                const clickUrl = toClickableUrl(link.value, link.type);
                const LinkIcon = getLinkIcon(link.type);
                const color = getLinkColor(link.type);

                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center gap-2">
                      {/* Type dropdown */}
                      <Select
                        value={link.type}
                        onValueChange={(val) => {
                          updateLocalLink(idx, "type", val);
                        }}
                      >
                        <SelectTrigger
                          className="w-[130px] bg-secondary/50 text-xs shrink-0"
                          size="sm"
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <LinkIcon className={`h-3 w-3 shrink-0 ${color}`} />
                            <span className="truncate">
                              {t(
                                locale,
                                (LINK_TYPES.find((lt) => lt.id === link.type)?.labelKey ||
                                  "profile.linkTypeOther") as any
                              )}
                            </span>
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          {LINK_TYPES.map((lt) => {
                            const usedTypes = new Set(
                              localLinks.filter((_, i) => i !== idx).map((l) => l.type)
                            );
                            return (
                              <SelectItem
                                key={lt.id}
                                value={lt.id}
                                disabled={usedTypes.has(lt.id) && lt.id !== link.type}
                              >
                                <div className="flex items-center gap-1.5">
                                  <lt.icon className={`h-3 w-3 ${lt.color}`} />
                                  {t(locale, lt.labelKey as any)}
                                </div>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>

                      {/* Value input */}
                      <Input
                        value={link.value}
                        onChange={(e) => updateLocalLink(idx, "value", e.target.value)}
                        onBlur={saveLinksOnBlur}
                        placeholder={getLinkPlaceholder(link.type)}
                        className="bg-secondary/50 flex-1 text-sm"
                      />

                      {/* Open link button */}
                      {clickUrl && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`shrink-0 h-9 w-9 ${color} hover:opacity-80 hover:bg-white/5`}
                          onClick={() => window.open(clickUrl, "_blank")}
                          title={t(locale, "profile.openLink" as any)}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      )}

                      {/* Remove button */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => removeLink(idx)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {/* Clickable URL preview */}
                    {clickUrl && (
                      <a
                        href={clickUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`text-[11px] font-mono ${color} hover:underline truncate block pl-[146px]`}
                      >
                        {clickUrl}
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ==================== INTEGRATIONS SECTION ==================== */}
      <Card className="bg-card/60 border-border/40">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
              Integrazioni Audio
            </p>
          </div>
          <div className="space-y-4">
            {/* Cyanite BYOK */}
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold flex items-center gap-1.5">
                    <span className="bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">Cyanite</span>
                    <span className="text-[9px] uppercase tracking-wider bg-secondary/60 px-1.5 py-0.5 rounded text-muted-foreground">BYOK</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Analisi audio avanzata: BPM, key, genere, mood, strumenti.
                    Senza token, LabelPulse usa un'analisi gratuita in-browser (solo BPM, key, energia).
                  </p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Input
                  type="password"
                  defaultValue={userProfile.cyaniteApiToken || ""}
                  onBlur={(e) => {
                    if ((userProfile.cyaniteApiToken || "") !== e.target.value) {
                      setUserProfile({ cyaniteApiToken: e.target.value.trim() });
                      triggerSaved();
                    }
                  }}
                  placeholder="Token API Cyanite (opzionale) — inizia per sb_publishable_..."
                  className="bg-secondary/50 font-mono text-xs"
                />
                <p className="text-[10px] text-muted-foreground">
                  Ottieni il token da{" "}
                  <a
                    href="https://cyanite.ai/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    cyanite.ai
                  </a>{" "}
                  → Account → API. Lascia vuoto per usare l'analisi gratuita.
                </p>
              </div>
              {userProfile.cyaniteApiToken && (
                <div className="flex items-center justify-between gap-2 p-2 rounded bg-emerald-500/10 border border-emerald-500/20">
                  <span className="text-[11px] text-emerald-400 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    Cyanite attivo — l'analisi userà il tuo account
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      setUserProfile({ cyaniteApiToken: "" });
                      triggerSaved();
                    }}
                  >
                    Rimuovi token
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
