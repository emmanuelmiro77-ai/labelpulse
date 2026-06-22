import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth-options";

// Required for static export — NextAuth's catch-all [...nextauth] route
// can't be statically pre-rendered, so we mark it force-static and provide
// an empty generateStaticParams so Next.js doesn't try to enumerate paths.
// On Vercel (NEXT_EXPORT not set), this route is dynamic and works normally.
export const dynamic = "force-static";
export function generateStaticParams() {
  return [];
}

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
