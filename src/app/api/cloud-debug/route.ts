import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

/**
 * GET /api/cloud-debug
 *
 * Diagnostic endpoint for cloud sync debugging.
 *
 * 🔒 H-8 FIX: Auth-protected — only authenticated users can access.
 * Unauthorized users get 401.
 */
export async function GET(request: Request) {
  // 🔒 H-8: Require authentication for debug endpoints in production
  const session = await getServerSession(authOptions as any);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
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
