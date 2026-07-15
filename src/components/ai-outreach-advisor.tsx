"use client";

/**
 * 🔒 RP-024 — AI Outreach Advisor
 *
 * Pannello integrato nella scheda artista che:
 * 1. Mostra Compatibility Score (0-100) con barra grafica e livello
 * 2. Elenca le motivazioni della compatibilità (dal Musical Interest Engine)
 * 3. Suggerisce Outreach Strategy (canale, tono, lunghezza, follow-up, avvertenze)
 * 4. Pulsante "Genera DM" con messaggio personalizzato
 *
 * Architettura estensibile:
 * - Il punteggio è calcolato da una funzione dedicata (calculateCompatibilityScore)
 *   che attualmente usa ScoredArtist, ma in futuro può incorporare
 *   molteplici fattori (genere, label, attività, storico, relazioni, supporti)
 * - Le strategie sono derivate dal punteggio e dai dati dell'artista
 *   tramite regole configurabili (non hardcodate nella UI)
 * - Il DM generator usa dati release + dati artista + motivazioni
 */

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label as UILabel } from "@/components/ui/label";
import {
  Sparkles,
  Copy,
  Check,
  Send,
  Loader2,
  Lightbulb,
  TrendingUp,
  Clock,
  AlertTriangle,
  Save,
  Instagram,
  Globe,
  Music2,
  Disc3,
  Mail,
  FileText,
  ExternalLink,
} from "lucide-react";
import {
  type ScoredArtist,
} from "@/lib/target-scoring";
import {
  type ArtistContactRow,
  apiFetchArtistContact,
  apiUpsertArtistContact,
} from "@/lib/api-client";
import type { Locale } from "@/lib/i18n";
import type { Release } from "@/lib/store";

// ==================== TYPES ====================

export interface CompatibilityScore {
  score: number;           // 0-100
  level: "altissimo" | "alto" | "medio" | "basso";
  label: string;
  color: string;
  barColor: string;
}

export interface OutreachStrategy {
  channel: string;
  tone: string;
  length: string;
  followUpDays: number;
  warnings: string[];
}

// ==================== SCORE CALCULATOR ====================
//
// Funzione estensibile: attualmente deriva il punteggio da ScoredArtist
// (che usa il Musical Interest Engine). In futuro può incorporare
// fattori aggiuntivi: storico contatti, relazioni, supporti passati, ecc.

export function calculateCompatibilityScore(scored: ScoredArtist | null): CompatibilityScore {
  if (!scored) {
    return {
      score: 0,
      level: "basso",
      label: "Nessuna compatibilità",
      color: "text-muted-foreground",
      barColor: "bg-muted-foreground",
    };
  }

  // Normalizza il Musical Interest Score (che può superare 100) a 0-100
  const rawScore = scored.score;
  const normalized = Math.min(100, Math.max(0, Math.round((rawScore / 150) * 100)));

  if (normalized >= 75) {
    return {
      score: normalized,
      level: "altissimo",
      label: "Altissimo",
      color: "text-red-400",
      barColor: "bg-red-500",
    };
  }
  if (normalized >= 50) {
    return {
      score: normalized,
      level: "alto",
      label: "Alto",
      color: "text-emerald-400",
      barColor: "bg-emerald-500",
    };
  }
  if (normalized >= 25) {
    return {
      score: normalized,
      level: "medio",
      label: "Medio",
      color: "text-amber-400",
      barColor: "bg-amber-500",
    };
  }
  return {
    score: normalized,
    level: "basso",
    label: "Basso",
    color: "text-muted-foreground",
    barColor: "bg-muted-foreground",
  };
}

// ==================== STRATEGY ENGINE ====================
//
// Deriva la strategia di outreach dal punteggio e dai dati dell'artista.
// Regole configurabili (non hardcodate nella UI).

