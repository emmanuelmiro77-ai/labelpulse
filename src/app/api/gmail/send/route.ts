import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-options"

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession({ ...authOptions } as any)
    if (!(session as any)?.accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const { to, subject, body, cc } = await req.json()
    if (!to || !subject || !body) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Build RFC 2822 email
    const emailLines = [
      `To: ${to}`,
    ]
    if (cc) emailLines.push(`Cc: ${cc}`)
    emailLines.push(`Subject: =?utf-8?B?${Buffer.from(subject).toString("base64")}?=`)
    emailLines.push("Content-Type: text/plain; charset=utf-8")
    emailLines.push("MIME-Version: 1.0")
    emailLines.push("")
    emailLines.push(body)

    const email = emailLines.join("\r\n")
    const base64Email = Buffer.from(email).toString("base64url")

    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${(session as any).accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: base64Email }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error("Gmail API error:", error)
      return NextResponse.json({ error: "Failed to send email", details: error }, { status: response.status })
    }

    const result = await response.json()
    return NextResponse.json({ success: true, messageId: result.id })
  } catch (error) {
    console.error("Gmail send error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
