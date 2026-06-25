import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

/**
 * POST /api/email/send
 *
 * Invia un'email usando Resend (o un altro provider configurato in futuro).
 * È l'alternativa "in-app" all'invio via Gmail API — utile per utenti che
 * non hanno (o non vogliono) connettere il proprio Gmail.
 *
 * Body JSON:
 *   {
 *     to: string[],          // array di indirizzi email
 *     subject: string,
 *     body: string,          // plain text body
 *     cc?: string[],         // opzionale
 *     replyTo?: string,      // opzionale, default = EMAIL_FROM
 *   }
 *
 * Auth: richiede sessione NextAuth valida (come /api/gmail/send).
 *
 * Env vars richieste (in .env.local o Vercel):
 *   - RESEND_API_KEY    — API key di Resend (https://resend.com/api-keys)
 *   - EMAIL_FROM        — indirizzo mittente, DEVE essere su un dominio
 *                         verificato in Resend (es. noreply@labelpulse.app)
 *
 * Se RESEND_API_KEY non è configurata → 503 Service Unavailable con messaggio
 * chiaro per l'utente (l'app funziona comunque con Gmail API come fallback).
 */
export async function POST(req: NextRequest) {
  try {
    // 1) Auth check — same pattern as /api/gmail/send
    const session = await getServerSession({ ...authOptions } as any);
    if (!(session as any)?.user?.email) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // 2) Config check — fail fast with a clear message if Resend isn't set up
    const resendApiKey = process.env.RESEND_API_KEY;
    const emailFrom = process.env.EMAIL_FROM || "LabelPulse <noreply@labelpulse.app>";

    if (!resendApiKey) {
      return NextResponse.json(
        {
          error: "Email service not configured",
          details:
            "RESEND_API_KEY is not set. The in-app email sender requires a Resend API key. " +
            "Either set RESEND_API_KEY in your environment, or use the Gmail connection flow instead.",
        },
        { status: 503 }
      );
    }

    // 3) Parse + validate body
    const body = await req.json();
    const { to, subject, body: emailBody, cc, replyTo } = body as {
      to: string[] | string;
      subject: string;
      body: string;
      cc?: string[] | string;
      replyTo?: string;
    };

    if (!to || !subject || !emailBody) {
      return NextResponse.json(
        { error: "Missing required fields: to, subject, body" },
        { status: 400 }
      );
    }

    const toArray = Array.isArray(to) ? to : [to];
    const ccArray = cc ? (Array.isArray(cc) ? cc : [cc]) : [];

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = [...toArray, ...ccArray].filter((e) => !emailRegex.test(e));
    if (invalidEmails.length > 0) {
      return NextResponse.json(
        {
          error: "Invalid email address",
          details: `These addresses failed validation: ${invalidEmails.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // 4) Build Resend API payload
    // Resend docs: https://resend.com/api-reference/emails/send-email
    const payload: any = {
      from: emailFrom,
      to: toArray,
      subject,
      text: emailBody,
      reply_to: replyTo || emailFrom,
    };
    if (ccArray.length > 0) {
      payload.cc = ccArray;
    }

    // 5) Call Resend
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[/api/email/send] Resend API error:", response.status, errorText);
      let errorMsg = `Resend API returned HTTP ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson?.message) errorMsg = errorJson.message;
        else if (errorJson?.error) errorMsg = String(errorJson.error);
      } catch {
        // non-JSON error response — keep the HTTP status message
      }
      return NextResponse.json(
        { error: "Failed to send email via Resend", details: errorMsg },
        { status: 502 }
      );
    }

    const data = await response.json();
    return NextResponse.json({
      success: true,
      messageId: data.id,
      provider: "resend",
      from: emailFrom,
    });
  } catch (error: any) {
    console.error("[/api/email/send] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error?.message || "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/email/send
 *
 * Health check — ritorna lo stato di configurazione del servizio email
 * in-app, senza inviare nulla. Utile per la UI che vuole mostrare/nascondere
 * il bottone "Invia dall'app" in base alla disponibilità.
 */
export async function GET() {
  const isConfigured = !!process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || null;
  return NextResponse.json({
    configured: isConfigured,
    provider: isConfigured ? "resend" : null,
    from,
  });
}
