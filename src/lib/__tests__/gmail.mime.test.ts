/**
 * Test anti-regressione — Gmail MIME headers leaking into body
 *
 * Fix protetto: commit 03f4d17 "fix(gmail): MIME headers leaking into body
 * + effectivePitch ignoring saved pitchText"
 *
 * Cosa testiamo:
 *   - sendEmail costruisce un'email RFC 2822 valida con un SOLO
 *     separatore \r\n\r\n (header/body separator)
 *   - Nessuna riga vuota in mezzo agli header
 *   - Subject è codificato come =?utf-8?B?...?= (RFC 2047)
 *   - Quando cc è vuoto, NON viene inserito alcun header Cc vuoto
 *     (era il bug originario — una stringa vuota creava una riga vuota
 *     in mezzo agli header → Gmail terminava gli header prematuramente)
 *   - sendReplyInThread rispetta lo stesso pattern con headers opzionali
 *
 * Se questo test fallisce in futuro → qualcuno ha reintrodotto il pattern
 * buggato `.push("") + .join("\r\n")` oppure ha aggiunto un header
 * opzionale con stringa vuota. RIPRISTINARE immediatamente il fix 03f4d17.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock fetch so we can capture the request payload without hitting Gmail
async function captureGmailRequest(handler: () => Promise<any>): Promise<{
  url: string;
  body: any;
  rawDecoded: string | null;
  response: any;
}> {
  const calls: { url: string; body: any }[] = [];
  const origFetch = global.fetch;
  global.fetch = vi.fn(async (url: any, init?: any) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body) : null });
    return new Response(JSON.stringify({ id: "msg-1", threadId: "thread-1" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as any;

  try {
    const response = await handler();
    const last = calls[calls.length - 1];
    let rawDecoded: string | null = null;
    if (last?.body?.raw) {
      // Gmail API uses base64url encoding
      const b64 = last.body.raw.replace(/-/g, "+").replace(/_/g, "/");
      rawDecoded = decodeURIComponent(escape(atob(b64)));
    }
    return { url: last?.url ?? "", body: last?.body, rawDecoded, response };
  } finally {
    global.fetch = origFetch;
  }
}

import { sendEmail, sendReplyInThread } from "@/lib/gmail";

describe("Gmail MIME headers (fix 03f4d17)", () => {
  beforeEach(() => {
    // Silence console.error from sendEmail when fetch fails
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("sendEmail — RFC 2822 structure", () => {
    it("produces a single \\r\\n\\r\\n header/body separator", async () => {
      const { rawDecoded } = await captureGmailRequest(() =>
        sendEmail("token-123", ["label@example.com"], "Demo Submission", "Body text here")
      );

      expect(rawDecoded).not.toBeNull();
      const separatorCount = (rawDecoded!.match(/\r\n\r\n/g) || []).length;
      expect(separatorCount).toBe(1);
    });

    it("does NOT have any blank line in the headers section", async () => {
      const { rawDecoded } = await captureGmailRequest(() =>
        sendEmail("token-123", ["label@example.com"], "Demo Submission: Track — Artist", "Body here")
      );

      // Split at the official separator (first \r\n\r\n)
      const [headersSection] = rawDecoded!.split("\r\n\r\n");
      const headerLines = headersSection!.split("\r\n");
      // Every header line must be non-empty
      for (const line of headerLines) {
        expect(line.length).toBeGreaterThan(0);
        // Each header line must look like "Header-Name: value"
        expect(line).toMatch(/^[A-Za-z-]+: .+/);
      }
    });

    it("includes all required headers in the right order", async () => {
      const { rawDecoded } = await captureGmailRequest(() =>
        sendEmail("token-123", ["label@example.com"], "Demo Submission: Track — Artist", "Body here")
      );

      const [headersSection] = rawDecoded!.split("\r\n\r\n");
      const headerLines = headersSection!.split("\r\n").map(l => l.split(": ")[0]);
      expect(headerLines).toEqual(["To", "Subject", "Content-Type", "MIME-Version"]);
    });

    it("encodes Subject as RFC 2047 base64 UTF-8 (=?utf-8?B?...?=)", async () => {
      const subject = "Demo Submission: Träck — Artïst";
      const { rawDecoded } = await captureGmailRequest(() =>
        sendEmail("token-123", ["label@example.com"], subject, "Body")
      );

      const [headersSection] = rawDecoded!.split("\r\n\r\n");
      const subjectLine = headersSection!.split("\r\n").find(l => l.startsWith("Subject:"));
      expect(subjectLine).toBeDefined();
      expect(subjectLine!).toMatch(/^Subject: =\?utf-8\?B\?.+\?=$/);
      // Verify we can decode it back to the original
      const b64Content = subjectLine!.replace("Subject: =?utf-8?B?", "").replace("?=", "");
      const decoded = atob(b64Content);
      const utf8Decoded = decodeURIComponent(escape(decoded));
      expect(utf8Decoded).toBe(subject);
    });

    it("joins multiple recipients in the To header with ', '", async () => {
      const { rawDecoded } = await captureGmailRequest(() =>
        sendEmail("token-123", ["a@x.com", "b@x.com", "c@x.com"], "Subject", "Body")
      );

      const [headersSection] = rawDecoded!.split("\r\n\r\n");
      const toLine = headersSection!.split("\r\n").find(l => l.startsWith("To:"));
      expect(toLine).toBe("To: a@x.com, b@x.com, c@x.com");
    });

    it("includes Cc header when cc is provided", async () => {
      const { rawDecoded } = await captureGmailRequest(() =>
        sendEmail("token-123", ["to@x.com"], "Subject", "Body", ["cc1@x.com", "cc2@x.com"])
      );

      const [headersSection] = rawDecoded!.split("\r\n\r\n");
      const ccLine = headersSection!.split("\r\n").find(l => l.startsWith("Cc:"));
      expect(ccLine).toBe("Cc: cc1@x.com, cc2@x.com");
    });
  });

  describe("sendEmail — empty cc (the original bug)", () => {
    it("does NOT insert an empty Cc header when cc array is empty", async () => {
      // THIS IS THE CRITICAL TEST — the original bug was:
      //   const ccHeader = cc.length > 0 ? `Cc: ${cc.join(", ")}\r\n` : "";
      //   const rawEmail = [
      //     `To: ${toHeader}`,
      //     ccHeader,        // ← empty string "" when cc is empty
      //     `Subject: ...`,
      //     ...
      //   ].join("\r\n");
      // The empty string produced a \r\n\r\n between To: and Subject:,
      // which terminated the headers prematurely. Gmail then saw
      // Subject/Content-Type/MIME-Version as part of the body.

      const { rawDecoded } = await captureGmailRequest(() =>
        sendEmail("token-123", ["to@x.com"], "Subject", "Body", [])
      );

      const [headersSection, bodySection] = rawDecoded!.split("\r\n\r\n");
      // There must NOT be a Cc header at all
      const ccLine = headersSection!.split("\r\n").find(l => l.startsWith("Cc:"));
      expect(ccLine).toBeUndefined();

      // Body must be exactly what we passed — no MIME headers leaking in
      expect(bodySection).toBe("Body");
    });

    it("does NOT contain 'Subject:', 'Content-Type:', or 'MIME-Version:' in the body", async () => {
      const { rawDecoded } = await captureGmailRequest(() =>
        sendEmail("token-123", ["to@x.com"], "My Subject", "My body content", [])
      );

      const [, bodySection] = rawDecoded!.split("\r\n\r\n");
      expect(bodySection).not.toContain("Subject:");
      expect(bodySection).not.toContain("Content-Type:");
      expect(bodySection).not.toContain("MIME-Version:");
    });

    it("body contains ONLY the body text (no leaked headers) even with unicode subject", async () => {
      const { rawDecoded } = await captureGmailRequest(() =>
        sendEmail("token-123", ["to@x.com"], "Demo: Träck", "Hello label, please check my demo.")
      );

      const [, bodySection] = rawDecoded!.split("\r\n\r\n");
      expect(bodySection).toBe("Hello label, please check my demo.");
    });
  });

  describe("sendReplyInThread — same MIME structure rules", () => {
    it("does not insert empty headers when cc, inReplyTo, references are all absent", async () => {
      const { rawDecoded } = await captureGmailRequest(() =>
        sendReplyInThread("token-123", {
          to: ["to@x.com"],
          subject: "Re: Demo Submission",
          body: "Reply body",
        })
      );

      const [headersSection, bodySection] = rawDecoded!.split("\r\n\r\n");
      const headerLines = headersSection!.split("\r\n");

      // Every header line must be non-empty
      for (const line of headerLines) {
        expect(line.length).toBeGreaterThan(0);
        expect(line).toMatch(/^[A-Za-z-]+: .+/);
      }

      // No Cc / In-Reply-To / References headers expected
      expect(headerLines.find(l => l.startsWith("Cc:"))).toBeUndefined();
      expect(headerLines.find(l => l.startsWith("In-Reply-To:"))).toBeUndefined();
      expect(headerLines.find(l => l.startsWith("References:"))).toBeUndefined();

      // Body must be exactly what we passed
      expect(bodySection).toBe("Reply body");
    });

    it("includes In-Reply-To and References headers when inReplyToMessageId is set", async () => {
      const { rawDecoded } = await captureGmailRequest(() =>
        sendReplyInThread("token-123", {
          to: ["to@x.com"],
          subject: "Re: Demo",
          body: "Reply body",
          inReplyToMessageId: "abc123@sender.com",
        })
      );

      const [headersSection] = rawDecoded!.split("\r\n\r\n");
      const headerLines = headersSection!.split("\r\n");
      expect(headerLines.find(l => l === "In-Reply-To: <abc123@sender.com>")).toBeDefined();
      expect(headerLines.find(l => l.startsWith("References: <abc123@sender.com>"))).toBeDefined();
    });

    it("produces exactly one \\r\\n\\r\\n separator", async () => {
      const { rawDecoded } = await captureGmailRequest(() =>
        sendReplyInThread("token-123", {
          to: ["to@x.com"],
          subject: "Re: Demo",
          body: "Reply body",
          cc: ["cc@x.com"],
          inReplyToMessageId: "abc@x.com",
          references: "<abc@x.com> <def@x.com>",
        })
      );

      const separatorCount = (rawDecoded!.match(/\r\n\r\n/g) || []).length;
      expect(separatorCount).toBe(1);
    });
  });

  describe("sendEmail — error handling", () => {
    it("returns success: true with messageId when Gmail API responds 200", async () => {
      const result = await captureGmailRequest(() =>
        sendEmail("token", ["to@x.com"], "Subject", "Body")
      );
      expect(result.response.success).toBe(true);
      expect(result.response.messageId).toBe("msg-1");
    });

    it("returns success: false with error message when Gmail API responds 401", async () => {
      const origFetch = global.fetch;
      global.fetch = vi.fn(async () =>
        new Response(JSON.stringify({ error: { message: "Invalid Credentials" } }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        })
      ) as any;
      try {
        const result = await sendEmail("bad-token", ["to@x.com"], "Subject", "Body");
        expect(result.success).toBe(false);
        expect(result.error).toBe("Invalid Credentials");
      } finally {
        global.fetch = origFetch;
      }
    });
  });
});
