/**
 * email.ts — Client-side helpers for the in-app email sender (Resend).
 *
 * È l'alternativa a `src/lib/gmail.ts` per utenti che non hanno (o non
 * vogliono) connettere il proprio Gmail. Tutte le chiamate passano dal
 * server via `/api/email/send` perché la Resend API key è server-only.
 *
 * FLUSSO:
 *   1. La UI chiama `isInAppEmailConfigured()` all'avvio per sapere se
 *      mostrare il bottone "Invia dall'app".
 *   2. Quando l'utente clicca, la UI chiama `sendEmailInApp(...)`.
 *   3. La funzione fa un POST a `/api/email/send` con payload JSON.
 *   4. Il server chiama Resend e ritorna `{ success, messageId, from }`.
 *
 * SICUREZZA:
 *   - L'API route verifica la sessione NextAuth → solo utenti loggati possono
 *     inviare email (no abuse anonimo).
 *   - La Resend API key NON è esposta al client (server-only env var).
 *   - Il `from` è fisso lato server (EMAIL_FROM) — l'utente non può
 *     impersonare altri mittenti.
 */

export interface InAppEmailResult {
  success: boolean;
  messageId?: string;
  from?: string;
  error?: string;
}

/**
 * Verifica se il servizio email in-app (Resend) è configurato.
 * Da chiamare all'avvio dell'app per decidere se mostrare il bottone
 * "Invia dall'app" nella UI.
 *
 * Ritorna `null` se non ancora controllato, altrimenti `{ configured, from }`.
 */
let _configCache: { configured: boolean; from: string | null } | null = null;

export async function isInAppEmailConfigured(
  forceRefresh = false
): Promise<{ configured: boolean; from: string | null }> {
  if (_configCache && !forceRefresh) return _configCache;
  try {
    const res = await fetch("/api/email/send", { method: "GET" });
    if (!res.ok) {
      _configCache = { configured: false, from: null };
      return _configCache;
    }
    const data = await res.json();
    _configCache = {
      configured: !!data.configured,
      from: data.from || null,
    };
    return _configCache;
  } catch {
    _configCache = { configured: false, from: null };
    return _configCache;
  }
}

/**
 * Invia un'email usando il servizio in-app (Resend).
 *
 * @param to        Array di indirizzi email destinatari
 * @param subject   Oggetto dell'email
 * @param body      Corpo plain text dell'email
 * @param cc        (opzionale) Array di indirizzi in CC
 * @param replyTo   (opzionale) Indirizzo reply-to (default = EMAIL_FROM)
 *
 * @returns `{ success: true, messageId, from }` oppure
 *          `{ success: false, error }` con messaggio localizzabile.
 */
export async function sendEmailInApp(
  to: string[],
  subject: string,
  body: string,
  cc: string[] = [],
  replyTo?: string
): Promise<InAppEmailResult> {
  try {
    const res = await fetch("/api/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, body, cc, replyTo }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      // Map common error cases to user-friendly messages
      let errorMsg = data?.error || `HTTP ${res.status}`;
      if (res.status === 503) {
        errorMsg =
          "Servizio email non configurato. L'amministratore deve aggiungere RESEND_API_KEY.";
      } else if (res.status === 401) {
        errorMsg = "Devi essere autenticato per inviare email.";
      } else if (res.status === 400) {
        errorMsg = data?.details || "Dati email non validi.";
      } else if (res.status === 502) {
        errorMsg = `Errore del provider email: ${data?.details || errorMsg}`;
      }
      return { success: false, error: errorMsg };
    }

    return {
      success: true,
      messageId: data.messageId,
      from: data.from,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Errore di rete durante l'invio dell'email.",
    };
  }
}
