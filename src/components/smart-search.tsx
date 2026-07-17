"use client";

/**
 * 🔒 RP-003A — Smart Search
 *
 * Sezione con 4 pulsanti di ricerca rapida Google per un artista.
 * Ogni pulsante apre una nuova tab con una query Google predefinita.
 *
 * Niente pattern URL, niente tag Instagram, niente contatti non verificati.
 * Nessun salvataggio. Solo shortcut per ridurre il tempo di ricerca manuale.
 *
 * Pulsanti:
 *   - Instagram      → "<nome> instagram"
 *   - Booking        → "<nome> booking"
 *   - Contact        → "<nome> contact"
 *   - Official Website → "<nome> official website"
 *
 * 🔒 RP-034 PATCH — Override via artist_custom_data
 * Se l'utente ha salvato un link diretto (instagram_url, website_url) o
 * un'email, il pulsante corrispondente apre quel link / mailto: invece
 * della Google Search generata automaticamente.
 * Quando l'override è attivo, il pulsante mostra un bordo verde per
 * distinguere il link salvato dalla ricerca automatica.
 */

import { ExternalLink, Instagram, Calendar, Mail, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t, type Locale } from "@/lib/i18n";

interface SmartSearchProps {
  artistName: string;
  locale: Locale;
  // RP-034 PATCH — overrides from artist_custom_data
  instagramUrl?: string | null;
  websiteUrl?: string | null;
  email?: string | null;
}

type SearchType = "instagram" | "booking" | "contact" | "website";

interface SearchConfig {
  id: SearchType;
  labelIt: string;
  labelEn: string;
  querySuffix: string;
  icon: typeof Instagram;
}

const SEARCH_CONFIGS: SearchConfig[] = [
  {
    id: "instagram",
    labelIt: "Instagram",
    labelEn: "Instagram",
    querySuffix: "instagram",
    icon: Instagram,
  },
  {
    id: "booking",
    labelIt: "Booking",
    labelEn: "Booking",
    querySuffix: "booking",
    icon: Calendar,
  },
  {
    id: "contact",
    labelIt: "Contact",
    labelEn: "Contact",
    querySuffix: "contact",
    icon: Mail,
  },
  {
    id: "website",
    labelIt: "Official Website",
    labelEn: "Official Website",
    querySuffix: "official website",
    icon: Globe,
  },
];

function buildGoogleSearchUrl(artistName: string, querySuffix: string): string {
  const query = `"${artistName}" ${querySuffix}`;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

/**
 * Risolve l'URL finale per un pulsante SmartSearch.
 * - Se l'override è valorizzato, usa quello (link diretto o mailto:).
 * - Altrimenti usa la Google Search generata automaticamente.
 */
function resolveButtonUrl(
  searchType: SearchType,
  artistName: string,
  querySuffix: string,
  overrides: {
    instagramUrl?: string | null;
    websiteUrl?: string | null;
    email?: string | null;
  },
): { url: string; isOverride: boolean } {
  switch (searchType) {
    case "instagram":
      if (overrides.instagramUrl && overrides.instagramUrl.trim()) {
        return { url: overrides.instagramUrl.trim(), isOverride: true };
      }
      break;
    case "website":
      if (overrides.websiteUrl && overrides.websiteUrl.trim()) {
        return { url: overrides.websiteUrl.trim(), isOverride: true };
      }
      break;
    case "contact":
      if (overrides.email && overrides.email.trim()) {
        return { url: `mailto:${overrides.email.trim()}`, isOverride: true };
      }
      break;
    case "booking":
    default:
      // Booking non ha override — sempre Google Search.
      break;
  }
  return {
    url: buildGoogleSearchUrl(artistName, querySuffix),
    isOverride: false,
  };
}

export function SmartSearch({
  artistName,
  locale,
  instagramUrl,
  websiteUrl,
  email,
}: SmartSearchProps) {
  if (!artistName) return null;

  const overrides = { instagramUrl, websiteUrl, email };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Globe className="h-3.5 w-3.5 text-primary" />
        <h3 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
          {locale === "it" ? "Smart Search" : "Smart Search"}
        </h3>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {SEARCH_CONFIGS.map((config) => {
          const Icon = config.icon;
          const { url, isOverride } = resolveButtonUrl(
            config.id,
            artistName,
            config.querySuffix,
            overrides,
          );
          const label = locale === "it" ? config.labelIt : config.labelEn;
          return (
            <Button
              key={config.id}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
              className={`h-9 justify-start gap-2 text-xs ${
                isOverride
                  ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-300 hover:bg-emerald-500/10"
                  : ""
              }`}
              title={
                isOverride
                  ? locale === "it"
                    ? "Link salvato in artist_custom_data"
                    : "Saved link from artist_custom_data"
                  : locale === "it"
                    ? "Ricerca Google automatica"
                    : "Automatic Google search"
              }
            >
              <Icon
                className={`h-3.5 w-3.5 flex-shrink-0 ${
                  isOverride ? "text-emerald-400" : "text-primary"
                }`}
              />
              <span className="truncate">{label}</span>
              <ExternalLink className="h-3 w-3 ml-auto opacity-50 flex-shrink-0" />
            </Button>
          );
        })}
      </div>
    </div>
  );
}
