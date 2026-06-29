import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

/**
 * 🔒 FASE C — Supabase admin client helper
 *
 * Returns a Supabase client authenticated as the current NextAuth user,
 * using the SERVICE_ROLE key (bypasses RLS).
 *
 * The caller MUST verify the returned email matches what they expect
 * before using it in queries — this is the auth layer.
 *
 * Returns null if:
 * - User is not authenticated (no NextAuth session)
 * - Service role key is not configured
 *
 * Usage:
 *   const { supabase, email } = await getAdminClient();
 *   if (!supabase) return 401;
 *   const { data } = await supabase.from("demo_submissions")
 *     .select("*").eq("user_email", email);
 */

export async function getAdminClient(): Promise<{
  supabase: SupabaseClient | null;
  email: string | null;
}> {
  // 1. Verify NextAuth session
  const session = await getServerSession(authOptions as any);
  if (!session?.user?.email) {
    return { supabase: null, email: null };
  }
  const email = session.user.email.toLowerCase().trim();

  // 2. Get Supabase config
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("[getAdminClient] Missing SUPABASE_SERVICE_ROLE_KEY");
    return { supabase: null, email: null };
  }

  // 3. Create client with service_role (bypasses RLS)
  const supabase = createClient(supabaseUrl, supabaseKey);
  return { supabase, email };
}
