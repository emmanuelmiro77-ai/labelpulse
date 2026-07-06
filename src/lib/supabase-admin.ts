import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

/**
 * 🔒 FASE D — Supabase client helper con RLS vera
 *
 * STRATEGIA DOPPIA (transizione sicura):
 * 1. PRIMA TENTATIVO: usa il JWT Supabase dalla sessione NextAuth
 *    → RLS attiva a livello database → sicurezza massima
 *    → anche se c'è un bug nella query, il database blocca cross-user
 *
 * 2. FALLBACK: se il JWT Supabase non è disponibile (es. utente loggato
 *    prima della FASE D, o bridge non ancora configurato, o token scaduto),
 *    usa service_role con .eq("user_email", email) → sicurezza a livello API route
 *
 * 🔒 FIX EMERGENZA RLS (2026-07-06):
 * Il JWT Supabase scade dopo 1 ora e non viene refreshato. Dopo logout/login,
 * se il token è scaduto, getUser() fallisce e cade sul fallback service_role.
 * Se SUPABASE_SERVICE_ROLE_KEY non è impostato su Vercel, il fallback ritorna
 * null → API route ritorna 401 → frontend vede "Profilo vuoto".
 *
 * Fix:
 * 1. Controlla la scadenza del token PRIMA di usarlo (risparmia una chiamata)
 * 2. Se il token è scaduto, vai direttamente al fallback service_role
 * 3. Se il fallback service_role manca, logga errore chiaro (non 401 silenzioso)
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
  //    🔒 FIX: controlla scadenza PRIMA di usarlo (risparmia getUser() se scaduto)
  const supabaseAccessToken = (session as any).supabaseAccessToken;
  const supabaseExpiresAt = (session as any).supabaseExpiresAt as number | undefined;

  if (supabaseAccessToken) {
    // Controlla se il token è scaduto (con margine di 60s)
    const now = Math.floor(Date.now() / 1000);
    const isExpired = supabaseExpiresAt ? (supabaseExpiresAt - 60) < now : false;

    if (isExpired) {
      console.warn("[getAdminClient] Supabase JWT expired (expires_at=" + supabaseExpiresAt + ", now=" + now + ") — falling back to service_role");
    } else {
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
  }

  // 4. FALLBACK — usa service_role (bypassa RLS, sicuro solo se .eq("user_email") è presente)
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseKey) {
    console.error("[getAdminClient] Missing SUPABASE_SERVICE_ROLE_KEY — API routes cannot read user data. Set this env var on Vercel.");
    return { supabase: null, email: null, useRls: false };
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  return { supabase, email, useRls: false };
}