export function deriveOutreachStrategy(
  compat: CompatibilityScore,
  artist: ScoredArtist["artist"],
  contact: ArtistContactRow | null
): OutreachStrategy {
  const warnings: string[] = [];

  // Canale consigliato
  let channel = "Instagram";
  if (contact?.instagram) {
    channel = "Instagram";
  } else if (contact?.booking_email || contact?.management_email || contact?.contact_email) {
    channel = "Email";
  } else if (contact?.website) {
    channel = "Website";
  } else if (artist.labelsPublishedOn && artist.labelsPublishedOn.length > 0) {
    channel = "Booking (tramite label)";
  }

  // Tono suggerito
  let tone = "Amichevole";
  if (compat.level === "altissimo") {
    tone = "Diretto e entusiasta";
  } else if (compat.level === "alto") {
    tone = "Professionale ma caldo";
  } else if (compat.level === "medio") {
    tone = "Professionale";
  } else {
    tone = "Cauto, fai conoscere prima il tuo sound";
    warnings.push("Compatibilità bassa: considera se vale la pena contattare ora o aspettare una release più affine.");
  }

  // Lunghezza messaggio
  let length = "Media (80-120 parole)";
  if (compat.level === "altissimo") {
    length = "Breve (40-60 parole)";
  } else if (compat.level === "basso") {
    length = "Breve (30-50 parole)";
  }

  // Follow-up
  let followUpDays = 7;
  if (compat.level === "altissimo") {
    followUpDays = 5;
  } else if (compat.level === "basso") {
    followUpDays = 14;
  }

  // Avvertenze
  if (contact?.last_contact_at) {
    const daysSince = Math.floor((Date.now() - new Date(contact.last_contact_at).getTime()) / 86400000);
    if (daysSince < followUpDays) {
      warnings.push(`Già contattato ${daysSince} giorni fa. Attendi almeno ${followUpDays} giorni prima di un follow-up.`);
    }
  }

  if (artist.isRemixerOnly) {
    warnings.push("Questo artista è principalmente un remixer. Considera se la tua release originale è adatta.");
  }

  const lastSeenDays = artist.lastSeenAt
    ? Math.floor((Date.now() - new Date(artist.lastSeenAt).getTime()) / 86400000)
    : null;
  if (lastSeenDays !== null && lastSeenDays > 180) {
    warnings.push(`Artista inattivo da ${lastSeenDays} giorni nelle classifiche. Risposta meno probabile.`);
  }

  return {
    channel,
    tone,
    length,
    followUpDays,
    warnings,
  };
}

// ==================== DM GENERATOR ====================

function generateDM(
  djName: string,
  djGenres: string[],
  djLabels: string[],
  release: Release,
  reasons: string[],
  strategy: OutreachStrategy,
  locale: string
): string {
  const title = release.title?.trim() || "";
  const artists = release.artists?.join(", ") || "";
  const label = release.label?.trim() || "";
  const genre = release.genre?.trim() || "";
  const link = release.promoLink?.trim() ||
               release.beatportUrl?.trim() ||
               release.epSoundCloudUrl?.trim() ||
               release.spotifyUrl?.trim() || "";

  const djLabelStr = djLabels.slice(0, 2).join(", ");
  const topReason = reasons[0] || "";

  if (locale === "it") {
    let dm = `Hey ${djName}! 👋\n\n`;
    dm += `Ho appena rilasciato "${title}"`;
    if (artists) dm += ` di ${artists}`;
    if (label) dm += ` su ${label}`;
    if (genre) dm += ` (${genre})`;
    dm += `.\n\n`;
    if (djLabelStr) {
      dm += `Seguo il tuo lavoro, soprattutto le tue uscite su ${djLabelStr}. `;
    }
    if (topReason) {
      dm += `Penso che questa traccia possa piacerti perché ${topReason.toLowerCase()}\n\n`;
    }
    if (link) {
      dm += `Ascoltala qui: ${link}\n\n`;
    }
    dm += `Se ti piace e vuoi supportarla, fammi sapere! 🙏\n\n`;
    dm += `Grazie!`;
    return dm;
  }

  let dm = `Hey ${djName}! 👋\n\n`;
  dm += `I just dropped "${title}"`;
  if (artists) dm += ` by ${artists}`;
  if (label) dm += ` on ${label}`;
  if (genre) dm += ` (${genre})`;
  dm += `.\n\n`;
  if (djLabelStr) {
    dm += `I've been following your work, especially your releases on ${djLabelStr}. `;
  }
  if (topReason) {
    dm += `I think this track might resonate with you because ${topReason.toLowerCase()}\n\n`;
  }
  if (link) {
    dm += `Give it a listen: ${link}\n\n`;
  }
  dm += `If you're feeling it, I'd love your support! 🙏\n\n`;
  dm += `Thanks!`;
  return dm;
}

