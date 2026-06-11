/**
 * Gmail API Integration — Direct send from LabelPulse
 *
 * Uses Google Identity Services (GIS) for OAuth token via popup.
 * No redirect URI needed — works entirely client-side.
 * The access token is stored in localStorage and used to call Gmail API directly.
 */

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.compose",
];

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

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
  error?: string;
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
 * Returns the auth state if successful, null if denied/cancelled.
 */
const OAUTH_TIMEOUT_MS = 120_000; // 2 minutes — popup may stay open a while

export async function requestGmailAccess(): Promise<GmailAuthState | null> {
  try {
    const client = await getTokenClient();

    return new Promise((resolve) => {
      let resolved = false;

      // Safety timeout: if Google's callback never fires (popup closed, error, etc.)
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.warn("Gmail OAuth timed out — popup may have been closed or callback never fired");
          resolve(null);
        }
      }, OAUTH_TIMEOUT_MS);

      client.callback = (response: any) => {
        if (resolved) return; // Already timed out
        resolved = true;
        clearTimeout(timeout);

        if (response.error) {
          console.error("Gmail OAuth error:", response.error, response.error_description || "");
          resolve(null);
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

      client.requestAccessToken({ prompt: "consent" });
    });
  } catch (err) {
    console.error("Failed to request Gmail access:", err);
    return null;
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
  cc: string[] = []
): Promise<SendEmailResult> {
  try {
    // Build RFC 2822 email
    const toHeader = to.join(", ");
    const ccHeader = cc.length > 0 ? `Cc: ${cc.join(", ")}\r\n` : "";

    const rawEmail = [
      `To: ${toHeader}`,
      ccHeader,
      `Subject: =?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
      "Content-Type: text/plain; charset=utf-8",
      "MIME-Version: 1.0",
      "",
      body,
    ].join("\r\n");

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
    return { success: true, messageId: data.id };
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
