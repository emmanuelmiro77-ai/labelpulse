import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

/**
 * 🔒 FASE D — Supabase client helper con RLS vera
 *
 * STRATEGIA DOPPIA (transizione sicura):
 * 1. PRIMA TENTATIVA: usa il JWT Supabase dalla sessione NextAuth
 *    → RLS attiva a livello database → sicurezza massima
 *    → anche se c'è un bug nella query, il database blocca cross-user
 *
 * 2. FALLBACK: se il JWT Supabase non è disponibile (es. utente loggato
 *    prima della FASE D, o bridge non ancora configurato), usa service_role
 *    con .eq("user_email", email) → sicurezza a livello API route
 *
 * Una volta che tutti gli utenti hanno fatto re-login dopo la FASE D,
 * rimuoveremo il fallback service_role.
 *
 * Usage:
 *   const { supabase, email, useRls } = await getAdminClient();
 *   if (!supabase) return 401;
 *   // useRls = true → RLS attiva, non serve .eq("user_email", email)
 *   // useRls = false → fallback, DEVI usare .eq("user_email", email)
 *   const { data } = await supabase.from("demo_submissions").select("*");
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

  // 3. 🔒 FASE D: PRIMA TENTATIVO — usa il JWT Supabase dalla sessione
  const supabaseAccessToken = (session as any).supabaseAccessToken;
  if (supabaseAccessToken) {
    try {
      const supabase = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        global: {
          headers: {
            Authorization: `Bearer ${supabaseAccessToken}`,
          },
        },
      });
      // Verifica che il token sia valido ottenendo l'utente
      const { data: { user }, error } = await supabase.auth.getUser();
      if (!error && user?.email?.toLowerCase().trim() === email) {
        // ✅ RLS attiva — sicurezza a livello database
        return { supabase, email, useRls: true };
      }
      console.warn("[getAdminClient] Supabase token invalid or email mismatch, falling back to service_role");
    } catch (err) {
      console.warn("[getAdminClient] Supabase JWT check failed, falling back to service_role:", err);
    }
  }

  // 4. FALLBACK — usa service_role (bypassa RLS, sicuro solo se .eq("user_email") è presente)
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseKey) {
    console.error("[getAdminClient] Missing SUPABASE_SERVICE_ROLE_KEY");
    return { supabase: null, email: null, useRls: false };
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  return { supabase, email, useRls: false };
}

