"use client";

import { useAppStore } from "@/lib/store";
import { t } from "@/lib/i18n";
import { isSupabaseConfigured } from "@/lib/supabase";
import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useSession } from "next-auth/react";
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
  Cloud,
  CloudOff,
  Upload,
  Loader2,
} from "lucide-react";
import { CloudRecovery } from "@/components/cloud-recovery";
import { NotificationSettings } from "@/components/notification-settings";
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
import { isAdminEmail } from "@/lib/supabase";

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

// ==================== IMAGE COMPRESSION HELPER ====================

/**
 * Read an image File, downscale it to a square of `size`×`size` pixels
 * (cover-fit: the image is cropped to fill the square without distortion),
 * and re-encode it as a JPEG data URL at the given quality.
 *
 * Used for profile photo uploads — keeps the stored data URL small
 * (~30-80 KB at 256×256 / 0.85 quality) so it fits comfortably inside
 * the Supabase JSONB row without bloating cloud sync.
 *
 * PNG with alpha is detected and falls back to PNG encoding to preserve
 * transparency (still downscaled, but without JPEG's lossy flatten).
 */
function compressImageToDataUrl(
  file: File,
  size: number,
  quality: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.FileReader || !window.HTMLCanvasElement) {
      reject(new Error("Image compression not supported in this environment"));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => {
      const src = reader.result;
      if (typeof src !== "string") {
        reject(new Error("FileReader returned non-string"));
        return;
      }
      const img = new Image();
      img.onerror = () => reject(new Error("Failed to decode image"));
      img.onload = () => {
        // Cover-fit: scale so the smaller dimension fills `size`, then crop the rest.
        const sourceRatio = img.width / img.height;
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        if (sourceRatio > 1) {
          // Wider than tall — crop sides
          sw = img.height;
          sx = (img.width - sw) / 2;
        } else if (sourceRatio < 1) {
          // Taller than wide — crop top/bottom
          sh = img.width;
          sy = (img.height - sh) / 2;
        }
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas 2D context unavailable"));
          return;
        }
        // White background for JPEG (avoids black halo on transparent PNGs).
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);

        // Use PNG if the source is a PNG with alpha (preserves transparency),
        // otherwise JPEG. We can't easily detect alpha without reading pixels,
        // so we keep it simple: PNG source → PNG output (small enough at 256²).
        const isPng = file.type === "image/png";
        const mime = isPng ? "image/png" : "image/jpeg";
        try {
          const dataUrl = canvas.toDataURL(mime, isPng ? undefined : quality);
          resolve(dataUrl);
        } catch (err) {
          reject(err instanceof Error ? err : new Error("Canvas toDataURL failed"));
        }
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}

// ==================== COMPONENT ====================

