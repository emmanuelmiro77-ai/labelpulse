import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth-options";

// Note: this route handler is DYNAMIC on Vercel (handles /api/auth/signin,
// /api/auth/callback/*, /api/auth/session, etc.).
//
// For the local static-export build (server.mjs deployment), scripts/build-static.sh
// temporarily moves src/app/api/ out of the way before running `next build`,
// so this file is not included in the static bundle. Do NOT add
// `export const dynamic = "force-static"` here — that would break the
// Vercel deployment by making this route return a static 404 instead of
// running the NextAuth handler.

// 🔒 TEMPORARY DEBUG LOG — rimuovere dopo diagnosi redirect_uri
function logAuthDebug(req: any) {
  try {
    const url = new URL(req.url || req.nextUrl?.toString() || "http://unknown");
    const host = req.headers?.get?.("host") || req.headers?.host || "N/A";
    const xfHost = req.headers?.get?.("x-forwarded-host") || "N/A";
    const xfProto = req.headers?.get?.("x-forwarded-proto") || "N/A";
    const nextauthUrl = process.env.NEXTAUTH_URL || "N/A";
    const vercelUrl = process.env.VERCEL_URL || "N/A";
    const computedHost = xfHost !== "N/A" ? xfHost : host;
    const computedProto = xfProto !== "N/A" ? xfProto : "https";
    const computedCallback = `${computedProto}://${computedHost}/api/auth/callback/google`;
    console.log("[AUTH DEBUG] ===== REDIRECT URI DIAGNOSTICS =====");
    console.log("[AUTH DEBUG] req.url:", req.url || "N/A");
    console.log("[AUTH DEBUG] host header:", host);
    console.log("[AUTH DEBUG] x-forwarded-host:", xfHost);
    console.log("[AUTH DEBUG] x-forwarded-proto:", xfProto);
    console.log("[AUTH DEBUG] NEXTAUTH_URL:", nextauthUrl);
    console.log("[AUTH DEBUG] VERCEL_URL:", vercelUrl);
    console.log("[AUTH DEBUG] computed callback URL:", computedCallback);
    console.log("[AUTH DEBUG] pathname:", url.pathname);
    console.log("[AUTH DEBUG] =======================================");
  } catch (e) {
    console.log("[AUTH DEBUG] Error in debug log:", e);
  }
}

const originalHandler = NextAuth(authOptions);

const handler = (req: any, res: any) => {
  logAuthDebug(req);
  return originalHandler(req, res);
};

export { handler as GET, handler as POST };
