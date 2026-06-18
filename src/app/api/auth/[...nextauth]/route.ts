import NextAuth, { type AuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"

// ==================== CONFIG DIAGNOSTICS ====================
// NextAuth's production error "There is a problem with the server configuration"
// masks the real cause. We log clearly which required env vars are missing so
// the user can see the cause in the Vercel function logs.

const _hasGoogleId = !!process.env.GOOGLE_CLIENT_ID;
const _hasGoogleSecret = !!process.env.GOOGLE_CLIENT_SECRET;
const _hasNextauthSecret = !!process.env.NEXTAUTH_SECRET;
const _hasNextauthUrl = !!process.env.NEXTAUTH_URL;
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
  // Setting this explicitly avoids edge cases on Vercel preview deployments,
  // custom domains, and any non-standard hosting. Without it, you get the
  // "Server error - There is a problem with the server configuration" page.
  trustHost: true,

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
        token.accessToken = account.access_token
        token.refreshToken = account.refresh_token
      }
      return token
    },
    async session({ session, token }) {
      (session as any).accessToken = token.accessToken
      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  // Surface a friendly error page instead of the generic "Server error" when
  // the OAuth flow itself fails (e.g., user closes the consent screen).
  // We still keep the default for true server errors so they're logged, not
  // leaked to the client.
  events: {
    async error(message) {
      console.error("[NextAuth] event:error:", message);
    },
  },
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
