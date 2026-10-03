/**
 * Beatstats link generation — direct vs fallback regression tests
 *
 * Bug fixed: previously the Beatstats URL was ALWAYS the text-search URL
 *   https://www.beatstats.com/search/search/index?searchresult={name}
 * even when the label had a verified Beatport identity. This caused
 * ambiguity when multiple labels shared the same name.
 *
 * Fix: when the label has both `beatportId` and `slug` (the structured
 * Beatport identity captured by the scraper), the Beatstats URL is built
 * directly as:
 *   https://www.beatstats.com/label/{slug}/{beatportId}
 *
 * Verified case: Berlin Records
 *   Beatport: https://www.beatport.com/label/berlin-records/129968
 *   Beatstats: https://www.beatstats.com/label/berlin-records/129968
 *   → Beatport ID 129968 is shared with Beatstats.
 */
import { describe, it, expect } from "vitest";
import { getLabelDiscoveryUrls, hasDiscoveryUrls } from "@/lib/label-links";

describe("getLabelDiscoveryUrls — Beatstats link generation", () => {
  describe("TEST 1: Berlin Records (verified case)", () => {
    it("builds the exact direct Beatstats URL from beatportId + slug", () => {
      const urls = getLabelDiscoveryUrls({
        name: "Berlin Records",
        beatportId: 129968,
        slug: "berlin-records",
      });

      // Must be EXACTLY this URL — no query, no search, no encoding tricks.
      expect(urls.beatstats).toBe(
        "https://www.beatstats.com/label/berlin-records/129968"
      );
    });

    it("also works when beatportId is provided as a string", () => {
      // Some persistence layers serialize numbers as strings.
      const urls = getLabelDiscoveryUrls({
        name: "Berlin Records",
        beatportId: "129968",
        slug: "berlin-records",
      });

      expect(urls.beatstats).toBe(
        "https://www.beatstats.com/label/berlin-records/129968"
      );
    });
  });

  describe("TEST 2: Different slug/beatportId (no name parsing)", () => {
    it("uses the structured slug + id verbatim, does NOT parse the name", () => {
      // Hypothetical label whose Beatport slug differs from a naive
      // lowercased-and-dashed version of the name.
      const urls = getLabelDiscoveryUrls({
        name: "KNTXT Records",
        beatportId: 52807,
        slug: "kntxt", // NOT "kntxt-records"
      });

      // The URL must use the structured slug, not anything derived from name.
      expect(urls.beatstats).toBe(
        "https://www.beatstats.com/label/kntxt/52807"
      );
      // The name is NOT used for the URL — only as fallback if no id+slug.
      expect(urls.beatstats).not.toContain("KNTXT%20Records");
      expect(urls.beatstats).not.toContain("kntxt-records");
    });

    it("builds the correct URL for Drumcode (well-known label)", () => {
      const urls = getLabelDiscoveryUrls({
        name: "Drumcode",
        beatportId: 617,
        slug: "drumcode",
      });

      expect(urls.beatstats).toBe(
        "https://www.beatstats.com/label/drumcode/617"
      );
    });
  });

  describe("TEST 3: Fallback to search when beatportId is missing", () => {
    it("falls back to search URL when beatportId is null", () => {
      const urls = getLabelDiscoveryUrls({
        name: "Some Label",
        beatportId: null,
        slug: "some-label",
      });

      expect(urls.beatstats).toBe(
        "https://www.beatstats.com/search/search/index?searchresult=Some%20Label"
      );
    });

    it("falls back to search URL when beatportId is undefined", () => {
      const urls = getLabelDiscoveryUrls({
        name: "Another Label",
        slug: "another-label",
        // beatportId omitted entirely
      });

      expect(urls.beatstats).toBe(
        "https://www.beatstats.com/search/search/index?searchresult=Another%20Label"
      );
    });

    it("falls back to search URL when slug is missing but beatportId is present", () => {
      // Without the slug, we can't build /label/{slug}/{id} — both required.
      const urls = getLabelDiscoveryUrls({
        name: "Mystery Label",
        beatportId: 99999,
        // slug missing
      });

      expect(urls.beatstats).toBe(
        "https://www.beatstats.com/search/search/index?searchresult=Mystery%20Label"
      );
    });

    it("falls back to search URL when slug is empty string", () => {
      const urls = getLabelDiscoveryUrls({
        name: "Empty Slug Label",
        beatportId: 12345,
        slug: "",
      });

      expect(urls.beatstats).toBe(
        "https://www.beatstats.com/search/search/index?searchresult=Empty%20Slug%20Label"
      );
    });

    it("falls back to search URL when beatportId is empty string", () => {
      const urls = getLabelDiscoveryUrls({
        name: "Empty Id Label",
        beatportId: "",
        slug: "empty-id-label",
      });

      expect(urls.beatstats).toBe(
        "https://www.beatstats.com/search/search/index?searchresult=Empty%20Id%20Label"
      );
    });

    it("falls back to search URL when both beatportId and slug are missing", () => {
      // The original pre-fix behavior — pure name search.
      const urls = getLabelDiscoveryUrls({
        name: "Drumcode",
      });

      expect(urls.beatstats).toBe(
        "https://www.beatstats.com/search/search/index?searchresult=Drumcode"
      );
    });
  });

  describe("TEST 4: Manual beatstatsLink handling", () => {
    it("uses manual beatstatsLink when beatportId+slug are NOT available", () => {
      // User has manually curated a Beatstats URL for a label that has
      // no scraper-captured Beatport identity. Their override must be used.
      const manualUrl = "https://www.beatstats.com/label/some-manual-slug/42";
      const urls = getLabelDiscoveryUrls({
        name: "Manual Label",
        beatstatsLink: manualUrl,
      });

      expect(urls.beatstats).toBe(manualUrl);
    });

    it("prefers structured beatportId+slug over manual beatstatsLink", () => {
      // When both are present, the verified structured identity wins
      // (it's the most reliable path — no chance of a stale manual URL).
      const manualUrl = "https://www.beatstats.com/label/outdated-slug/999";
      const urls = getLabelDiscoveryUrls({
        name: "Berlin Records",
        beatportId: 129968,
        slug: "berlin-records",
        beatstatsLink: manualUrl,
      });

      expect(urls.beatstats).toBe(
        "https://www.beatstats.com/label/berlin-records/129968"
      );
      expect(urls.beatstats).not.toBe(manualUrl);
    });

    it("ignores empty/whitespace beatstatsLink and falls back to search", () => {
      const urls = getLabelDiscoveryUrls({
        name: "Whitespace Link Label",
        beatstatsLink: "   ",
      });

      expect(urls.beatstats).toBe(
        "https://www.beatstats.com/search/search/index?searchresult=Whitespace%20Link%20Label"
      );
    });

    it("does not break when beatstatsLink is provided alongside beatportId but slug is missing", () => {
      // beatportId present but slug missing → A doesn't apply.
      // Manual beatstatsLink present → B applies.
      const manualUrl = "https://www.beatstats.com/label/manual/123";
      const urls = getLabelDiscoveryUrls({
        name: "Partial Identity Label",
        beatportId: 12345,
        // slug missing
        beatstatsLink: manualUrl,
      });

      expect(urls.beatstats).toBe(manualUrl);
    });
  });

  describe("Non-Beatstats URLs are unchanged (regression)", () => {
    it("Beatport URL is unaffected by beatportId/slug", () => {
      const urls = getLabelDiscoveryUrls({
        name: "Berlin Records",
        beatportId: 129968,
        slug: "berlin-records",
      });

      // Beatport still uses search (no beatportLink provided) — unchanged.
      expect(urls.beatport).toBe(
        "https://www.beatport.com/search?q=Berlin%20Records&type=labels"
      );
      expect(urls.beatportIsDirect).toBe(false);
    });

    it("Beatport URL uses user-provided beatportLink when available", () => {
      const urls = getLabelDiscoveryUrls({
        name: "Berlin Records",
        beatportLink: "https://www.beatport.com/label/berlin-records/129968",
        beatportId: 129968,
        slug: "berlin-records",
      });

      expect(urls.beatport).toBe(
        "https://www.beatport.com/label/berlin-records/129968"
      );
      expect(urls.beatportIsDirect).toBe(true);
    });

    it("SoundCloud URL is unaffected", () => {
      const urls = getLabelDiscoveryUrls({
        name: "Berlin Records",
        beatportId: 129968,
        slug: "berlin-records",
      });

      expect(urls.soundcloud).toBe(
        "https://soundcloud.com/search?q=Berlin%20Records"
      );
    });

    it("SoundCloud uses user-provided link when available", () => {
      const scUrl = "https://soundcloud.com/berlinrecords";
      const urls = getLabelDiscoveryUrls({
        name: "Berlin Records",
        soundcloudLink: scUrl,
        beatportId: 129968,
        slug: "berlin-records",
      });

      expect(urls.soundcloud).toBe(scUrl);
    });

    it("Website is unaffected", () => {
      const webUrl = "https://berlinrecords.example";
      const urls = getLabelDiscoveryUrls({
        name: "Berlin Records",
        website: webUrl,
        beatportId: 129968,
        slug: "berlin-records",
      });

      expect(urls.website).toBe(webUrl);
    });
  });

  describe("hasDiscoveryUrls", () => {
    it("returns true when name is present", () => {
      expect(hasDiscoveryUrls({ name: "Berlin Records" })).toBe(true);
    });

    it("returns false when name is empty", () => {
      expect(hasDiscoveryUrls({ name: "" })).toBe(false);
    });

    it("returns false when name is whitespace only", () => {
      expect(hasDiscoveryUrls({ name: "   " })).toBe(false);
    });
  });
});
