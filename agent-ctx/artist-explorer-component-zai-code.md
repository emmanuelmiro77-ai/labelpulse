# Task: artist-explorer-component

**Agent**: Z.ai Code (fullstack-dev)
**Task ID**: artist-explorer-component
**Date**: 2025-06-21
**Status**: ✅ Complete

## Goal
Create `src/components/artist-explorer.tsx` — the new "Artisti" tab React
component for Phase 2 of the artist-tracking feature. Two views (list + detail)
controlled by `selectedArtistId` in the global store.

## What was built

A single-file, fully self-contained client component (default export
`ArtistExplorer`). 1229 lines, TypeScript-clean (0 errors against this file in
`tsc --noEmit`).

### Architecture
- **Types re-declared locally** (`Artist`, `ArtistTrack`) — the store is being
  extended in parallel; this keeps the file self-contained and type-safe today.
- **Store access via `as unknown as {…}`** for the three new fields
  (`artists`, `selectedArtistId`, `setSelectedArtistId`) so the file compiles
  *before* the parallel store work lands, and continues to work *after*.
- **Sub-components** for clarity: `ArtistAvatar`, `ArtistCard`, `TrackRow`,
  `ArtistDetail`, `ArtistList`, `StatBox`, `GenrePill`, `FilterChip`.

### List view
- Title "Artisti" (Italian default, English fallback) + subtitle showing
  `artists.length.toLocaleString() · trendingCount trending`.
- Search input with `Search` lucide icon, case-insensitive substring match on
  artist name, real-time filtering via `useMemo`.
- Horizontally-scrollable filter chip row: "Tutti" (reset), "Trending"
  (toggles `trendingOnly`), "Remixer" (toggles `remixerOnly`), plus one chip
  per deduped genre (single-select, can combine with Trending/Remixer).
- Sort dropdown (custom popover, no new deps) with 4 modes: points (default),
  best position, name A-Z, most tracks.
- Result count + grid: 1 col mobile / 2 cols desktop (`lg:grid-cols-2`).
- Each card: 64×64 avatar, name (truncated), trending flame, top-3 genre
  pills, remixer badge, stats line ("N tracce · N label · #N best pos").
- Empty state ("Nessun artista trovato") when filter yields nothing.
- Empty state ("Nessun artista caricato...") when `artists` array is empty.
- **Pagination**: 50 items initial, "Carica altri" button loads 50 more;
  `visibleCount` resets to 50 on any filter/sort change via `useEffect`.

### Detail view
- Back button (`ArrowLeft`) → `setSelectedArtistId(null)`.
- Hero card: 128×128 avatar, h2 name, all-genre pills, trending badge,
  4-stat summary card (points / best pos / total tracks / total labels),
  "Apri su Beatport" button (only when both `slug` and `beatportId` exist).
- **Section "Tracce in classifica"**: per-genre sub-section with count badge,
  desktop header row (# / Track / BPM / Key / Label / Date / play), track
  rows sorted by `position` asc. Position cell colored: emerald (1-10),
  amber (11-25), muted (26-100+). Camelot key badge colored: emerald for
  minor (A), amber for major (B). Play button toggles inline `<audio>` playback.
- **Section "Label su cui pubblica"**: grid of label cards (1/2/3 cols
  responsive). Each shows label name, track count on that label (computed
  from `tracksByGenre`), and if the label exists in `store.labels` with a
  `beatportLink`, a "Beatport" link. Clicking a card → `setActiveTab("labels")`.
- **Section "Generi attivi"**: passive genre pills.

### Audio playback
- Single shared `<audio ref={audioRef} />` element rendered once in detail view.
- `playingTrackId` state tracks which track is currently active.
- Clicking play on a new track swaps `audio.src` and plays; clicking the same
  track toggles pause. `ended`/`pause` listeners reset `playingTrackId` so the
  icon reverts to Play when finished.

### Image fallback
- `ArtistAvatar` uses `<img onError>` → falls back to colored circle with
  first letter of artist name. Color chosen from a 10-color restricted
  palette (warm/earth — **no blue/indigo** per project rules) via deterministic
  hash of the name. Empty `imageUrl` skips the `<img>` entirely.

### Performance (5000 artists)
- `useMemo` for: filtered+sorted list, all-genres set, trendingCount,
  genreEntries (sorted by track count), labelStats.
- Rendering capped by `visibleCount` (default 50, "+50" on load-more).
- All heavy work (filter/sort/dedup) is memoized against the relevant deps.

### Defensive coding
- `Array.isArray(artists)` guard.
- `tracksByGenre` treated as optional (`typeof tbg === "object"` check).
- `labelsPublishedOn` optional chaining.
- All `Artist` fields accessed with `|| []` / `?? ""` defaults where needed.
- Stale `selectedArtistId` (id set but artist missing) → deferred reset via
  `setTimeout` to avoid setState-during-render.
- All store-setter calls use optional chaining (`setSelectedArtistId?.(…)`).

### Style
- Dark theme matching existing components: `bg-background`, `text-foreground`,
  `text-muted-foreground`, `bg-card/60`, `border-border/40`,
  `bg-primary/15 text-primary`, `hover:border-primary/30`, etc.
- No blue/indigo colors. Trending = amber/orange, minor keys = emerald,
  major keys = amber, top-10 positions = emerald, 11-25 = amber.
- Mobile-first responsive throughout.
- No new dependencies. Only imports from `lucide-react`, `@/components/ui/button`,
  `@/lib/store`, `@/lib/i18n`, and `react`.

## Files touched
- **Created**: `/home/z/my-project/src/components/artist-explorer.tsx` (1229 lines)

## Verification
- `npx tsc --noEmit --skipLibCheck`: 0 errors against `artist-explorer.tsx`.
  (4 pre-existing errors in `src/lib/store.ts` are not related to this work.)
- Dev server (`bun run dev`) is running cleanly on port 3000; no compile
  errors in `dev.log`.
- File read back and verified intact (1229 lines, default export present).

## How to wire it up (NOT done — out of scope)
To activate the new tab, the project owner needs to:
1. Extend `src/lib/store.ts` with `artists: Artist[]`, `selectedArtistId`,
   `setSelectedArtistId`, and add `"artists"` to the `activeTab` union.
2. Add a nav button in `src/app/page.tsx` (e.g. `{ id: "artists", ... }`)
   and render `{activeTab === "artists" && <ArtistExplorer />}`.

The component is already importable as:
```ts
import ArtistExplorer from "@/components/artist-explorer";
```
