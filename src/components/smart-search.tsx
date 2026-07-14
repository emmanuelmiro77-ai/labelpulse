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
 */

import { ExternalLink, Instagram, Calendar, Mail, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t, type Locale } from "@/lib/i18n";

interface SmartSearchProps {
  artistName: string;
  locale: Locale;
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

export function SmartSearch({ artistName, locale }: SmartSearchProps) {
  if (!artistName) return null;

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
          const url = buildGoogleSearchUrl(artistName, config.querySuffix);
          const label = locale === "it" ? config.labelIt : config.labelEn;
          return (
            <Button
              key={config.id}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
              className="h-9 justify-start gap-2 text-xs"
            >
              <Icon className="h-3.5 w-3.5 text-primary flex-shrink-0" />
              <span className="truncate">{label}</span>
              <ExternalLink className="h-3 w-3 ml-auto opacity-50 flex-shrink-0" />
            </Button>
          );
        })}
      </div>
    </div>
  );
}
