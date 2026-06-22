import { NextResponse } from "next/server";

/**
 * GET /api/auth-debug
 *
 * Diagnostic endpoint that shows EXACTLY which redirect_uri NextAuth will
 * send to Google when the user clicks "Login" from this device/browser.
 *
 * Why this exists: if the user opens the app from an old PWA icon cached on
 * a different domain (e.g. space-z.ai, or an old vercel preview URL),
 * NextAuth with `trustHost: true` builds the redirect_uri from the Host
 * header of the incoming request — which can be a URL that is NOT in the
 * Google Cloud Console's "Authorized redirect URIs" list. Result:
 * `400: redirect_uri_mismatch` from Google.
 *
 * Usage from the phone:
 *   1. Open the PWA icon → navigate inside the app → visit
 *      https://<current-host>/api/auth-debug
 *   2. Also try opening https://labelpulse.vercel.app/api/auth-debug
 *      directly from Chrome/Safari (NOT the PWA icon).
 *   3. Compare the `computedCallbackUrl` field in the two responses.
 *      The one that is NOT in the Google Console authorized list is
 *      the culprit.
 *
 * Safe to leave deployed — only echoes non-secret request metadata.
 */
export async function GET(request: Request) {
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
