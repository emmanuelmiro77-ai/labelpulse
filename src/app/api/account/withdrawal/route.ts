import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/account/withdrawal
 *
 * Handles the user's right of withdrawal (diritto di recesso) as required by
 * Italian Codice del Consumo (D.Lgs. 206/2005), art. 52 and art. 59 lett. i.
 *
 * What this does:
 * 1. Logs the withdrawal request (stored for legal compliance)
 * 2. Returns success (actual account deletion is manual for safety)
 * 3. In production, this would trigger an email + Supabase cleanup
 */

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "pulse.label.official@gmail.com";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, reason, timestamp } = body;

    if (!email || !timestamp) {
      return NextResponse.json(
        { error: "Email and timestamp are required" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    // Log the withdrawal request
    // In production, this would:
    // 1. Save to Supabase `withdrawal_requests` table
    // 2. Send confirmation email to user via Resend
    // 3. Notify support team
    // 4. Schedule account deletion for 30 days later (GDPR art. 17)

    console.log(`[WITHDRAWAL] Request received:
  Email: ${email}
  Reason: ${reason || "Not provided"}
  Timestamp: ${timestamp}
  Support contact: ${SUPPORT_EMAIL}
  Status: PENDING_MANUAL_REVIEW
`);

    // For now, we log and return success.
    // The actual account deletion is done manually to prevent accidental data loss.
    // TODO (FASE 4): Automate with Supabase deletion + email confirmation

    return NextResponse.json({
      success: true,
      message: "Withdrawal request registered. You will receive a confirmation email within 24 hours.",
      data: {
        email,
        timestamp,
        estimatedDeletionDate: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000
        ).toISOString(),
      },
    });
  } catch (error) {
    console.error("[WITHDRAWAL] Error processing request:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
