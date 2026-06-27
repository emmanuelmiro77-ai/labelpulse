import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { saveSubscription } from "@/lib/push";

/**
 * POST /api/push/subscribe
 *
 * Saves (or refreshes) a push subscription for the given user.
 * Called by the client after `serviceWorkerRegistration.pushManager.subscribe()`
 * resolves with a PushSubscription.
 *
 * Body:
 *   {
 *     email: string,
 *     subscription: { endpoint: string, keys: { p256dh: string, auth: string } },
 *     prefs: { followUp: boolean, rankings: boolean, weeklyRecap: boolean }
 *   }
 */
export async function POST(req: NextRequest) {
  try {
    // 🔒 CRITICAL FIX (C-3): Auth check — only authenticated users can subscribe
    const session = await getServerSession(authOptions as any);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { email, subscription, prefs } = body || {};

    // Verify the email in the body matches the authenticated session
    if (!email || email.toLowerCase().trim() !== session.user.email.toLowerCase().trim()) {
      return NextResponse.json({ error: "Email mismatch with authenticated session" }, { status: 403 });
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "invalid_email" }, { status: 400 });
    }
    if (
      !subscription ||
      !subscription.endpoint ||
      !subscription.keys?.p256dh ||
      !subscription.keys?.auth
    ) {
      return NextResponse.json(
        { error: "invalid_subscription" },
        { status: 400 }
      );
    }
    if (!prefs || typeof prefs !== "object") {
      return NextResponse.json({ error: "invalid_prefs" }, { status: 400 });
    }

    await saveSubscription(email, subscription, {
      followUp: !!prefs.followUp,
      rankings: !!prefs.rankings,
      weeklyRecap: !!prefs.weeklyRecap,
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[/api/push/subscribe]", err);
    return NextResponse.json(
      { error: err?.message || "internal_error" },
      { status: 500 }
    );
  }
}
