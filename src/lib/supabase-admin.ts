import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

/**
 * 🔒 Supabase client helper con RLS vera.
 *
 * Flusso:
 * 1. Verifica sessione NextAuth
 * 2. Tenta JWT Supabase dalla sessione → RLS attiva
 * 3. Se JWT non disponibile o scaduto, tenta service_role (bypassa RLS)
 * 4. Se nessun percorso funziona, restituisce null (fail esplicito)
 *
 * Il fallback anon key è stato eliminato: le policy RLS basate su
 * user_id = auth.uid() bloccano l'anon key, quindi restituire un client
 * anon darebbe dati vuoti silenziosi invece di un errore esplicito.
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

  // 3. 🔒 PERCORSO PRINCIPALE: JWT Supabase dalla sessione
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
      console.warn("[getAdminClient] Supabase JWT expired — using service_role fallback");
    }
  }

  // 4. FALLBACK: service_role (bypassa RLS)
  // TODO Fase 6: eliminare questo fallback quando il refresh token flow sarà implementato.
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseServiceKey) {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    return { supabase, email, useRls: false };
  }

  // 5. FAIL ESPLICITO: nessun client disponibile
  console.error("[getAdminClient] No valid JWT and no service_role key — cannot create Supabase client");
  return { supabase: null, email: null, useRls: false };
}
