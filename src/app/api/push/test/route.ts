import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { sendPushToUser } from "@/lib/push";

/**
 * POST /api/push/test
 *
 * Sends a test push notification to the requesting user (so they can
 * verify the setup works end-to-end after enabling notifications in
 * the Profile page).
 *
 * Body:
 *   { email: string }
 */
export async function POST(req: NextRequest) {
  try {
    // 🔒 CRITICAL FIX (C-3): Auth check — only authenticated users can test push
    const session = await getServerSession(authOptions as any);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { email } = body || {};

    // Verify the email in the body matches the authenticated session
    if (!email || email.toLowerCase().trim() !== session.user.email.toLowerCase().trim()) {
      return NextResponse.json({ error: "Email mismatch with authenticated session" }, { status: 403 });
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "invalid_email" }, { status: 400 });
    }

    const result = await sendPushToUser(email, "rankings", {
      title: "LabelPulse 🔔",
      body: "Notifiche push attivate! Se vedi questo messaggio, tutto funziona.",
      url: "/",
      tag: "test-push",
    });

    if (result.sent === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "no_subscriptions",
          hint: "Abilita le notifiche dal pulsante sopra prima di inviare il test.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, sent: result.sent });
  } catch (err: any) {
    console.error("[/api/push/test]", err);
    return NextResponse.json(
      { error: err?.message || "internal_error" },
      { status: 500 }
    );
  }
}
