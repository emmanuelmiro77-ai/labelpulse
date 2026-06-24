import { NextRequest, NextResponse } from "next/server";
import { updatePrefsForUser, type NotificationPrefs } from "@/lib/push";

/**
 * POST /api/push/update-prefs
 *
 * Updates the per-user notification preferences on ALL their stored
 * subscriptions (every device). Called when the user toggles one of the
 * 3 switches in the Profile page.
 *
 * Body:
 *   {
 *     email: string,
 *     prefs: { followUp: boolean, rankings: boolean, weeklyRecap: boolean }
 *   }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, prefs } = body || {};

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "invalid_email" }, { status: 400 });
    }
    if (!prefs || typeof prefs !== "object") {
      return NextResponse.json({ error: "invalid_prefs" }, { status: 400 });
    }

    const validPrefs: NotificationPrefs = {
      followUp: !!prefs.followUp,
      rankings: !!prefs.rankings,
      weeklyRecap: !!prefs.weeklyRecap,
    };

    await updatePrefsForUser(email, validPrefs);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[/api/push/update-prefs]", err);
    return NextResponse.json(
      { error: err?.message || "internal_error" },
      { status: 500 }
    );
  }
}
