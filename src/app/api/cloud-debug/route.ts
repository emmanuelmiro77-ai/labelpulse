import { NextResponse } from "next/server";

/**
 * GET /api/cloud-debug
 *
 * Diagnostic endpoint that surfaces which Supabase credentials are present
 * in the request's cookies (via the BYOK profile stored in localStorage
 * and synced via cookies). Returns whether cloud sync is reachable.
 *
 * IMPORTANT: This is a SERVER route. The user's BYOK Supabase credentials
 * live in browser localStorage (NOT in cookies), so this endpoint can't
 * see them directly. What it CAN do is:
 *   - Confirm whether the route is reachable from the user's device
 *   - Show the request headers (host, user-agent) so we can verify the
 *     device/network is correct
 *   - Echo back the env vars (NEXT_PUBLIC_SUPABASE_URL etc.) that may be
 *     set on Vercel for legacy fallback
 *
 * For client-side cloud state diagnosis, the user should:
 *   - Open browser DevTools console on the app
 *   - Run: `useAppStore.getState()` to see the live state
 *   - Run: `loadStateFromCloud()` to see what's in cloud
 *
 * Safe to leave deployed — only echoes non-secret request metadata.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);

  const envSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
  const envSupabaseKeySet = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return NextResponse.json(
    {
      timestamp: new Date().toISOString(),
      deployedOn: process.env.VERCEL ? "vercel" : "non-vercel",
      vercelEnv: process.env.VERCEL_ENV ?? null,
      deploymentUrl: process.env.VERCEL_URL ?? null,
      request: {
        url: request.url,
        host: request.headers.get("host"),
        origin: request.headers.get("origin"),
        referer: request.headers.get("referer"),
        "user-agent": request.headers.get("user-agent"),
      },
      envFallback: {
        NEXT_PUBLIC_SUPABASE_URL: envSupabaseUrl ? `${envSupabaseUrl.substring(0, 30)}...` : null,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: envSupabaseKeySet ? "(set)" : null,
      },
      diagnosis:
        "This endpoint confirms the route is reachable. To diagnose cloud sync state from your device:\n" +
        "1. Open the app in Chrome desktop (or enable remote DevTools on phone)\n" +
        "2. Open DevTools → Console\n" +
        "3. Run: localStorage.getItem('labelpulse-snapshots-backup') → check if sidecar has your snapshots\n" +
        "4. Run: localStorage.getItem('labelpulse-profile-backup') → check if sidecar has your profile\n" +
        "5. If sidecars have data but main store is empty, the merge fix in this deploy will recover them on next reload",
      sidecarKeys: {
        snapshots: "labelpulse-snapshots-backup",
        profile: "labelpulse-profile-backup",
        primaryStore: "(check Zustand persist key, usually 'labelpulse-storage' or similar)",
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
