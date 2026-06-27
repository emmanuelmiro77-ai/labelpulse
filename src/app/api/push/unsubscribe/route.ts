import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { removeSubscription } from "@/lib/push";

/**
 * POST /api/push/unsubscribe
 *
 * Removes a push subscription (called when user disables notifications,
 * or when the browser reports the subscription is no longer valid).
 *
 * Body:
 *   { endpoint: string }
 */
export async function POST(req: NextRequest) {
  try {
    // 🔒 CRITICAL FIX (C-3): Auth check — only authenticated users can unsubscribe
    const session = await getServerSession(authOptions as any);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { endpoint } = body || {};
    if (!endpoint || typeof endpoint !== "string") {
      return NextResponse.json({ error: "invalid_endpoint" }, { status: 400 });
    }
    await removeSubscription(endpoint);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[/api/push/unsubscribe]", err);
    return NextResponse.json(
      { error: err?.message || "internal_error" },
      { status: 500 }
    );
  }
}
