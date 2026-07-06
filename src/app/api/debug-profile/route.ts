import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { createClient } from "@supabase/supabase-js";

/**
 * ENDPOINT DIAGNOSTICO TEMPORANEO — /api/debug-profile
 *
 * Mostra esattamente cosa sta succedendo con il profilo utente:
 * 1. Sessione NextAuth (email autenticata)
 * 2. JWT Supabase (presente? scaduto?)
 * 3. Query diretta su user_profiles (con service_role se disponibile)
 * 4. Email salvate nel DB (tutte, per identificare mismatch)
 *
 * 🔒 DA RIMUOVERE dopo il debug.
 */

export async function GET() {
  const debug: any = {
    timestamp: new Date().toISOString(),
    env: {
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
  };

  // 1. Sessione NextAuth
  const session = await getServerSession(authOptions as any);
  debug.session = {
    hasSession: !!session,
    email: session?.user?.email || null,
    hasSupabaseAccessToken: !!(session as any)?.supabaseAccessToken,
    supabaseExpiresAt: (session as any)?.supabaseExpiresAt || null,
    isExpired: (() => {
      const exp = (session as any)?.supabaseExpiresAt as number | undefined;
      if (!exp) return null;
      const now = Math.floor(Date.now() / 1000);
      return (exp - 60) < now;
    })(),
  };

  if (!session?.user?.email) {
    debug.error = "No session";
    return NextResponse.json(debug, { headers: { "Cache-Control": "no-store" } });
  }

  const email = session.user.email.toLowerCase().trim();
  debug.email = email;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // 2. Query con service_role (se disponibile) — bypassa RLS
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) {
    debug.serviceRole = "available";
    const adminClient = createClient(supabaseUrl, serviceKey);

    // Query diretta per questa email
    const { data: profileRow, error: profileError } = await adminClient
      .from("user_profiles")
      .select("*")
      .eq("user_email", email)
      .maybeSingle();

    debug.profileRow = profileRow;
    debug.profileError = profileError?.message || null;

    // Query tutte le email salvate (per vedere se c'è mismatch)
    const { data: allEmails } = await adminClient
      .from("user_profiles")
      .select("user_email, artist_name")
      .limit(20);

    debug.allProfileEmails = allEmails || [];

    // Conta label_personal_data per questa email
    const { count: labelCount } = await adminClient
      .from("label_personal_data")
      .select("*", { count: "exact", head: true })
      .eq("user_email", email);

    debug.labelCount = labelCount;

    // Conta demo_submissions per questa email
    const { count: demoCount } = await adminClient
      .from("demo_submissions")
      .select("*", { count: "exact", head: true })
      .eq("user_email", email);

    debug.demoCount = demoCount;

    // Conta tutte le email distinte in label_personal_data
    const { data: allLabelEmails } = await adminClient
      .from("label_personal_data")
      .select("user_email")
      .limit(20);

    const uniqueEmails = Array.from(new Set(allLabelEmails?.map((r: any) => r.user_email) || []));
    debug.allLabelEmails = uniqueEmails;
  } else {
    debug.serviceRole = "MISSING — cannot query DB directly";
  }

  // 3. Test con anon key (per vedere se RLS permissive funziona)
  if (supabaseAnonKey) {
    const anonClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: anonProfile, error: anonError } = await anonClient
      .from("user_profiles")
      .select("*")
      .eq("user_email", email)
      .maybeSingle();

    debug.anonTest = {
      profile: anonProfile,
      error: anonError?.message || null,
    };
  }

  return NextResponse.json(debug, { headers: { "Cache-Control": "no-store" } });
}
