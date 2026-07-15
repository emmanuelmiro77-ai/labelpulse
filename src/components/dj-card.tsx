"use client";

/**
 * 🔒 RP-023 — DJ Card: scheda CRM per promuovere una release.
 *
 * Flusso: Importa → Trova DJ → Apri scheda → Genera DM → Copia → Invia.
 *
 * Scheda contiene:
 * - Dati Beatport dell'artista (genere, label, score, confidence, motivazioni)
 * - Contatti CRM editabili (9 campi + note)
 * - Pulsanti rapidi (Instagram, Beatport, Website, Spotify, SoundCloud, RA)
 * - Pulsante "Genera DM" che crea messaggio personalizzato usando:
 *   nome DJ, genere, label principali DJ, titolo release, artisti release,
 *   label release, link scelto dall'utente (PromoLink/Beatport/SoundCloud)
 * - DM modificabile e copiabile con un click
 * - Salvataggio ultimo DM + data ultimo contatto nel database
 */

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label as UILabel } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  ExternalLink,
  Save,
  Loader2,
  Check,
  Copy,
  Instagram,
  Globe,
  Music2,
  Disc3,
  Mail,
  FileText,
  Sparkles,
  Send,
  Calendar,
} from "lucide-react";
import {
  type ScoredArtist,
  getArtistBeatportUrl,
  PRIORITY_LABELS,
  CONFIDENCE_LABELS,
} from "@/lib/target-scoring";
import {
  type ArtistContactRow,
  apiFetchArtistContact,
  apiUpsertArtistContact,
} from "@/lib/api-client";
import type { Locale } from "@/lib/i18n";
import type { Release } from "@/lib/store";

// ==================== DM GENERATOR ====================

function generatePromoDM(
  djName: string,
  djGenres: string[],
  djLabels: string[],
  release: Release,
  locale: string
): string {
  const title = release.title?.trim() || "";
  const artists = release.artists?.join(", ") || "";
  const label = release.label?.trim() || "";
  const genre = release.genre?.trim() || "";

  // Scegli il link migliore disponibile
  const link = release.promoLink?.trim() ||
               release.beatportUrl?.trim() ||
               release.epSoundCloudUrl?.trim() ||
               release.spotifyUrl?.trim() ||
               "";

  // Label principali del DJ (top 2)
  const djLabelStr = djLabels.slice(0, 2).join(", ");

  if (locale === "it") {
    let dm = `Hey ${djName}! 👋\n\n`;
    dm += `Ho appena rilasciato "${title}"`;
    if (artists) dm += ` di ${artists}`;
    if (label) dm += ` su ${label}`;
    if (genre) dm += ` (${genre})`;
    dm += `.\n\n`;
    if (djLabelStr) {
      dm += `Seguo il tuo lavoro, specialmente le tue release su ${djLabelStr}. `;
    }
    if (djGenres.length > 0) {
      dm += `Visto che sei attivo nella scena ${djGenres[0]}, `;
    }
    dm += `ho pensato che questa traccia potrebbe piacerti.\n\n`;
    if (link) {
      dm += `Ascoltala qui: ${link}\n\n`;
    }
    dm += `Se ti piace e vuoi supportarla nei tuoi set, fammi sapere! 🙏\n\n`;
    dm += `Grazie del tuo tempo!`;
    return dm;
  }

  let dm = `Hey ${djName}! 👋\n\n`;
  dm += `I just released "${title}"`;
  if (artists) dm += ` by ${artists}`;
  if (label) dm += ` on ${label}`;
  if (genre) dm += ` (${genre})`;
  dm += `.\n\n`;
  if (djLabelStr) {
    dm += `I've been following your work, especially your releases on ${djLabelStr}. `;
  }
  if (djGenres.length > 0) {
    dm += `Since you're active in the ${djGenres[0]} scene, `;
  }
  dm += `I thought this track might be up your alley.\n\n`;
  if (link) {
    dm += `Give it a listen here: ${link}\n\n`;
  }
  dm += `If you're feeling it and want to support it in your sets, let me know! 🙏\n\n`;
  dm += `Thanks for your time!`;
  return dm;
}

// ==================== COMPONENT ====================

interface DjCardProps {
  target: ScoredArtist;
  release: Release;
  onBack: () => void;
  locale: Locale;
}

