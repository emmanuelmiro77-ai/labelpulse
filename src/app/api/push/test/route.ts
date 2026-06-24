import { NextRequest, NextResponse } from "next/server";
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
    const body = await req.json();
    const { email } = body || {};

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