// ==================== COMPONENT ====================

interface AiOutreachAdvisorProps {
  artist: ScoredArtist["artist"];
  scored: ScoredArtist | null;
  release: Release | null;
  locale: Locale;
}

export function AiOutreachAdvisor({ artist, scored, release, locale }: AiOutreachAdvisorProps) {
  // 🔒 DEBUG RP-027: log render
  console.log(`[DEBUG AiOutreachAdvisor] ${new Date().toISOString()} RENDER`, {
    artistId: artist.id,
    artistName: artist.name,
    hasScored: !!scored,
    scoredScore: scored?.score,
    hasRelease: !!release,
    releaseTitle: release?.title,
  });

  // Compatibility score
  const compat = useMemo(() => calculateCompatibilityScore(scored), [scored]);

  // Reasons from Musical Interest Engine
  const reasons = useMemo(() => scored?.reasons || [], [scored]);

  // Contact state
  const [contact, setContact] = useState<ArtistContactRow | null>(null);
  const [loading, setLoading] = useState(true);

  // DM state
  const [dm, setDm] = useState("");
  const [dmCopied, setDmCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load contact
  useEffect(() => {
    console.log(`[DEBUG AiOutreachAdvisor] ${new Date().toISOString()} useEffect[artist.id] FIRE — apiFetchArtistContact`, {
      artistId: artist.id,
    });
    let mounted = true;
    setLoading(true);
    apiFetchArtistContact(artist.id).then((data) => {
      if (!mounted) {
        console.log(`[DEBUG AiOutreachAdvisor] ${new Date().toISOString()} useEffect[artist.id] UNMOUNTED — ignoring response`, {
          artistId: artist.id,
        });
        return;
      }
      console.log(`[DEBUG AiOutreachAdvisor] ${new Date().toISOString()} useEffect[artist.id] RESPONSE`, {
        artistId: artist.id,
        hasData: !!data,
        contact: data,
      });
      setContact(data);
      setLoading(false);
      if (data?.last_dm) {
        setDm(data.last_dm);
      }
    });
    return () => {
      console.log(`[DEBUG AiOutreachAdvisor] ${new Date().toISOString()} useEffect[artist.id] CLEANUP`, {
        artistId: artist.id,
      });
      mounted = false;
    };
  }, [artist.id]);

  // Strategy
  const strategy = useMemo(
    () => deriveOutreachStrategy(compat, artist, contact),
    [compat, artist, contact]
  );

  // Generate DM
  const handleGenerateDm = useCallback(() => {
    if (!release) return;
    const newDm = generateDM(
      artist.name,
      artist.genres || [],
      artist.labelsPublishedOn || [],
      release,
      reasons,
      strategy,
      locale
    );
    setDm(newDm);
  }, [artist, release, reasons, strategy, locale]);

  // Auto-generate on load if no saved DM
  useEffect(() => {
    console.log(`[DEBUG AiOutreachAdvisor] ${new Date().toISOString()} useEffect[auto-gen DM] FIRE`, {
      loading, hasDm: !!dm, hasRelease: !!release, hasScored: !!scored,
      willGenerate: !loading && !dm && !!release && !!scored,
    });
    if (!loading && !dm && release && scored) {
      handleGenerateDm();
    }
  }, [loading, dm, release, scored, handleGenerateDm]);

  const handleCopyDm = () => {
    navigator.clipboard.writeText(dm);
    setDmCopied(true);
    setTimeout(() => setDmCopied(false), 2000);
  };

  const handleFieldChange = (field: keyof ArtistContactRow, value: string) => {
    console.log(`[DEBUG AiOutreachAdvisor] ${new Date().toISOString()} handleFieldChange`, {
      field, valueLength: value.length, prevContact: contact,
    });
    setContact((prev) => ({
      ...(prev || { artist_id: artist.id, artist_name: artist.name }),
      [field]: value,
    }));
  };

  const handleSaveContacts = useCallback(async () => {
    console.log(`[DEBUG AiOutreachAdvisor] ${new Date().toISOString()} handleSaveContacts CALLED`, {
      contactState: contact,
    });
    setSaving(true);
    const contactData: ArtistContactRow = {
      ...(contact || { artist_id: artist.id, artist_name: artist.name }),
      artist_id: artist.id,
      artist_name: artist.name,
    };
    console.log(`[DEBUG AiOutreachAdvisor] ${new Date().toISOString()} handleSaveContacts PAYLOAD`, {
      contactData,
    });
    const ok = await apiUpsertArtistContact(contactData);
    console.log(`[DEBUG AiOutreachAdvisor] ${new Date().toISOString()} handleSaveContacts RESULT`, {
      ok,
    });
    setSaving(false);
    if (ok) {
      setContact(contactData);
      setSavedFlash(true);
      setSaveError(null);
      setTimeout(() => setSavedFlash(false), 3000);
    } else {
      setSaveError(locale === "it" ? "Errore durante il salvataggio" : "Error saving contacts");
      setTimeout(() => setSaveError(null), 5000);
    }
  }, [contact, artist, locale]);

  const handleSaveDmAndMarkContact = useCallback(async () => {
    setSaving(true);
    const contactData: ArtistContactRow = {
      ...(contact || { artist_id: artist.id, artist_name: artist.name }),
      artist_id: artist.id,
      artist_name: artist.name,
      last_dm: dm,
      last_contact_at: new Date().toISOString(),
    };
    const ok = await apiUpsertArtistContact(contactData);
    setSaving(false);
    if (ok) {
      setContact(contactData);
      setSavedFlash(true);
      setSaveError(null);
      setTimeout(() => setSavedFlash(false), 3000);
    } else {
      setSaveError(locale === "it" ? "Errore durante il salvataggio" : "Error saving");
      setTimeout(() => setSaveError(null), 5000);
    }
  }, [contact, artist, dm, locale]);

  if (!release) {
    return (
      <Card className="bg-card/60 border-border/40">
        <CardContent className="p-5 text-center">
          <Lightbulb className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            {locale === "it"
              ? "Importa una release e clicca TROVA DJ per attivare l'AI Outreach Advisor."
              : "Import a release and click FIND DJs to activate the AI Outreach Advisor."}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* === COMPATIBILITY SCORE === */}
      <Card className="bg-card/60 border-border/40">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-primary">
              AI Outreach Advisor
            </h3>
          </div>

          {/* Score bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {locale === "it" ? "Compatibility Score" : "Compatibility Score"}
              </span>
              <div className="flex items-center gap-2">
                <span className={`text-2xl font-bold ${compat.color}`}>{compat.score}</span>
                <span className="text-sm text-muted-foreground">/100</span>
                <Badge variant="secondary" className={`text-[10px] ${compat.color} bg-secondary/50`}>
                  {compat.label}
                </Badge>
              </div>
            </div>
            {/* Bar */}
            <div className="h-3 rounded-full bg-secondary/50 overflow-hidden">
              <div
                className={`h-full ${compat.barColor} transition-all duration-500 rounded-full`}
                style={{ width: `${compat.score}%` }}
              />
            </div>
          </div>

          {/* === MOTIVATIONS === */}
          {reasons.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {locale === "it" ? "Perché compatibile" : "Why compatible"}
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
        </CardContent>
      </Card>

      {/* === OUTREACH STRATEGY === */}
      <Card className="bg-card/60 border-border/40">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {locale === "it" ? "Strategia di contatto" : "Outreach strategy"}
            </h4>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <StrategyItem
              icon={<Send className="h-3 w-3" />}
              label={locale === "it" ? "Canale" : "Channel"}
              value={strategy.channel}
            />
            <StrategyItem
              icon={<Sparkles className="h-3 w-3" />}
              label={locale === "it" ? "Tono" : "Tone"}
              value={strategy.tone}
            />
            <StrategyItem
              icon={<span className="text-[10px]">📝</span>}
              label={locale === "it" ? "Lunghezza" : "Length"}
              value={strategy.length}
            />
            <StrategyItem
              icon={<Clock className="h-3 w-3" />}
              label={locale === "it" ? "Follow-up" : "Follow-up"}
              value={locale === "it" ? `Dopo ${strategy.followUpDays} giorni` : `After ${strategy.followUpDays} days`}
            />
          </div>

          {/* Warnings */}
          {strategy.warnings.length > 0 && (
            <div className="space-y-1 pt-2 border-t border-border/30">
              {strategy.warnings.map((warning, idx) => (
                <div key={idx} className="flex items-start gap-1.5 text-[11px] text-amber-400">
                  <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* === CRM CONTACTS === */}
      <Card className="bg-card/60 border-border/40">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {locale === "it" ? "Contatti CRM" : "CRM Contacts"}
            </h4>
            {savedFlash && (
              <span className="text-xs text-emerald-400 flex items-center gap-1 animate-pulse">
                <Check className="h-3 w-3" /> {locale === "it" ? "Salvato!" : "Saved!"}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ContactField icon={Instagram} label="Instagram" value={contact?.instagram || ""} onChange={(v) => handleFieldChange("instagram", v)} placeholder="@username o URL" />
            <ContactField icon={Globe} label="Website" value={contact?.website || ""} onChange={(v) => handleFieldChange("website", v)} placeholder="https://..." />
            <ContactField icon={Disc3} label="Beatport" value={contact?.beatport || ""} onChange={(v) => handleFieldChange("beatport", v)} placeholder="URL Beatport" />
            <ContactField icon={Music2} label="Spotify" value={contact?.spotify || ""} onChange={(v) => handleFieldChange("spotify", v)} placeholder="URL Spotify" />
            <ContactField icon={Music2} label="SoundCloud" value={contact?.soundcloud || ""} onChange={(v) => handleFieldChange("soundcloud", v)} placeholder="URL SoundCloud" />
            <ContactField icon={Globe} label="Resident Advisor" value={contact?.resident_advisor || ""} onChange={(v) => handleFieldChange("resident_advisor", v)} placeholder="URL RA" />
            <ContactField icon={Mail} label="Booking email" value={contact?.booking_email || ""} onChange={(v) => handleFieldChange("booking_email", v)} placeholder="booking@..." />
            <ContactField icon={Mail} label="Management email" value={contact?.management_email || ""} onChange={(v) => handleFieldChange("management_email", v)} placeholder="management@..." />
            <ContactField icon={Mail} label="Contact email" value={contact?.contact_email || ""} onChange={(v) => handleFieldChange("contact_email", v)} placeholder="contact@..." />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <UILabel className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <FileText className="h-3 w-3" /> {locale === "it" ? "Note" : "Notes"}
            </UILabel>
            <Textarea
              value={contact?.notes || ""}
              onChange={(e) => handleFieldChange("notes", e.target.value)}
              placeholder={locale === "it" ? "Note su questo DJ..." : "Notes about this DJ..."}
              rows={2}
              className="bg-secondary/50 text-sm resize-none"
            />
          </div>

          {/* Ultimo contatto + Ultimo DM */}
          {(contact?.last_contact_at || contact?.last_dm) && (
            <div className="flex flex-wrap gap-4 text-[10px] text-muted-foreground pt-2 border-t border-border/30">
              {contact?.last_contact_at && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {locale === "it" ? "Ultimo contatto:" : "Last contact:"}
                  {" "}
                  {new Date(contact.last_contact_at).toLocaleDateString(locale === "it" ? "it-IT" : "en-US", {
                    day: "numeric", month: "short", year: "numeric"
                  })}
                </span>
              )}
              {contact?.last_dm && (
                <span className="flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  {locale === "it" ? "Ultimo DM salvato" : "Last DM saved"}
                </span>
              )}
            </div>
          )}

          {/* Pulsanti rapidi */}
          <div className="flex flex-wrap gap-2">
            {contact?.instagram && (
              <Button variant="outline" size="sm" onClick={() => window.open(contact.instagram!, "_blank", "noopener,noreferrer")} className="gap-1.5 text-xs h-8">
                <Instagram className="h-3.5 w-3.5" /> Instagram <ExternalLink className="h-3 w-3 opacity-50" />
              </Button>
            )}
            {contact?.beatport && (
              <Button variant="outline" size="sm" onClick={() => window.open(contact.beatport!, "_blank", "noopener,noreferrer")} className="gap-1.5 text-xs h-8">
                <Disc3 className="h-3.5 w-3.5" /> Beatport <ExternalLink className="h-3 w-3 opacity-50" />
              </Button>
            )}
            {contact?.website && (
              <Button variant="outline" size="sm" onClick={() => window.open(contact.website!, "_blank", "noopener,noreferrer")} className="gap-1.5 text-xs h-8">
                <Globe className="h-3.5 w-3.5" /> Website <ExternalLink className="h-3 w-3 opacity-50" />
              </Button>
            )}
            {contact?.spotify && (
              <Button variant="outline" size="sm" onClick={() => window.open(contact.spotify!, "_blank", "noopener,noreferrer")} className="gap-1.5 text-xs h-8">
                <Music2 className="h-3.5 w-3.5" /> Spotify <ExternalLink className="h-3 w-3 opacity-50" />
              </Button>
            )}
            {contact?.soundcloud && (
              <Button variant="outline" size="sm" onClick={() => window.open(contact.soundcloud!, "_blank", "noopener,noreferrer")} className="gap-1.5 text-xs h-8">
                <Music2 className="h-3.5 w-3.5" /> SoundCloud <ExternalLink className="h-3 w-3 opacity-50" />
              </Button>
            )}
          </div>

          <Button onClick={handleSaveContacts} disabled={saving} variant="outline" className="w-full gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {savedFlash
              ? (locale === "it" ? "✓ Contatti salvati" : "✓ Contacts saved")
              : (locale === "it" ? "Salva contatti" : "Save contacts")}
          </Button>
          {saveError && (
            <p className="text-xs text-red-400 text-center flex items-center justify-center gap-1">
              <AlertTriangle className="h-3 w-3" /> {saveError}
            </p>
          )}
        </CardContent>
      </Card>

      {/* === DM GENERATOR === */}
      <Card className="bg-card/60 border-primary/20">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5" />
              {locale === "it" ? "Messaggio promozionale" : "Promo message"}
            </h4>
            <Button variant="outline" size="sm" onClick={handleGenerateDm} className="h-7 gap-1 text-xs">
              <Sparkles className="h-3 w-3" />
              {locale === "it" ? "Genera DM" : "Generate DM"}
            </Button>
          </div>

          {contact?.last_contact_at && (
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {locale === "it" ? "Ultimo contatto:" : "Last contact:"}
              {" "}
              {new Date(contact.last_contact_at).toLocaleDateString(locale === "it" ? "it-IT" : "en-US", {
                day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
              })}
            </p>
          )}

          <Textarea
            value={dm}
            onChange={(e) => setDm(e.target.value)}
            rows={8}
            className="bg-secondary/50 text-sm resize-y font-mono"
          />

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleCopyDm} className="gap-1.5 text-xs flex-1">
              {dmCopied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              {dmCopied ? (locale === "it" ? "Copiato!" : "Copied!") : (locale === "it" ? "Copia DM" : "Copy DM")}
            </Button>
            <Button
              size="sm"
              onClick={handleSaveDmAndMarkContact}
              disabled={saving}
              className="gap-1.5 text-xs flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              {savedFlash
                ? (locale === "it" ? "✓ Salvato!" : "✓ Saved!")
                : (locale === "it" ? "Salva + segna contattato" : "Save + mark contacted")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ==================== STRATEGY ITEM ====================

function StrategyItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        {icon} {label}
      </p>
      <p className="text-xs text-foreground">{value}</p>
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
