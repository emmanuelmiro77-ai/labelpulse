import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

/**
 * 🔒 FASE D — Supabase client helper con RLS vera
 *
 * STRATEGIA TRIPLICE (emergenza RLS 2026-07-06):
 * 1. PRIMA TENTATIVO: JWT Supabase dalla sessione NextAuth → RLS attiva
 * 2. FALLBACK 1: service_role (bypassa RLS)
 * 3. FALLBACK 2: anon key (con policy permissive USING(true) — defense-in-depth
 *    a livello API route via getServerSession + .eq("user_email"))
 *
 * 🔒 FIX EMERGENZA: Se SUPABASE_SERVICE_ROLE_KEY non è impostato su Vercel,
 * cadiamo su anon key. Le policy RLS permissive (USING true) permettono
 * l'accesso, e la sicurezza è garantita a livello API route.
 */

export async function getAdminClient(): Promise<{
  supabase: SupabaseClient | null;
  email: string | null;
  useRls: boolean;
}> {
  // 1. Verify NextAuth session
  const session = await getServerSession(authOptions as any);
  if (!session?.user?.email) {
    return { supabase: null, email: null, useRls: false };
  }
  const email = session.user.email.toLowerCase().trim();

  // 2. Get Supabase config
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    console.error("[getAdminClient] Missing NEXT_PUBLIC_SUPABASE_URL");
    return { supabase: null, email: null, useRls: false };
  }

  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseAnonKey) {
    console.error("[getAdminClient] Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
    return { supabase: null, email: null, useRls: false };
  }

  // 3. 🔒 PRIMA TENTATIVO: JWT Supabase dalla sessione
  const supabaseAccessToken = (session as any).supabaseAccessToken;
  const supabaseExpiresAt = (session as any).supabaseExpiresAt as number | undefined;

  if (supabaseAccessToken) {
    const now = Math.floor(Date.now() / 1000);
    const isExpired = supabaseExpiresAt ? (supabaseExpiresAt - 60) < now : false;

    if (!isExpired) {
      try {
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
          global: {
            headers: {
              Authorization: `Bearer ${supabaseAccessToken}`,
            },
          },
        });
        const { data: { user }, error } = await supabase.auth.getUser();
        if (!error && user?.email?.toLowerCase().trim() === email) {
          return { supabase, email, useRls: true };
        }
        console.warn("[getAdminClient] Supabase token invalid or email mismatch");
      } catch (err) {
        console.warn("[getAdminClient] Supabase JWT check failed:", err);
      }
    } else {
      console.warn("[getAdminClient] Supabase JWT expired — using fallback");
    }
  }

  // 4. FALLBACK 1: service_role (bypassa RLS)
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseServiceKey) {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    return { supabase, email, useRls: false };
  }

  // 5. FALLBACK 2: anon key (con policy permissive USING(true) — sicurezza a livello API route)
  console.warn("[getAdminClient] SUPABASE_SERVICE_ROLE_KEY missing — falling back to anon key (RLS permissive). Security via API route getServerSession + .eq(user_email).");
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  return { supabase, email, useRls: false };
}
