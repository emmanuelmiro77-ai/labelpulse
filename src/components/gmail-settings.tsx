"use client"

import { useAppStore } from "@/lib/store"
import { t } from "@/lib/i18n"
import { Mail, Unplug, Check, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useState } from "react"
import { requestGmailAccess, revokeGmailAccess } from "@/lib/gmail"

export function GmailSettings() {
  const locale = useAppStore((s) => s.locale)
  const gmailAuth = useAppStore((s) => s.gmailAuth)
  const setGmailAuth = useAppStore((s) => s.setGmailAuth)
  const clearGmailAuth = useAppStore((s) => s.clearGmailAuth)
  const [connecting, setConnecting] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")

  const handleConnect = async () => {
    setConnecting(true)
    setErrorMsg("")
    try {
      const auth = await requestGmailAccess()
      if (auth) {
        setGmailAuth(auth)
      } else {
        setErrorMsg("Connessione fallita. Verifica che l'app sia autorizzata su Google Cloud Console.")
      }
    } catch (err) {
      console.error("Gmail connection failed:", err)
      setErrorMsg("Errore di connessione. Riprova.")
    } finally {
      setConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    try {
      if (gmailAuth.accessToken) {
        await revokeGmailAccess(gmailAuth.accessToken)
      }
    } catch {
      // Ignore revoke errors
    }
    clearGmailAuth()
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`relative ${gmailAuth.isConnected ? "text-emerald-400 hover:text-emerald-300" : "text-muted-foreground hover:text-cyan-400"}`}
          title={gmailAuth.isConnected ? `Gmail: ${gmailAuth.email}` : t(locale, "gmail.emailOptions")}
        >
          <Mail className="h-4 w-4" />
          {gmailAuth.isConnected && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4" align="end">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-cyan-400" />
            <span className="text-sm font-medium text-foreground">
              {t(locale, "gmail.emailOptions")}
            </span>
          </div>

          {gmailAuth.isConnected ? (
            <>
              {/* Connected state */}
              <div className="flex items-start gap-2 p-3 rounded-md bg-emerald-500/10 border border-emerald-500/30">
                <Check className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-emerald-300">Gmail connesso</p>
                  <p className="text-[10px] text-emerald-400/70 mt-0.5">{gmailAuth.email}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground/70">
                Le email verranno inviate direttamente dalla tua casella Gmail senza aprire il browser.
              </p>
              <Button
                onClick={handleDisconnect}
                variant="outline"
                className="w-full text-xs"
                size="sm"
              >
                <Unplug className="h-3 w-3 mr-1.5" />
                Disconnetti Gmail
              </Button>
            </>
          ) : (
            <>
              {/* Disconnected state */}
              <p className="text-xs text-muted-foreground/70">
                Connetti il tuo account Gmail per inviare le email di demo direttamente dall&apos;app, senza aprire il browser.
              </p>
              <Button
                onClick={handleConnect}
                className="w-full"
                size="sm"
                disabled={connecting}
              >
                {connecting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Connessione...
                  </>
                ) : (
                  <>
                    <Mail className="h-3.5 w-3.5 mr-1.5" />
                    Connetti Gmail
                  </>
                )}
              </Button>
              <p className="text-[10px] text-muted-foreground/50 text-center">
                Richiede solo il permesso di invio email. Non leggiamo la tua posta.
              </p>
              {errorMsg && (
                <p className="text-[10px] text-red-400 text-center mt-1">
                  {errorMsg}
                </p>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
