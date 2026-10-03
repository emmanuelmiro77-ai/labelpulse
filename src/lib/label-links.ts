/**
 * Label Discovery URLs
 *
 * Generates clickable links to Beatport and Beatstats for any label,
 * so the user can quickly discover who they are, see their roster,
 * and listen to their tracks.
 *
 * Strategy:
 *   1. Beatport:
 *      - If the user has manually entered a `beatportLink`, use it directly.
 *      - Otherwise, generate a Beatport search URL by name.
 *
 *   2. Beatstats (priority order — see getLabelDiscoveryUrls for details):
 *      A. If the label has a verified `beatportId` + `slug` (structured
 *         Beatport identity captured by the scraper), build the direct
 *         label page URL: https://www.beatstats.com/label/{slug}/{beatportId}.
 *         The Beatport ID is shared with Beatstats — verified empirically
 *         with Berlin Records (Beatport id 129968 → Beatstats label page
 *         /label/berlin-records/129968). This avoids the ambiguous
 *         text-search fallback that could match a same-named label.
 *      B. If the user has manually entered a `beatstatsLink`, use it
 *         directly (preserves any pre-existing manual override).
 *      C. Otherwise, fall back to the Beatstats search URL using the
 *         label name (the historical behavior).
 *
 * Why not scrape / call an API?
 *   - Beatport v4 API requires authentication (returns 401/403 for anon)
 *   - Both Beatport and Beatstats sit behind Cloudflare's bot protection,
 *     which blocks server-side scraping with a JS challenge.
 *   - The pragmatic solution: build a direct URL from the structured
 *     Beatport identity (slug + beatportId) when available; otherwise
 *     link to the search page.
 *
 * Beatstats search URL note:
 *   Beatstats does NOT use the conventional `?q=...&type=label` pattern.
 *   Its search form (verified from the homepage markup) uses:
 *     - Route: /search/search/index  (Symfony-style SPA route)
 *     - Query param name: searchresult  (NOT q)
 *   Using `?q=Drumcode&type=label` redirects to a blank/empty page.
 *   Using `?searchresult=Drumcode` lands on the actual search results
 *   with the label pre-filled.
 */

export interface LabelLike {
  name: string;
  beatportLink?: string;
  soundcloudLink?: string;
  website?: string;
  /**
   * Beatport numeric id (e.g., 129968) — captured by the scraper at import
   * time. Shared with Beatstats: the same id identifies the same label on
   * both platforms. Optional because seed labels (labels-data.json) don't
   * have it; only scraper-imported labels do.
   */
  beatportId?: number | string | null;
  /**
   * Beatport URL slug (e.g., "berlin-records"). Used as the URL path
   * segment on both Beatport and Beatstats label pages. Optional for the
   * same reason as `beatportId`.
   */
  slug?: string;
  /**
   * Optional manually-entered direct Beatstats label URL. When present
   * AND no structured beatportId+slug is available, this takes precedence
   * over the search fallback. (When beatportId+slug ARE available, the
   * structured direct link is preferred as the verified path.)
   */
  beatstatsLink?: string;
}

export interface LabelDiscoveryUrls {
  /** Direct Beatport label page OR Beatport search results for the label name */
  beatport: string;
  /**
   * Beatstats label page (direct, from beatportId+slug) OR
   * user-provided beatstatsLink OR
   * Beatstats search results for the label name
   */
  beatstats: string;
  /** SoundCloud URL if user provided one, otherwise SoundCloud search for the label */
  soundcloud: string;
  /** Official website if user provided one (empty string otherwise) */
  website: string;
  /**
   * True if `beatport` is a direct label page (user-provided) rather
   * than a search URL. Used by the UI to show a "verified" badge.
   */
  beatportIsDirect: boolean;
}

/**
 * Build discovery URLs for a label.
 *
 * @example
 *   getLabelDiscoveryUrls({ name: "Drumcode" })
 *   // → {
 *   //     beatport: "https://www.beatport.com/search?q=Drumcode&type=labels",
 *   //     beatstats: "https://www.beatstats.com/search/search/index?searchresult=Drumcode",
 *   //     soundcloud: "https://soundcloud.com/search?q=Drumcode",
 *   //     website: "",
 *   //     beatportIsDirect: false
 *   //   }
 *
 *   getLabelDiscoveryUrls({ name: "Drumcode", beatportLink: "https://www.beatport.com/label/drumcode/617" })
 *   // → { beatport: "https://www.beatport.com/label/drumcode/617", beatportIsDirect: true, ... }
 *
 *   getLabelDiscoveryUrls({
 *     name: "Berlin Records",
 *     beatportId: 129968,
 *     slug: "berlin-records",
 *   })
 *   // → { beatstats: "https://www.beatstats.com/label/berlin-records/129968", ... }
 */
export function getLabelDiscoveryUrls(label: LabelLike): LabelDiscoveryUrls {
  const name = (label.name || "").trim();
  const encodedName = encodeURIComponent(name);

  // Beatport: direct link if user provided one, otherwise search
  const userBeatport = (label.beatportLink || "").trim();
  const beatportIsDirect =
    userBeatport.length > 0 &&
    /beatport\.com\/label\//i.test(userBeatport);
  const beatport = userBeatport || `https://www.beatport.com/search?q=${encodedName}&type=labels`;

  // Beatstats — priority order (A → B → C):
  //
  // A. Structured Beatport identity (preferred): if both `beatportId` and
  //    `slug` are present, build the direct label page URL. The Beatport
  //    ID is shared with Beatstats (verified with Berlin Records:
  //    Beatport /label/berlin-records/129968 == Beatstats
  //    /label/berlin-records/129968). This is the most reliable path —
  //    it does NOT rely on text search, so it can never match a same-named
  //    label by mistake.
  //
  // B. User-provided manual `beatstatsLink`: use it verbatim. This
  //    preserves any pre-existing manual override (e.g., a label whose
  //    Beatstats slug differs from Beatport's, or a Beatstats-only label
  //    the user curated by hand). Only reached when A does not apply.
  //
  // C. Search fallback: the historical behavior. Used when neither A
  //    nor B can produce a direct link.
  const slug = (label.slug || "").trim();
  const rawId = label.beatportId;
  const idStr =
    rawId === null || rawId === undefined
      ? ""
      : String(rawId).trim();
  const userBeatstats = (label.beatstatsLink || "").trim();

  let beatstats: string;
  if (slug.length > 0 && idStr.length > 0) {
    // A — direct label page via shared Beatport ID
    beatstats = `https://www.beatstats.com/label/${slug}/${idStr}`;
  } else if (userBeatstats.length > 0) {
    // B — user-provided manual link
    beatstats = userBeatstats;
  } else {
    // C — search fallback
    beatstats = `https://www.beatstats.com/search/search/index?searchresult=${encodedName}`;
  }

  // SoundCloud: direct link if user provided one, otherwise search
  const userSc = (label.soundcloudLink || "").trim();
  const soundcloud = userSc || `https://soundcloud.com/search?q=${encodedName}`;

  // Website: only if user provided one
  const website = (label.website || "").trim();

  return {
    beatport,
    beatstats,
    soundcloud,
    website,
    beatportIsDirect,
  };
}

/**
 * Returns true if at least one discovery URL is available for the label.
 * (Always true as long as the label has a name — we can always search.)
 */
export function hasDiscoveryUrls(label: LabelLike): boolean {
  return !!(label.name && label.name.trim());
}
