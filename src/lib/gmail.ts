/**
 * Gmail API Integration — Direct send from LabelPulse
 *
 * Uses Google Identity Services (GIS) for OAuth token via popup.
 * No redirect URI needed — works entirely client-side.
 * The access token is stored in localStorage and used to call Gmail API directly.
 *
 * ⚠️ iOS / PWA NOTES (2026-06-24, beta feedback "Connessione Gmail"):
 * GIS uses a popup for the OAuth consent. On iOS Safari (especially in PWA
 * standalone mode = "Added to Home Screen"), popups are blocked by default
 * and may not communicate back to the parent window. We detect this and:
 *   - Surface a clear, actionable error message (not the generic "Connessione
 *     fallita. Verifica su Google Cloud Console")
 *   - Detect iOS PWA standalone mode and tell the user to use Safari instead
 *   - Fall back to a manual `window.open()` if GIS fails to spawn the popup
 */

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.readonly",
];

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

// ===== Error types =====

/**
 * Raised when the OAuth flow fails for a known, user-actionable reason.
 * The `kind` field lets the UI surface specific guidance.
 */
export interface GmailAuthError {
  kind:
    | "popup_blocked"        // browser blocked the popup
    | "popup_closed"         // user closed the popup before finishing
    | "ios_pwa"              // iOS PWA standalone — popups don't work
    | "missing_client_id"    // NEXT_PUBLIC_GOOGLE_CLIENT_ID not set
    | "gis_load_failed"      // Google Identity Services script didn't load
    | "oauth_denied"         // user clicked "Deny" on Google's consent
    | "timeout"              // popup never called back (likely crashed)
    | "unknown";             // catch-all
  message: string;           // human-readable, localized to IT
  rawError?: string;         // raw error code from Google, for debugging
}

// ===== Environment detection =====

/**
 * Detect iOS Safari (any iOS browser is technically Safari under the hood).
 * Used to surface iOS-specific guidance.
 */
function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/**
 * Detect PWA standalone mode ("Added to Home Screen" on iOS).
 * In this mode, popups opened with `window.open()` are full-screen overlays
 * that often fail to post messages back to the parent. The GIS popup is no
 * exception. We tell the user to open the app in Safari instead.
 */
function isPWAStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // iOS Safari exposes standalone on window.navigator
  const iosStandalone = (window.navigator as any).standalone === true;
  // Android/Chrome PWA: display-mode standalone
  const displayModeStandalone = window.matchMedia?.("(display-mode: standalone)").matches;
  return iosStandalone || displayModeStandalone;
}

// ===== Types =====

export interface GmailAuthState {
  isConnected: boolean;
  email: string;
  accessToken: string;
  expiresAt: number; // timestamp when token expires
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  threadId?: string;
  error?: string;
}

export interface EmailAttachment {
  filename: string;
  contentType: string;
  data: string; // base64-encoded content
}

