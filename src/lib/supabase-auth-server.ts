import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

/**
 * 🔒 FASE D — Supabase Auth session management (server-side)
 *
 * Bridge tra NextAuth (Google login) e Supabase Auth.
 *
 * Flusso:
 * 1. Utente fa login Google con NextAuth
 * 2. Nel callback jwt di NextAuth, scambiamo il Google ID token con una sessione Supabase
 *    usando supabase.auth.signInWithIdToken()
 * 3. La sessione Supabase (access_token + refresh_token) viene salvata in cookie httpOnly
 * 4. Le API routes leggono il cookie e creano un Supabase client autenticato
 * 5. Le query rispettano la RLS: auth.jwt()->>'email' viene dal JWT, non dall'API route
 *
 * Questo è il LIVELLO DI SICUREZZA MASSIMO:
 * - Anche se c'è un bug in una API route (manca .eq("user_email", email)),
 *   il database blocca l'accesso perché la RLS filtra a livello di riga
 * - Il service_role key NON viene più usato per le query utente (solo per admin ops)
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const SESSION_COOKIE_NAME = "sb-labelpulse-auth";

/**
 * Crea un Supabase client server-side che legge/scrive i cookie di sessione.
 * Da usare nelle API routes e Server Components.
 */
export function getSupabaseServerClient() {
  const cookieStore = cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing sessions.
        }
      },
    },
  });
}

/**
 * Crea un Supabase client per API routes (NextRequest).
 * Legge i cookie dalla request.
 */
export function getSupabaseRouteClient(request: NextRequest) {
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
      },
    },
  });
}

/**
 * Verifica che l'utente sia autenticato e restituisce la sessione Supabase.
 * Da usare nelle API routes per ottenere il JWT dell'utente.
 *
 * Returns null se non autenticato.
 */
export async function getSupabaseSession() {
  const supabase = getSupabaseServerClient();
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) {
    return null;
  }
  return session;
}

/**
 * Restituisce l'email dell'utente autenticato dal JWT Supabase.
 * Da usare nelle API routes come fallback se la sessione non c'è.
 */
export async function getAuthenticatedEmail(): Promise<string | null> {
  const session = await getSupabaseSession();
  if (!session?.user?.email) return null;
  return session.user.email.toLowerCase().trim();
}

export { SESSION_COOKIE_NAME };
