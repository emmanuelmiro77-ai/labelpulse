import { NextResponse } from "next/server";

/**
 * GET /api/auth-config-check
 *
 * Diagnostic endpoint that returns which NextAuth/Google env vars are set
 * on the current Vercel deployment. The user can visit this URL in the
 * browser (even from the phone) to see exactly what's missing — without
 * exposing any secret values.
 *
 * This route is read-only and safe to leave deployed.
 */
export async function GET() {
  const report = {
    deployedOn: process.env.VERCEL ? "vercel" : "non-vercel",
    vercelEnv: process.env.VERCEL_ENV ?? null,
    deploymentUrl: process.env.VERCEL_URL ?? null,
    envVars: {
      GOOGLE_CLIENT_ID: {
        set: !!process.env.GOOGLE_CLIENT_ID,
        length: process.env.GOOGLE_CLIENT_ID?.length ?? 0,
      },
      GOOGLE_CLIENT_SECRET: {
        set: !!process.env.GOOGLE_CLIENT_SECRET,
        length: process.env.GOOGLE_CLIENT_SECRET?.length ?? 0,
      },
      NEXTAUTH_SECRET: {
        set: !!process.env.NEXTAUTH_SECRET,
        length: process.env.NEXTAUTH_SECRET?.length ?? 0,
      },
      NEXTAUTH_URL: {
        set: !!process.env.NEXTAUTH_URL,
        value: process.env.NEXTAUTH_URL ?? null, // not a secret, OK to show
      },
      NEXT_PUBLIC_SUPABASE_URL: {
        set: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      },
      NEXT_PUBLIC_SUPABASE_ANON_KEY: {
        set: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      },
    },
    authOptions: {
      trustHost: true,
      provider: "google",
      scopes: ["openid", "email", "profile", "gmail.send"],
    },
    diagnosis: [] as string[],
    nextSteps: [] as string[],
  };

  // Build a plain-language diagnosis
  if (!report.envVars.GOOGLE_CLIENT_ID.set) {
    report.diagnosis.push("❌ GOOGLE_CLIENT_ID mancante — senza questo, Google non sa quale app OAuth sta chiamando.");
  }
  if (!report.envVars.GOOGLE_CLIENT_SECRET.set) {
    report.diagnosis.push("❌ GOOGLE_CLIENT_SECRET mancante — impossibile verificare la risposta di Google.");
  }
  if (!report.envVars.NEXTAUTH_SECRET.set) {
    report.diagnosis.push("❌ NEXTAUTH_SECRET mancante — NextAuth non può firmare i JWT. Questo è la causa #1 dell'errore 'Server error'.");
  }
  if (!report.envVars.NEXTAUTH_URL.set) {
    report.diagnosis.push("⚠️ NEXTAUTH_URL mancante — verrà inferito dalla richiesta (trustHost: true). Va impostato esplicitamente se hai un dominio custom.");
  }
  if (report.diagnosis.length === 0) {
    report.diagnosis.push("✅ Tutte le variabili richieste sono presenti. Se l'errore persiste, il problema è altrove (es. redirect URI su Google Cloud Console).");
  }

  // Next steps
  if (report.diagnosis.some((d) => d.startsWith("❌") || d.startsWith("⚠️"))) {
    report.nextSteps.push(
      "1. Vai su vercel.com → il tuo progetto LabelPulse → Settings → Environment Variables",
      "2. Aggiungi le variabili mancanti per gli ambienti Production + Preview + Development",
      "3. Fai Redeploy del progetto (le env vars vengono lette solo a build/start)",
      "4. Torna su questa rotta per verificare che ora sia tutto ✅",
      "5. Se tutto è ✅ ma il login continua a fallire: controlla su Google Cloud Console → API & Services → Credentials → OAuth 2.0 Client → 'Authorized redirect URIs' debba contenere https://<tuo-dominio>/api/auth/callback/google"
    );
  }

  return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
}
