/**
 * Label Discovery URLs
 *
 * Generates clickable links to Beatport and Beatstats for any label,
 * so the user can quickly discover who they are, see their roster,
 * and listen to their tracks.
 *
 * Strategy:
 *   1. If the user has manually entered a `beatportLink` for the label,
 *      use that directly (it points to the exact label page).
 *   2. Otherwise, generate a search URL on Beatport / Beatstats with the
 *      label name pre-filled — one click and the user is on the results
 *      page, ready to explore.
 *
 * Why not scrape / call an API?
 *   - Beatport v4 API requires authentication (returns 401/403 for anon)
 *   - Both Beatport and Beatstats sit behind Cloudflare's bot protection,
 *     which blocks server-side scraping with a JS challenge.
 *   - The pragmatic solution: link to the search page. The user clicks
 *     through and lands on the right results in <1s.
 */

export interface LabelLike {
  name: string;
  beatportLink?: string;
  soundcloudLink?: string;
  website?: string;
}

export interface LabelDiscoveryUrls {
  /** Direct Beatport label page OR Beatport search results for the label name */
  beatport: string;
  /** Beatstats search results for the label name */
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
 *   //     beatstats: "https://www.beatstats.com/search?q=Drumcode&type=label",
 *   //     soundcloud: "https://soundcloud.com/search?q=Drumcode",
 *   //     website: "",
 *   //     beatportIsDirect: false
 *   //   }
 *
 *   getLabelDiscoveryUrls({ name: "Drumcode", beatportLink: "https://www.beatport.com/label/drumcode/617" })
 *   // → { beatport: "https://www.beatport.com/label/drumcode/617", beatportIsDirect: true, ... }
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

  // Beatstats: search URL (no direct link field exists in our schema yet)
  const beatstats = `https://www.beatstats.com/search?q=${encodedName}&type=label`;

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
