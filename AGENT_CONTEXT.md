# LabelPulse - AI Agent Context File

> **PURPOSE**: This file allows any AI agent to resume work on this project in a new chat session.
> When starting a new chat, tell the agent: *"Read AGENT_CONTEXT.md in my repo and continue from there"*

## Project Overview

**LabelPulse** is a PWA (Progressive Web App) for DJs and music producers to manage demo submissions to electronic music labels. It tracks labels, their Beatport rankings, demo submissions, and generates pitch emails.

- **Live URL**: https://labelpulse.vercel.app
- **Tech Stack**: Next.js 16.1.1, React, TypeScript, Zustand 5.0.6, Tailwind CSS 4, shadcn/ui
- **Deployment**: Vercel (auto-deploy via GitHub push to `main` branch)
- **Repo**: https://github.com/emmanuelmiro77-ai/labelpulse
- **Data Storage**: Client-side only (localStorage + Zustand persist) — NO server-side database
- **Languages**: 6 locales (IT, EN, ES, DE, FR, PT) — primary UI language is Italian

## Architecture

### State Management
- **`src/lib/store.ts`** — CRITICAL FILE. Zustand store with `persist` middleware.
  - Uses custom `robustStorage` with primary + backup localStorage keys
  - Currently at persist version **8** with migration chain (v5→v6→v7→v8)
  - `partialize` controls which fields are persisted
  - `merge` function combines persisted state with current state on rehydration
  - **KNOWN BUG (being fixed)**: Race condition during Zustand rehydration can cause seed data to overwrite user data
  - `buildLabelsFromData()` creates seed labels from `labels-data.json` with empty user fields

### Key Components
- **`src/app/page.tsx`** — Main page, tab navigation, hydration guard (needs fixing)
- **`src/components/label-finder.tsx`** — Label search/filter/detail (1200+ lines), inline editing
- **`src/components/dashboard.tsx`** — Stats overview
- **`src/components/demo-tracker.tsx`** — Demo submission tracking
- **`src/components/pitch-generator.tsx`** — AI pitch email generation
- **`src/components/data-backup.tsx`** — Export/Import with RankingsWizard
- **`src/components/rankings-wizard.tsx`** — 4-step guide for Beatport chart data import
- **`src/components/gmail-settings.tsx`** — Gmail OAuth integration (GIS popup flow)
- **`src/components/auto-save.tsx`** — File System Access API auto-save to local file
- **`src/components/sw-updater.tsx`** — Service worker update notifications

### Data Files
- **`src/lib/labels-data.json`** — Seed data: ~400 labels with Beatport rankings across 35 genres
- **`src/lib/i18n.ts`** — All 6 locale translations (~200+ keys per locale)
- **`src/lib/gmail.ts`** — Gmail API helpers (send email, token refresh)
- **`src/lib/pitch-utils.ts`** — Pitch generation utilities

### Label Data Structure (key fields)
```typescript
interface Label {
  id: string; name: string; genre: string;
  // USER-EDITABLE (these must NEVER be lost):
  emails: string[]; notes: string; website: string;
  demoLink: string; socialLink: string; soundcloudLink: string;
  contactInfo: string; status: "open"|"closed";
  // BEATPORT DATA (from rankings import):
  genres: string[]; rankByGenre: Record<string,number>;
  pointsByGenre: Record<string,number>; trending: boolean;
  trendingRankByGenre: Record<string,number>; trendingPointsByGenre: Record<string,number>;
  isCustom?: boolean; // true for user-added labels
}
```

## Key Flows

### Beatport Rankings Update
1. User opens Rankings Wizard (in Data Backup panel)
2. Step 1: Copy console scraper script
3. Step 2: Open Beatport in new tab, paste script in DevTools console
4. Step 3: Wait ~2 min for JSON download (34 genres)
5. Step 4: Import JSON file — smart merge preserves user edits while updating rankings
- Script: `scripts/beatport-console-scraper.js` (minified version embedded in wizard)
- Stale detection: amber warning if rankings older than 30 days

### Gmail Integration
- Uses Google Identity Services (GIS) popup flow
- Client ID configured in `src/lib/gmail.ts`
- **IMPORTANT**: Client Secret was exposed in a previous session — should be regenerated on Google Cloud Console
- OAuth scope: `https://mail.google.com/` (full Gmail access for sending)

### Data Backup & Restore
- Export: Full JSON with labels, demos, profile, locale
- Import: Smart merge — matches by ID or name, preserves user-editable fields
- Auto-save: Optional File System Access API save to local file on visibility change

## Current Issues & Fixes (as of 2026-06-12)

### CRITICAL FIX IN PROGRESS: Data Persistence Bug
**Symptom**: User-entered data (emails, notes, links) disappears after page reload or app update.

**Root Cause**: Race condition in Zustand persist rehydration:
1. Page loads → store initializes with seed data (empty user fields)
2. App renders before rehydration completes (fake `useState` hydration check)
3. Any state change triggers persist middleware → writes seed data to localStorage
4. Both primary AND backup are simultaneously corrupted
5. Rehydration then reads the corrupted data → user edits gone

**Fix Applied** (persist version 9):
1. Block `setItem` writes until after rehydration completes (`_rehydrated` flag)
2. Real `isRehydrated()` check in page.tsx (polls until Zustand finishes)
3. Backup debounced (60s) — NOT mirrored on every write
4. Simple merge: just add defaults + append new seed labels (NEVER modify persisted user data)
5. Auto-repair: if same email on 5+ labels, removes from all but the owner
6. Data-loss detection threshold: 0 (was 50)

**Previous complex merge function (mergeLabelsWithSeed) REMOVED** — it was causing
email duplication across all labels by incorrectly merging seed data with persisted data.

## Deployment

```bash
# Standard workflow:
cd /home/z/my-project
git add -A
git commit -m "description of changes"
git push origin main
# Vercel auto-deploys from main branch

# Force push (if needed):
git push --force-with-lease origin main
```

## Version History
- **v1**: Initial app with labels, demos, pitch
- **v2.0**: Added Gmail integration, PWA support, auto-save
- **v2.1**: Rankings import, smart merge, robust storage (persist v8)
- **v2.1.1** (in progress): Fix critical data persistence bug (persist v9)

## Important Notes
- User's primary language is Italian — always respond in Italian
- App has no backend/database — all data is in localStorage
- Domain switch from Space-Z to Vercel lost all old localStorage data (domain-specific)
- The `buildLabelsFromData()` function must ONLY be used as initial seed, never to overwrite persisted data
- When adding new fields to Label interface, ALWAYS add them to: partialize, merge defaults, migration, and mergePreservingUserData