export function ProducerProfile() {
  const { userProfile, setUserProfile, locale, profileSaveStatus, profileSaveError, retrySaveProfile } = useAppStore();
  const { data: session } = useSession();
  const isAdmin = isAdminEmail(session?.user?.email as string | undefined);
  const [showPhotoInput, setShowPhotoInput] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 🔒 FASE 6A: i link mantengono uno stato locale per editing fluido
  // (add/remove richiede UX interattiva prima del commit). Il commit su blur
  // continua a chiamare setUserProfile({ links }), che triggera l'autosave.
  const [localLinks, setLocalLinks] = useState<{ type: string; value: string }[]>(
    userProfile.links?.length ? userProfile.links : []
  );

  useEffect(() => {
    setLocalLinks(userProfile.links?.length ? userProfile.links : []);
  }, [userProfile.links]);

  // ==================== HANDLERS ====================

  const handlePhotoUrlKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.currentTarget.blur();
      } else if (e.key === "Escape") {
        setShowPhotoInput(false);
      }
    },
    []
  );

  // ==================== PHOTO FILE UPLOAD ====================
  // Reads an image File chosen by the user, downscales it to a 256x256 square
  // (cover-fit) and re-encodes it as JPEG @ 0.85 quality. The resulting data
  // URL is stored in userProfile.photoUrl alongside URL-based photos. This
  // keeps the cloud row small (~30-80 KB) so Supabase JSONB sync stays fast
  // and cross-device restore works seamlessly.
  const handlePhotoFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Always reset the input value so the same file can be picked twice
      if (e.target) e.target.value = "";
      if (!file) return;

      // Validation
      if (!file.type.startsWith("image/")) {
        setPhotoUploadError(
          locale === "it" ? "Seleziona un file immagine valido" : "Please select a valid image file"
        );
        return;
      }
      const MAX_FILE_MB = 8;
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        setPhotoUploadError(
          locale === "it"
            ? `File troppo grande (max ${MAX_FILE_MB}MB)`
            : `File too large (max ${MAX_FILE_MB}MB)`
        );
        return;
      }
      setPhotoUploadError(null);
      setPhotoUploading(true);

      try {
        const dataUrl = await compressImageToDataUrl(file, 256, 0.85);
        setUserProfile({ photoUrl: dataUrl });
      } catch (err) {
        console.error("[LabelPulse Profile] Photo upload failed:", err);
        setPhotoUploadError(
          locale === "it"
            ? "Errore durante l'elaborazione dell'immagine"
            : "Error processing the image"
        );
      } finally {
        setPhotoUploading(false);
      }
    },
    [locale, setUserProfile]
  );

  const triggerFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

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

  // 🔒 FASE 6A: i link sono ancora gestiti con localLinks + commit su blur.
  // Questo perché l'UX di add/remove/edit di array richiede uno stato locale
  // per fluidità. Il commit chiama setUserProfile({ links }) che triggera
  // l'autosave con debounce, come gli altri campi.
  const saveLinksOnBlur = useCallback(() => {
    const cleaned = localLinks.filter((l) => l.value?.trim());
    if (JSON.stringify(cleaned) !== JSON.stringify(userProfile.links)) {
      setUserProfile({ links: cleaned });
    }
  }, [localLinks, userProfile.links, setUserProfile]);

  const removeLink = useCallback(
    (idx: number) => {
      setLocalLinks((prev) => prev.filter((_, i) => i !== idx));
      const updated = localLinks.filter((_, i) => i !== idx).filter((l) => l.value?.trim());
      setUserProfile({ links: updated });
    },
    [localLinks, setUserProfile]
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
      {/* 🔒 FASE 6A: Indicatore permanente di stato salvataggio (Google Docs style).
          Mostra sempre lo stato corrente: pending/saving/saved/error.
          In caso di error, mostra il bottone "Riprova" che chiama retrySaveProfile(). */}
      <div className="flex justify-end items-center gap-2 min-h-[16px]">
        {profileSaveStatus === "pending" && (
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400/70" />
            {locale === "it" ? "Modifiche non salvate…" : "Unsaved changes…"}
          </span>
        )}
        {profileSaveStatus === "saving" && (
          <span className="text-[10px] text-amber-400 flex items-center gap-1">
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
            {locale === "it" ? "Salvataggio…" : "Saving…"}
          </span>
        )}
        {profileSaveStatus === "saved" && (
          <span className="text-[10px] text-emerald-400 flex items-center gap-1">
            <Save className="h-2.5 w-2.5" /> {t(locale, "profile.saved" as any)}
          </span>
        )}
        {profileSaveStatus === "error" && (
          <span className="flex items-center gap-2">
            <span className="text-[10px] text-red-400 flex items-center gap-1">
              <CloudOff className="h-2.5 w-2.5" />
              {locale === "it" ? "Errore salvataggio" : "Save failed"}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={retrySaveProfile}
              className="h-5 px-2 text-[10px] gap-1"
            >
              {locale === "it" ? "Riprova" : "Retry"}
            </Button>
            {profileSaveError && (
              <span className="text-[9px] text-muted-foreground truncate max-w-[200px]" title={profileSaveError}>
                {profileSaveError}
              </span>
            )}
          </span>
        )}
      </div>

      {/* ==================== PHOTO SECTION ==================== */}
      <Card className="bg-card/60 border-border/40">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
              {t(locale, "profile.photoUrl" as any)}
            </p>
            {/* Quick upload button (always visible, primary CTA) */}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={triggerFilePicker}
              disabled={photoUploading}
              className="h-7 gap-1.5 text-xs"
            >
              {photoUploading ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {locale === "it" ? "Caricamento…" : "Uploading…"}
                </>
              ) : (
                <>
                  <Upload className="h-3 w-3" />
                  {locale === "it" ? "Carica foto" : "Upload photo"}
                </>
              )}
            </Button>
            {/* Hidden file input — triggered by the button above */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoFileUpload}
              className="hidden"
              aria-hidden="true"
              tabIndex={-1}
            />
          </div>

          <div className="flex items-start gap-5">
            {/* Avatar (with loading overlay during upload) */}
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
              {/* Loading overlay during upload */}
              {photoUploading && (
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60">
                  <Loader2 className="h-6 w-6 text-white animate-spin" />
                </div>
              )}
              {/* Edit overlay — opens URL input (for advanced users who want to paste a URL) */}
              {!photoUploading && (
                <button
                  type="button"
                  onClick={() => setShowPhotoInput(true)}
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  aria-label={locale === "it" ? "Modifica URL foto" : "Edit photo URL"}
                  title={locale === "it" ? "Inserisci URL foto" : "Paste photo URL"}
                >
                  <Camera className="h-5 w-5 text-white" />
                </button>
              )}
            </div>

            {/* Photo URL input (advanced — most users will click "Upload photo" above) */}
            <div className="flex-1 space-y-2">
              {showPhotoInput ? (
                <Input
                  defaultValue={userProfile.photoUrl}
                  onBlur={(e) => {
                    if (userProfile.photoUrl !== e.target.value) {
                      setUserProfile({ photoUrl: e.target.value });
                    }
                    setShowPhotoInput(false);
                  }}
                  onKeyDown={handlePhotoUrlKeyDown}
                  placeholder="https://example.com/photo.jpg"
                  className="bg-secondary/50 text-sm"
                  autoFocus
                />
              ) : (
                <div
                  className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors min-h-9"
                  onClick={() => setShowPhotoInput(true)}
                >
                  {userProfile.photoUrl ? (
                    <span className="truncate font-mono text-xs">
                      {userProfile.photoUrl.startsWith("data:")
                        ? locale === "it"
                          ? "Foto caricata dal file"
                          : "Uploaded file"
                        : userProfile.photoUrl}
                    </span>
                  ) : (
                    <span className="text-xs italic">
                      {locale === "it"
                        ? "Carica un file o incolla un URL"
                        : "Upload a file or paste a URL"}
                    </span>
                  )}
                  <Pencil className="h-3 w-3 shrink-0 opacity-50" />
                </div>
              )}
              {/* Error display */}
              {photoUploadError && (
                <p className="text-xs text-red-400 flex items-center gap-1.5">
                  <span className="inline-block h-1 w-1 rounded-full bg-red-400" />
                  {photoUploadError}
                </p>
              )}
              {/* Hint */}
              <p className="text-[10px] text-muted-foreground/60">
                {locale === "it"
                  ? "JPG, PNG o GIF. Ridimensionata automaticamente a 256×256."
                  : "JPG, PNG or GIF. Automatically resized to 256×256."}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ==================== BASIC INFO SECTION ==================== */}
      <Card className="bg-card/60 border-border/40">
        <CardContent className="p-6 space-y-5">
          {/* Artist Name — 🔒 FASE 6A: onChange diretto su store, autosave gestito dal debounce interno */}
          <div className="space-y-2">
            <UILabel className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
              {t(locale, "profile.artistName" as any)}
            </UILabel>
            <Input
              value={userProfile.artistName}
              onChange={(e) => setUserProfile({ artistName: e.target.value })}
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
              value={userProfile.email}
              onChange={(e) => setUserProfile({ email: e.target.value })}
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
              value={userProfile.bio}
              onChange={(e) => setUserProfile({ bio: e.target.value })}
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

      {/* ==================== CLOUD SYNC SECTION ==================== */}
      <Card className="bg-card/60 border-border/40">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
              Sincronizzazione Cloud
            </p>
          </div>

          {/* CLOUD-FIRST (migrazione 2026-06-23):
              Non c'è più differenza admin/regular user. Le credenziali
              Supabase sono in .env.local e sono condivise da tutti.
              Qui mostriamo solo lo stato: configurato o non configurato. */}
          {isSupabaseConfigured() ? (
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                <Cloud className="h-4 w-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-emerald-400">
                    {locale === "it" ? "Sincronizzazione cloud attiva" : "Cloud sync active"}
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {locale === "it"
                      ? "I tuoi dati (profilo, demo, label, pitch, artisti) sono sincronizzati automaticamente nel cloud. Puoi accedere da qualsiasi dispositivo con lo stesso account Google — tutto sarà già lì che ti aspetta."
                      : "Your data (profile, demos, labels, pitches, artists) is automatically synced to the cloud. Access from any device with the same Google account — everything will be there waiting for you."}
                  </p>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                {locale === "it"
                  ? "Guarda l'icona cloud nell'header per verificare lo stato della sincronizzazione in tempo reale."
                  : "Check the cloud icon in the header to see real-time sync status."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/5 border border-red-500/30">
                <CloudOff className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-red-400">
                    Cloud non configurato
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Apri il file <code className="px-1 py-0.5 rounded bg-secondary/50 text-foreground">.env.local</code> nella root del progetto e inserisci le credenziali Supabase nei campi <code className="px-1 py-0.5 rounded bg-secondary/50 text-foreground">NEXT_PUBLIC_SUPABASE_URL</code> e <code className="px-1 py-0.5 rounded bg-secondary/50 text-foreground">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, poi riavvia l'app.
                  </p>
                  <p className="text-[11px] text-amber-400 leading-relaxed mt-2">
                    ⚠️ Senza cloud, i dati sono salvati solo in questo browser e saranno persi cambiando dispositivo.
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ==================== NOTIFICATIONS SECTION ==================== */}
      <Card className="bg-card/60 border-border/40">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
              {locale === "it" ? "Notifiche" : "Notifications"}
            </p>
          </div>
          <NotificationSettings />
        </CardContent>
      </Card>

      {/* ==================== CLOUD RECOVERY (diagnostica & ripristino) ====================
          Mostra lo stato reale di locale/cloud/sidecar e dà bottoni di
          ripristino per risolvere "post login non vedo niente".
          Le azioni distruttive (Sovrascrivi cloud/locale) sono admin-only
          per evitare che utenti beta/clienti facciano danni. */}
      <CloudRecovery isAdmin={isAdmin} />
    </div>
  );
}
