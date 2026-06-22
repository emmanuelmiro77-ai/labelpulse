/**
 * NextAuth configuration — extracted to a lib file so it can be imported
 * by both the catch-all route handler (/api/auth/[...nextauth]) and
 * other API routes (e.g. /api/gmail/send) WITHOUT creating a circular
 * dependency that breaks Next.js static export builds.
 *
 * The route handler file is the only place Next.js looks for `generateStaticParams`
 * and `export const dynamic`. By keeping this config separate, the route
 * handler stays a thin wrapper that the bundler can statically analyze.
 */

import { type AuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

// ==================== CONFIG DIAGNOSTICS ====================
// NextAuth's production error "There is a problem with the server configuration"
// masks the real cause. We log clearly which required env vars are missing so
// the user can see the cause in the Vercel function logs.

const _hasGoogleId = !!process.env.GOOGLE_CLIENT_ID;
const _hasGoogleSecret = !!process.env.GOOGLE_CLIENT_SECRET;
const _hasNextauthSecret = !!process.env.NEXTAUTH_SECRET;
const _isVercel = !!process.env.VERCEL;

if (!_hasGoogleId || !_hasGoogleSecret || !_hasNextauthSecret) {
  const missing: string[] = [];
  if (!_hasGoogleId) missing.push("GOOGLE_CLIENT_ID");
  if (!_hasGoogleSecret) missing.push("GOOGLE_CLIENT_SECRET");
  if (!_hasNextauthSecret) missing.push("NEXTAUTH_SECRET");
  console.error(
    `[NextAuth] ⚠️  Configurazione incompleta. Variabili mancanti su ${_isVercel ? "Vercel" : "locale"}: ${missing.join(", ")}. ` +
    `Queste DEVONO essere impostate nelle Environment Variables del progetto Vercel (Project Settings → Environment Variables). ` +
    `Per vedere lo stato live, visita /api/auth-config-check`
  );
}

export const authOptions: AuthOptions = {
  // ⚠️ CRITICAL for Vercel deployments.
  // NextAuth v4 refuses to trust the Host header unless:
  //   - NEXTAUTH_URL is explicitly set, OR
  //   - The VERCEL env var is present (auto-detected on Vercel infra), OR
  //   - trustHost: true is set here.
  trustHost: true,

  // ⚠️ Disable __Secure- cookie prefix.
  // On iOS Safari (especially in PWA standalone mode = "Added to Home Screen")
  // and on some Android WebView configurations, cookies with the __Secure-
  // prefix are dropped or behave inconsistently during the OAuth redirect
  // chain. This causes the PKCE/state cookie to be missing when the user
  // returns from Google.
  cookies: {
    pkceCodeVerifier: {
      name: `next-auth.pkce.code_verifier`,
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: true, maxAge: 900 },
    },
    state: {
      name: `next-auth.state`,
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: true, maxAge: 900 },
    },
    nonce: {
      name: `next-auth.nonce`,
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: true },
    },
    callbackUrl: {
      name: `next-auth.callback-url`,
      options: { sameSite: "lax", path: "/", secure: true },
    },
    csrfToken: {
      name: `next-auth.csrf-token`,
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: true },
    },
    sessionToken: {
      name: `next-auth.session-token`,
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: true },
    },
  },

  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/gmail.send",
          prompt: "consent",
          access_type: "offline",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
      }
      return token;
    },
    async session({ session, token }) {
      (session as any).accessToken = token.accessToken;
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  events: {
    async error(message) {
      console.error("[NextAuth] event:error:", JSON.stringify(message, null, 2));
    },
  },
  pages: { error: "/auth/error" },
  debug: true,
  logger: {
    error(code, metadata) {
      console.error(`[NextAuth][error] ${code}:`, JSON.stringify(metadata, null, 2));
    },
    warn(code) { console.warn(`[NextAuth][warn] ${code}`); },
    debug(code, metadata) {
      console.log(`[NextAuth][debug] ${code}`, metadata ? JSON.stringify(metadata, null, 2) : "");
    },
  },
};