export function DjCard({ target, release, onBack, locale }: DjCardProps) {
  const { artist, priority, confidenceLabel, confidence, reasons, score } = target;
  const meta = PRIORITY_LABELS[priority];
  const confMeta = CONFIDENCE_LABELS[confidenceLabel];
  const beatportUrl = getArtistBeatportUrl(artist);

  const [contact, setContact] = useState<ArtistContactRow>({
    artist_id: artist.id,
    artist_name: artist.name,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const [dm, setDm] = useState("");
  const [dmCopied, setDmCopied] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    apiFetchArtistContact(artist.id).then((data) => {
      if (!mounted) return;
      if (data) {
        setContact(data);
        // Se c'è un ultimo DM salvato, caricalo
        if (data.last_dm) {
          setDm(data.last_dm);
        }
      }
      setLoading(false);
    });
    return () => { mounted = false; };
  }, [artist.id]);

  const handleGenerateDm = () => {
    const newDm = generatePromoDM(
      artist.name,
      artist.genres || [],
      artist.labelsPublishedOn || [],
      release,
      locale
    );
    setDm(newDm);
  };

  // Auto-genera al primo caricamento se non c'è un DM salvato
  useEffect(() => {
    if (!loading && !dm) {
      handleGenerateDm();
    }
  }, [loading, dm]);

  const handleFieldChange = (field: keyof ArtistContactRow, value: string) => {
    setContact((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveContacts = useCallback(async () => {
    setSaving(true);
    const ok = await apiUpsertArtistContact(contact);
    setSaving(false);
    if (ok) {
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    }
  }, [contact]);

  const handleSaveDmAndMarkContact = useCallback(async () => {
    setSaving(true);
    const ok = await apiUpsertArtistContact({
      ...contact,
      last_dm: dm,
      last_contact_at: new Date().toISOString(),
    });
    setSaving(false);
    if (ok) {
      setContact((prev) => ({
        ...prev,
        last_dm: dm,
        last_contact_at: new Date().toISOString(),
      }));
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    }
  }, [contact, dm]);

  const handleCopyDm = () => {
    navigator.clipboard.writeText(dm);
    setDmCopied(true);
    setTimeout(() => setDmCopied(false), 2000);
  };

  const openUrl = (url: string) => window.open(url, "_blank", "noopener,noreferrer");

  const genresToShow = (artist.genres || []).slice(0, 3);
  const labelsToShow = (artist.labelsPublishedOn || []).slice(0, 3);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* === HEADER === */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-muted-foreground">
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          {locale === "it" ? "Lista DJ" : "DJ list"}
        </Button>
      </div>

      {/* === ARTIST INFO === */}
      <Card className="bg-card/60 border-border/40">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0 flex-1">
              <h2 className="text-xl font-bold truncate">{artist.name}</h2>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {genresToShow.map((g) => (
                  <Badge key={g} variant="secondary" className="text-[10px] font-mono">{g}</Badge>
                ))}
                {labelsToShow.length > 0 && (
                  <span className="text-muted-foreground">· {labelsToShow.join(" · ")}</span>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              <span className={`flex items-center gap-1 text-xs font-medium ${meta.color}`}>
                <span>{meta.icon}</span>
                <span>{meta.label}</span>
              </span>
              <span className={`text-xs font-mono ${confMeta.color}`}>conf {confidence}%</span>
              <span className="text-[10px] text-muted-foreground">score: {score}</span>
            </div>
          </div>

          {/* Reasons */}
          {reasons.length > 0 && (
            <div className="rounded-md bg-primary/5 border border-primary/15 p-3">
              <p className="text-[9px] uppercase tracking-wider font-semibold text-primary/80 mb-1.5">
                {locale === "it" ? "Perché è stato selezionato" : "Why selected"}
              </p>
              <ul className="space-y-1">
                {reasons.map((reason, idx) => (
                  <li key={idx} className="flex items-start gap-1.5 text-xs text-foreground/80">
                    <Check className="h-3 w-3 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* === PULSANTI RAPIDI === */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-border/30">
            {contact.instagram && (
              <Button variant="outline" size="sm" onClick={() => openUrl(contact.instagram!)} className="gap-1.5 text-xs h-8">
                <Instagram className="h-3.5 w-3.5" /> Instagram
                <ExternalLink className="h-3 w-3 opacity-50" />
              </Button>
            )}
            {beatportUrl && (
              <Button variant="outline" size="sm" onClick={() => openUrl(beatportUrl)} className="gap-1.5 text-xs h-8">
                <Disc3 className="h-3.5 w-3.5" /> Beatport
                <ExternalLink className="h-3 w-3 opacity-50" />
              </Button>
            )}
            {contact.website && (
              <Button variant="outline" size="sm" onClick={() => openUrl(contact.website!)} className="gap-1.5 text-xs h-8">
                <Globe className="h-3.5 w-3.5" /> Website
                <ExternalLink className="h-3 w-3 opacity-50" />
              </Button>
            )}
            {contact.spotify && (
              <Button variant="outline" size="sm" onClick={() => openUrl(contact.spotify!)} className="gap-1.5 text-xs h-8">
                <Music2 className="h-3.5 w-3.5" /> Spotify
                <ExternalLink className="h-3 w-3 opacity-50" />
              </Button>
            )}
            {contact.soundcloud && (
              <Button variant="outline" size="sm" onClick={() => openUrl(contact.soundcloud!)} className="gap-1.5 text-xs h-8">
                <Music2 className="h-3.5 w-3.5" /> SoundCloud
                <ExternalLink className="h-3 w-3 opacity-50" />
              </Button>
            )}
            {contact.resident_advisor && (
              <Button variant="outline" size="sm" onClick={() => openUrl(contact.resident_advisor!)} className="gap-1.5 text-xs h-8">
                <Globe className="h-3.5 w-3.5" /> RA
                <ExternalLink className="h-3 w-3 opacity-50" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* === CONTACT FORM === */}
      <Card className="bg-card/60 border-border/40">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {locale === "it" ? "Contatti" : "Contacts"}
            </h3>
            {savedFlash && (
              <span className="text-xs text-emerald-400 flex items-center gap-1 animate-pulse">
                <Check className="h-3 w-3" /> {locale === "it" ? "Salvato!" : "Saved!"}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ContactField icon={Instagram} label="Instagram" value={contact.instagram || ""} onChange={(v) => handleFieldChange("instagram", v)} placeholder="@username o URL" />
            <ContactField icon={Disc3} label="Beatport" value={contact.beatport || ""} onChange={(v) => handleFieldChange("beatport", v)} placeholder="URL Beatport" />
            <ContactField icon={Globe} label="Website" value={contact.website || ""} onChange={(v) => handleFieldChange("website", v)} placeholder="https://..." />
            <ContactField icon={Music2} label="SoundCloud" value={contact.soundcloud || ""} onChange={(v) => handleFieldChange("soundcloud", v)} placeholder="URL SoundCloud" />
            <ContactField icon={Music2} label="Spotify" value={contact.spotify || ""} onChange={(v) => handleFieldChange("spotify", v)} placeholder="URL Spotify" />
            <ContactField icon={Globe} label="Resident Advisor" value={contact.resident_advisor || ""} onChange={(v) => handleFieldChange("resident_advisor", v)} placeholder="URL RA" />
            <ContactField icon={Mail} label="Booking email" value={contact.booking_email || ""} onChange={(v) => handleFieldChange("booking_email", v)} placeholder="booking@..." />
            <ContactField icon={Mail} label="Management email" value={contact.management_email || ""} onChange={(v) => handleFieldChange("management_email", v)} placeholder="management@..." />
            <ContactField icon={Mail} label="Contact email" value={contact.contact_email || ""} onChange={(v) => handleFieldChange("contact_email", v)} placeholder="contact@..." />
          </div>

          <div className="space-y-1.5">
            <UILabel className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <FileText className="h-3 w-3" /> {locale === "it" ? "Note" : "Notes"}
            </UILabel>
            <Textarea
              value={contact.notes || ""}
              onChange={(e) => handleFieldChange("notes", e.target.value)}
              placeholder={locale === "it" ? "Note su questo DJ..." : "Notes about this DJ..."}
              rows={2}
              className="bg-secondary/50 text-sm resize-none"
            />
          </div>

          <Button onClick={handleSaveContacts} disabled={saving} variant="outline" className="w-full gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {locale === "it" ? "Salva contatti" : "Save contacts"}
          </Button>
        </CardContent>
      </Card>

      {/* === PROMO DM === */}
      <Card className="bg-card/60 border-primary/20">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-primary flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5" />
              {locale === "it" ? "Messaggio promozionale" : "Promo message"}
            </h3>
            <Button variant="outline" size="sm" onClick={handleGenerateDm} className="h-7 gap-1 text-xs">
              <Sparkles className="h-3 w-3" />
              {locale === "it" ? "Genera DM" : "Generate DM"}
            </Button>
          </div>

          {/* Ultimo contatto */}
          {contact.last_contact_at && (
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {locale === "it" ? "Ultimo contatto:" : "Last contact:"}
              {" "}
              {new Date(contact.last_contact_at).toLocaleDateString(locale === "it" ? "it-IT" : "en-US", {
                day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
              })}
            </p>
          )}

          <Textarea
            value={dm}
            onChange={(e) => setDm(e.target.value)}
            rows={10}
            className="bg-secondary/50 text-sm resize-y font-mono"
          />

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleCopyDm} className="gap-1.5 text-xs flex-1">
              {dmCopied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              {dmCopied ? (locale === "it" ? "Copiato!" : "Copied!") : (locale === "it" ? "Copia DM" : "Copy DM")}
            </Button>
            <Button size="sm" onClick={handleSaveDmAndMarkContact} disabled={saving} className="gap-1.5 text-xs flex-1 bg-emerald-600 hover:bg-emerald-700 text-white">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              {locale === "it" ? "Salva DM + segna contattato" : "Save DM + mark contacted"}
            </Button>
          </div>

          <p className="text-[10px] text-muted-foreground">
            {locale === "it"
              ? "Il DM usa: nome DJ, genere, label principali del DJ, titolo release, artisti, label release, link promo."
              : "DM uses: DJ name, genre, DJ's main labels, release title, artists, release label, promo link."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ==================== CONTACT FIELD ====================

function ContactField({
  icon: Icon,
  label,
  value,
  onChange,
  placeholder,
}: {
  icon: typeof Instagram;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <UILabel className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        <Icon className="h-3 w-3" /> {label}
      </UILabel>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || ""}
        className="h-9 text-sm bg-secondary/50"
      />
    </div>
  );
}
