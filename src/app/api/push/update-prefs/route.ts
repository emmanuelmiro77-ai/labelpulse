import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
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
    // 🔒 CRITICAL FIX (C-3): Auth check — only authenticated users can update prefs
    const session = await getServerSession(authOptions as any);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { email, prefs } = body || {};

    // Verify the email in the body matches the authenticated session
    if (!email || email.toLowerCase().trim() !== session.user.email.toLowerCase().trim()) {
      return NextResponse.json({ error: "Email mismatch with authenticated session" }, { status: 403 });
    }

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
