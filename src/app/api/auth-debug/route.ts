import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

/**
 * GET /api/auth-debug
 *
 * Diagnostic endpoint that shows EXACTLY which redirect_uri NextAuth will
 * send to Google when the user clicks "Login" from this device/browser.
 *
 * 🔒 H-8 FIX: Auth-protected — only authenticated users can access.
 * Unauthorized users get 401.
 */
export async function GET(request: Request) {
  // 🔒 H-8: Require authentication for debug endpoints in production
  const session = await getServerSession(authOptions as any);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const url = new URL(request.url);

  // NextAuth v4 with `trustHost: true` derives the callback URL from these
  // headers in order of precedence. We mirror that logic here.
  const host =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    url.host;
  const proto =
    request.headers.get("x-forwarded-proto") ||
    (url.protocol === "https:" ? "https" : "http");

  const computedCallbackUrl = `${proto}://${host}/api/auth/callback/google`;

  const authorizedList = [
    "https://labelpulse.vercel.app/api/auth/callback/google",
    "https://my-project-ivory-nine.vercel.app/api/auth/callback/google",
    "https://d1wv240wp180-d.space-z.ai/api/auth/callback/google",
    "http://localhost:3000/api/auth/callback/google",
  ];

  return NextResponse.json(
    {
      timestamp: new Date().toISOString(),
      computedCallbackUrl,
      detectedHost: host,
      detectedProtocol: proto,
      requestUrl: request.url,
      headers: {
        host: request.headers.get("host"),
        origin: request.headers.get("origin"),
        referer: request.headers.get("referer"),
        "x-forwarded-host": request.headers.get("x-forwarded-host"),
        "x-forwarded-proto": request.headers.get("x-forwarded-proto"),
        "user-agent": request.headers.get("user-agent"),
      },
      authorizedUrisYouShouldCheck: authorizedList,
      diagnosis: authorizedList.includes(computedCallbackUrl)
        ? `✅ Il redirect_uri rilevato (${computedCallbackUrl}) È nella lista autorizzata. Il problema è altrove.`
        : `❌ Il redirect_uri rilevato (${computedCallbackUrl}) NON è nella lista autorizzata su Google Cloud Console. Aggiungilo.`,
      nextSteps: [
        "1. Se computedCallbackUrl non è nella lista autorizzata → aggiungilo su Google Cloud Console → APIs & Services → Credentials → OAuth Client → Authorized redirect URIs",
        "2. Se l'icona della app sul telefono apre un URL vecchio (es. space-z.ai) → elimina l'icona e re-installa la PWA da https://labelpulse.vercel.app",
        "3. Svuota la cache del browser/PWA se hai già fatto i punti 1 e 2",
      ],
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