function encodeSubject(subject: string): string {
  return btoa(unescape(encodeURIComponent(subject)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function buildRawEmailMessage(opts: {
  to: string[];
  subject: string;
  body: string;
  cc?: string[];
  attachments?: EmailAttachment[];
  inReplyToMessageId?: string;
  references?: string;
}): string {
  const { to, subject, body, cc = [], attachments = [], inReplyToMessageId, references } = opts;
  const toHeader = to.join(", ");
  const headers: string[] = [`To: ${toHeader}`];

  if (cc.length > 0) {
    headers.push(`Cc: ${cc.join(", ")}`);
  }
  if (inReplyToMessageId) {
    headers.push(`In-Reply-To: <${inReplyToMessageId}>`);
  }
  if (references) {
    headers.push(`References: ${references}`);
  } else if (inReplyToMessageId) {
    headers.push(`References: <${inReplyToMessageId}>`);
  }

  headers.push(`Subject: =?utf-8?B?${encodeSubject(subject)}?=`);

  if (attachments.length > 0) {
    const boundary = `----LabelPulseBoundary${Date.now()}${Math.random().toString(16).slice(2)}`;
    headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    headers.push("MIME-Version: 1.0");

    const parts = [
      `--${boundary}`,
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: 7bit",
      "",
      body,
    ];

    for (const attachment of attachments) {
      parts.push(
        `--${boundary}`,
        `Content-Type: ${attachment.contentType}; name="${attachment.filename}"`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: attachment; filename="${attachment.filename}"`,
        "",
        attachment.data
      );
    }

    parts.push(`--${boundary}--`);
    return headers.join("\r\n") + "\r\n\r\n" + parts.join("\r\n");
  }

  headers.push("Content-Type: text/plain; charset=utf-8");
  headers.push("MIME-Version: 1.0");
  return headers.join("\r\n") + "\r\n\r\n" + body;
}

// ===== GIS Script Loader =====

let gisLoaded = false;
let gisLoadPromise: Promise<void> | null = null;

function loadGIS(): Promise<void> {
  if (gisLoaded) return Promise.resolve();
  if (gisLoadPromise) return gisLoadPromise;

  gisLoadPromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Not in browser"));
      return;
    }
    // Check if already loaded
    if ((window as any).google?.accounts?.oauth2) {
      gisLoaded = true;
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      gisLoaded = true;
      resolve();
    };
    script.onerror = () => reject(new Error("Failed to load Google Identity Services"));
    document.head.appendChild(script);
  });

  return gisLoadPromise;
}

// ===== OAuth Token Client =====

let tokenClient: any = null;

async function getTokenClient(): Promise<any> {
  await loadGIS();
  if (!tokenClient) {
    tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: GMAIL_SCOPES.join(" "),
      callback: () => {}, // Will be overridden per-request
    });
  }
  return tokenClient;
}

// ===== Public API =====

/**
 * Request Gmail access via popup.
 *
 * @returns the auth state on success, OR a GmailAuthError describing what
 *          went wrong (never throws — always resolves). The caller can use
 *          the `kind` field to surface specific guidance in the UI.
 */
const OAUTH_TIMEOUT_MS = 120_000; // 2 minutes — popup may stay open a while

export async function requestGmailAccess(): Promise<GmailAuthState | GmailAuthError> {
  // 1. Check client ID is configured
  if (!CLIENT_ID) {
    return {
      kind: "missing_client_id",
      message: "Configurazione OAuth mancante (NEXT_PUBLIC_GOOGLE_CLIENT_ID non impostato). Contatta l'admin.",
    };
  }

  // 2. Detect iOS PWA standalone mode early — the popup simply won't work
  if (isIOS() && isPWAStandalone()) {
    return {
      kind: "ios_pwa",
      message:
        "Su iPhone, se hai aggiunto l'app alla schermata Home, i popup di Google vengono bloccati. " +
        "Apri LabelPulse direttamente in Safari (icona Safari, non l'icona dell'app) e riprova. " +
        "Una volta connesso, puoi tornare a usare l'app dalla schermata Home.",
    };
  }

  // 3. Load GIS script
  let client: any;
  try {
    client = await getTokenClient();
  } catch (err: any) {
    return {
      kind: "gis_load_failed",
      message: "Impossibile caricare Google Identity Services. Verifica la connessione internet e riprova.",
      rawError: err?.message,
    };
  }

  // 4. Run the OAuth flow with a callback + timeout
  return new Promise((resolve) => {
    let resolved = false;

    // Safety timeout: if Google's callback never fires (popup closed, error, etc.)
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.warn("Gmail OAuth timed out — popup may have been closed or callback never fired");
        resolve({
          kind: "timeout",
          message:
            "Il popup di Google non ha risposto entro 2 minuti. " +
            (isIOS()
              ? "Su iPhone, apri LabelPulse in Safari (non dall'icona Home) e riprova. "
              : "") +
            "Verifica anche che i popup non siano bloccati nelle impostazioni del browser.",
        });
      }
    }, OAUTH_TIMEOUT_MS);

    client.callback = (response: any) => {
      if (resolved) return; // Already timed out
      resolved = true;
      clearTimeout(timeout);

      // Google returns { error } when the user denies or closes the popup
      if (response.error) {
        console.error("Gmail OAuth error:", response.error, response.error_description || "");
        const errKind: GmailAuthError["kind"] =
          response.error === "popup_closed" ? "popup_closed" :
          response.error === "access_denied" ? "oauth_denied" :
          response.error === "popup_blocked" ? "popup_blocked" :
          "unknown";
        resolve({
          kind: errKind,
          message: humanizeOAuthError(errKind, response.error, response.error_description),
          rawError: response.error,
        });
        return;
      }

      const authState: GmailAuthState = {
        isConnected: true,
        email: "", // Will be fetched after
        accessToken: response.access_token,
        expiresAt: Date.now() + (response.expires_in || 3600) * 1000,
      };

      // Fetch user email
      fetchGmailUserInfo(response.access_token)
        .then((email) => {
          authState.email = email;
          resolve(authState);
        })
        .catch(() => {
          // Token works but couldn't get email — still valid
          resolve(authState);
        });
    };

    try {
      client.requestAccessToken({ prompt: "consent" });
    } catch (err: any) {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve({
          kind: "popup_blocked",
          message:
            "Il popup di Google è stato bloccato dal browser. " +
            (isIOS()
              ? "Su iPhone: vai in Impostazioni → Safari → Blocca popup e disattivalo, poi riprova. "
              : "Abilita i popup per questo sito nelle impostazioni del browser e riprova. "),
          rawError: err?.message,
        });
      }
    }
  });
}

/**
 * Convert an OAuth error kind into a user-friendly Italian message.
 * Falls back to a generic message if the kind is unknown.
 */
function humanizeOAuthError(
  kind: GmailAuthError["kind"],
  rawError?: string,
  errorDescription?: string
): string {
  switch (kind) {
    case "popup_closed":
      return "Hai chiuso la finestra di Google prima di completare il login. Riprova e segui tutti i passaggi.";
    case "oauth_denied":
      return "Hai negato il permesso a LabelPulse di accedere a Gmail. Per usare questa funzione devi accettare i permessi nella finestra di Google.";
    case "popup_blocked":
      return (
        "Il popup di Google è stato bloccato dal browser. " +
        (isIOS()
          ? "Su iPhone: Impostazioni → Safari → disattiva 'Blocca popup', poi riprova."
          : "Abilita i popup per questo sito e riprova.")
      );
    default:
      return `Errore di Google: ${errorDescription || rawError || "sconosciuto"}. Riprova.`;
  }
}

/**
 * Revoke Gmail access and disconnect.
 */
export async function revokeGmailAccess(accessToken: string): Promise<void> {
  try {
    const client = await getTokenClient();
    // Revoke the token
    (window as any).google.accounts.oauth2.revoke(accessToken);
  } catch {
    // Ignore errors on revoke
  }
}

/**
 * Check if the stored token is still valid, refresh if needed.
 */
export async function ensureValidToken(authState: GmailAuthState): Promise<GmailAuthState | null> {
  // If token still valid for at least 60 seconds
  if (authState.expiresAt > Date.now() + 60000) {
    return authState;
  }

  // Token expired — need to re-auth
  try {
    const client = await getTokenClient();
    return new Promise((resolve) => {
      client.callback = (response: any) => {
        if (response.error) {
          resolve(null);
          return;
        }
        const newAuth: GmailAuthState = {
          ...authState,
          accessToken: response.access_token,
          expiresAt: Date.now() + (response.expires_in || 3600) * 1000,
        };
        resolve(newAuth);
      };
      // Try to get new token silently
      client.requestAccessToken({ prompt: "" });
    });
  } catch {
    return null;
  }
}

/**
 * Send an email directly via Gmail API.
 */
export async function sendEmail(
  accessToken: string,
  to: string[],
  subject: string,
  body: string,
  cc: string[] = [],
  attachments: EmailAttachment[] = []
): Promise<SendEmailResult> {
  try {
    const rawEmail = buildRawEmailMessage({
      to,
      subject,
      body,
      cc,
      attachments,
    });

    const encodedEmail = btoa(unescape(encodeURIComponent(rawEmail)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const response = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw: encodedEmail }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData.error?.message || `HTTP ${response.status}`;
      return { success: false, error: errorMsg };
    }

    const data = await response.json();
    return { success: true, messageId: data.id, threadId: data.threadId };
  } catch (err: any) {
    return { success: false, error: err.message || "Unknown error" };
  }
}

/**
 * Send a reply in an existing Gmail thread. The reply will appear in the same
 * conversation both in the user's inbox and in the label's inbox (assuming
 * the label's email client respects threading headers).
 *
 * If `threadId` is provided, the message is added to that thread.
 * If `inReplyToMessageId` is provided, an `In-Reply-To` header is added so
 * mail clients correctly nest the reply under the original message.
 *
 * The `to` field should normally be the label's reply-to email (parsed from
 * the original reply's `from` header — see `findReplyForDemo`).
 */
export async function sendReplyInThread(
  accessToken: string,
  opts: {
    to: string[];
    subject: string;        // should be "Re: <original subject>"
    body: string;
    threadId?: string;
    inReplyToMessageId?: string;
    cc?: string[];
    references?: string;    // References header (RFC 5322 §3.6.4)
    attachments?: EmailAttachment[];
  }
): Promise<SendEmailResult & { threadId?: string }> {
  try {
    const { to, subject, body, threadId, inReplyToMessageId, cc = [], references, attachments = [] } = opts;

    const rawEmail = buildRawEmailMessage({
      to,
      subject,
      body,
      cc,
      attachments,
      inReplyToMessageId,
      references,
    });

    const encodedEmail = btoa(unescape(encodeURIComponent(rawEmail)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    // If we have a threadId, send into the thread; otherwise plain send
    const url = threadId
      ? `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`
      : `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`;

    const payload: any = { raw: encodedEmail };
    if (threadId) payload.threadId = threadId;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData.error?.message || `HTTP ${response.status}`;
      return { success: false, error: errorMsg };
    }

    const data = await response.json();
    return {
      success: true,
      messageId: data.id,
      threadId: data.threadId || threadId,
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Unknown error" };
  }
}

/**
 * Fetch the authenticated user's Gmail address.
 */
async function fetchGmailUserInfo(accessToken: string): Promise<string> {
  const response = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/profile",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) return "";

  const data = await response.json();
  return data.emailAddress || "";
}

// ====================================================================
// READ-ONLY INTEGRATION — reply detection for sent demos
// ====================================================================
//
// Flow:
//  1. For each Demo with status="sent" and replyStatus in {none, undefined}
//     OR with replyStatus="ack" (to detect escalation to positive/rejected)
//     OR with lastReplyScanAt older than sentDate:
//  2. Build a Gmail query: `from:{labelEmail} after:{sentDateUnixSeconds}`
//     OR `subject:"Re: {originalSubject}"` if labelEmail is unknown.
//  3. List messages matching the query (max 5 — we only care about the latest).
//  4. For each match, fetch the full message and extract body + headers.
//  5. Pass to reply-classifier. Pick the highest-confidence classification.
//  6. Return a structured result per demo so the store can update it.
//
// We do NOT auto-advance demo status here — that decision belongs to the
// store/UI layer (auto-advance vs. wait for user confirmation).

export interface GmailMessageSummary {
  messageId: string;
  threadId: string;
  from: string;          // raw From header (e.g. "Patrick <patrick@animarum.com>")
  fromEmail: string;     // parsed email address
  to: string;
  subject: string;
  date: string;          // ISO 8601 from internalDate
  bodyText: string;      // extracted plain-text body (best effort)
  snippet: string;       // Gmail-provided short snippet
  inReplyTo?: string;    // In-Reply-To header if present
}

export interface ReplyScanResult {
  demoId: string;
  found: boolean;
  latestReply?: GmailMessageSummary;
  // Classification result if found
  category?: "ack" | "info" | "positive" | "rejected" | "none";
  confidence?: number;
  matchedPatterns?: string[];
  detectedLanguage?: string;
  error?: string;
}

/**
 * Parse a Gmail message payload into { subject, from, fromEmail, bodyText }.
 * Handles multipart/alternative and multipart/mixed. Prefers text/plain.
 */
function parseMessagePayload(payload: any): {
  subject: string;
  from: string;
  fromEmail: string;
  to: string;
  date: string;
  bodyText: string;
  inReplyTo?: string;
} {
  const headers: Record<string, string> = {};
  if (payload?.headers) {
    for (const h of payload.headers) {
      headers[(h.name || "").toLowerCase()] = h.value || "";
    }
  }

  // Recursively find text/plain or text/html body
  function findBody(part: any): { text?: string; html?: string } {
    if (!part) return {};
    const mimeType: string = part.mimeType || "";
    if (mimeType === "text/plain" && part.body?.data) {
      return { text: decodeBase64Url(part.body.data) };
    }
    if (mimeType === "text/html" && part.body?.data) {
      return { html: decodeBase64Url(part.body.data) };
    }
    // multipart — recurse
    if (part.parts && part.parts.length > 0) {
      let text: string | undefined;
      let html: string | undefined;
      for (const sub of part.parts) {
        const found = findBody(sub);
        if (found.text && !text) text = found.text;
        if (found.html && !html) html = found.html;
        if (text) break; // prefer text/plain, stop early
      }
      // If no text/plain found, fall back to text/html from any sub-part
      if (!text && !html) {
        for (const sub of part.parts) {
          const found = findBody(sub);
          if (found.html) { html = found.html; break; }
          if (found.text) { text = found.text; break; }
        }
      }
      return { text, html };
    }
    return {};
  }

  const body = findBody(payload);
  let bodyText = body.text || "";
  if (!bodyText && body.html) {
    // Strip HTML tags — crude but works for label replies
    bodyText = body.html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Parse from header → email address
  const fromRaw = headers.from || "";
  const emailMatch = fromRaw.match(/<([^>]+)>/) || fromRaw.match(/([\w.+-]+@[\w-]+\.[\w.-]+)/);
  const fromEmail = emailMatch ? emailMatch[1].toLowerCase() : "";

  return {
    subject: headers.subject || "",
    from: fromRaw,
    fromEmail,
    to: headers.to || "",
    date: headers.date || "",
    bodyText,
    inReplyTo: headers["in-reply-to"],
  };
}

function decodeBase64Url(data: string): string {
  try {
    // Gmail uses base64url — convert to standard base64
    const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
    // Pad to multiple of 4
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    // Decode as UTF-8
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder("utf-8").decode(bytes);
  } catch (e) {
    return "";
  }
}

/**
 * Search Gmail for messages matching a query. Returns message IDs + thread IDs.
 */
async function listMessages(
  accessToken: string,
  query: string,
  maxResults = 5
): Promise<{ id: string; threadId: string }[]> {
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", String(maxResults));

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gmail list failed: ${response.status} ${err}`);
  }

  const data = await response.json();
  return data.messages || [];
}

/**
 * Fetch a single message with full payload.
 */
async function getMessage(
  accessToken: string,
  messageId: string,
  format: "full" | "metadata" | "raw" = "full"
): Promise<any> {
  const url = new URL(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`
  );
  url.searchParams.set("format", format);

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gmail get failed: ${response.status} ${err}`);
  }

  return response.json();
}

/**
 * Convert Gmail internalDate (ms since epoch as string) to ISO 8601.
 */
function internalDateToIso(internalDate: string | number): string {
  const ms = typeof internalDate === "string" ? parseInt(internalDate, 10) : internalDate;
  if (!ms || isNaN(ms)) return new Date().toISOString();
  return new Date(ms).toISOString();
}

/**
 * Search a single demo's email thread for replies.
 *
 * Strategy:
 *  1. If we have the label email: search `from:{labelEmail} after:{sentDate}`
 *  2. Else if we have the original subject: search `subject:"Re: {subject}"`
 *     (case-insensitive Gmail handles "re:" prefix automatically)
 *  3. Pick the most recent matching message and return its parsed summary.
 *
 * The caller (store.scanReplies) decides what to do with the result.
 */
export async function findReplyForDemo(
  accessToken: string,
  opts: {
    demoId: string;
    labelEmails: string[];   // candidate label emails
    sentDate: string;        // ISO date when demo was sent
    originalSubject?: string; // pitch subject — used as fallback
    sinceDate?: string;      // ISO date — only consider replies after this
  }
): Promise<ReplyScanResult> {
  const { demoId, labelEmails, sentDate, originalSubject, sinceDate } = opts;

  const sentUnix = Math.floor(new Date(sentDate).getTime() / 1000);
  const sinceUnix = sinceDate
    ? Math.floor(new Date(sinceDate).getTime() / 1000)
    : 0;

  // Build query: from label email, after sent date (or after sinceDate if newer)
  const afterDate = sinceUnix > sentUnix ? sinceUnix : sentUnix;
  const queryParts: string[] = [`after:${afterDate}`];

  if (labelEmails.length > 0) {
    // Try each label email — Gmail OR syntax: from:a OR from:b
    const fromClauses = labelEmails
      .filter((e) => e && e.includes("@"))
      .map((e) => `from:${e.toLowerCase()}`);
    if (fromClauses.length === 1) {
      queryParts.unshift(fromClauses[0]);
    } else if (fromClauses.length > 1) {
      queryParts.unshift(`{${fromClauses.join(" ")}}`);
    }
  } else if (originalSubject) {
    // Fallback: search by subject — Gmail's "subject:" matches substrings
    const cleanSubject = originalSubject.replace(/^re:\s*/i, "").trim();
    queryParts.unshift(`subject:"${cleanSubject.slice(0, 80)}"`);
  } else {
    return {
      demoId,
      found: false,
      error: "No label email or original subject provided — cannot search",
    };
  }

  const query = queryParts.join(" ");

  let messageIds: { id: string; threadId: string }[] = [];
  try {
    messageIds = await listMessages(accessToken, query, 5);
  } catch (err: any) {
    return {
      demoId,
      found: false,
      error: `Search failed: ${err.message}`,
    };
  }

  if (messageIds.length === 0) {
    return { demoId, found: false };
  }

  // Fetch the most recent message (Gmail returns most recent first)
  // Load each until we get one with a body — sometimes the first is a thread notification
  let bestMessage: GmailMessageSummary | null = null;
  let bestInternalDate = 0;

  for (const { id, threadId } of messageIds) {
    try {
      const msg = await getMessage(accessToken, id, "full");
      const internalDate = parseInt(msg.internalDate || "0", 10);
      const parsed = parseMessagePayload(msg.payload);
      if (!parsed.bodyText && !parsed.subject) continue;

      const summary: GmailMessageSummary = {
        messageId: id,
        threadId,
        from: parsed.from,
        fromEmail: parsed.fromEmail,
        to: parsed.to,
        subject: parsed.subject,
        date: internalDateToIso(msg.internalDate),
        bodyText: parsed.bodyText,
        snippet: msg.snippet || "",
        inReplyTo: parsed.inReplyTo,
      };

      if (internalDate > bestInternalDate) {
        bestInternalDate = internalDate;
        bestMessage = summary;
      }
    } catch (err: any) {
      // Skip this message, try the next
      console.warn(`[gmail] Failed to fetch message ${id}:`, err.message);
      continue;
    }
  }

  if (!bestMessage) {
    return { demoId, found: false, error: "No readable message body found" };
  }

  return {
    demoId,
    found: true,
    latestReply: bestMessage,
  };
}

/**
 * Convenience: scan multiple demos in sequence (rate-limited).
 * Returns one ReplyScanResult per demo.
 *
 * Rate limit: ~50ms between Gmail API calls to stay under quota.
 */
export async function scanRepliesForDemos(
  accessToken: string,
  demos: Array<{
    demoId: string;
    labelEmails: string[];
    sentDate: string;
    originalSubject?: string;
    sinceDate?: string;
  }>,
  onProgress?: (scanned: number, total: number) => void
): Promise<ReplyScanResult[]> {
  const results: ReplyScanResult[] = [];

  for (let i = 0; i < demos.length; i++) {
    const demo = demos[i];
    try {
      const result = await findReplyForDemo(accessToken, demo);
      results.push(result);
    } catch (err: any) {
      results.push({
        demoId: demo.demoId,
        found: false,
        error: err.message,
      });
    }
    onProgress?.(i + 1, demos.length);
    // Small delay between demos to be polite to the Gmail API
    if (i < demos.length - 1) {
      await new Promise((r) => setTimeout(r, 80));
    }
  }

  return results;
}
