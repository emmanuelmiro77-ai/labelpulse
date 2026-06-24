import { NextRequest, NextResponse } from "next/server";
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
    const body = await req.json();
    const { email, subscription, prefs } = body || {};

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
