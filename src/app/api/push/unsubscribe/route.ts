import { NextRequest, NextResponse } from "next/server";
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
