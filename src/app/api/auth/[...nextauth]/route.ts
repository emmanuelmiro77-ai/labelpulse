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

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
