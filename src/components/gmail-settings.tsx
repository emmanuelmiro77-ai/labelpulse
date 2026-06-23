"use client"

import { useAppStore } from "@/lib/store"
import { t } from "@/lib/i18n"
import {
  Mail,
  Unplug,
  Check,
  Loader2,
  RefreshCw,
  Bell,
  Inbox,
  AlertCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useState, useCallback } from "react"
import { requestGmailAccess, revokeGmailAccess } from "@/lib/gmail"
import { useToast } from "@/hooks/use-toast"
import {
  REPLY_CATEGORY_LABELS,
  type ReplyClassification,
} from "@/lib/reply-classifier"

function formatRelativeTime(iso: string | null, locale: string): string {
  if (!iso) return ""
  const date = new Date(iso)
  const diffMs = Date.now() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffH = Math.floor(diffMin / 60)
  const diffD = Math.floor(diffH / 24)

  if (locale === "it") {
    if (diffMin < 1) return "adesso"
    if (diffMin < 60) return `${diffMin} min fa`
    if (diffH < 24) return `${diffH} h fa`
    if (diffD < 7) return `${diffD} g fa`
    return date.toLocaleDateString("it-IT", { day: "numeric", month: "short" })
  }
  if (diffMin < 1) return "now"
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffH < 24) return `${diffH}h ago`
  if (diffD < 7) return `${diffD}d ago`
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short" })
}

export function GmailSettings() {
  const locale = useAppStore((s) => s.locale)
  const gmailAuth = useAppStore((s) => s.gmailAuth)
  const setGmailAuth = useAppStore((s) => s.setGmailAuth)
  const clearGmailAuth = useAppStore((s) => s.clearGmailAuth)
  const lastReplyScanAt = useAppStore((s) => s.lastReplyScanAt)
  const newRepliesCount = useAppStore((s) => s.newRepliesCount)
  const scanGmailReplies = useAppStore((s) => s.scanGmailReplies)
  const demos = useAppStore((s) => s.demos)

  const [connecting, setConnecting] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState<{ done: number; total: number } | null>(null)
  const [lastScanSummary, setLastScanSummary] = useState<{
    scanned: number
    newReplies: number
    errors: number
    details: Array<{
      demoId: string
      trackName: string
      category: ReplyClassification
      from: string
      date: string
    }>
  } | null>(null)
  const [errorMsg, setErrorMsg] = useState("")
  const { toast } = useToast()

  // Count demos eligible for scanning (sent + no positive/rejected reply yet)
  const eligibleDemosCount = demos.filter((d) => {
    if (d.status === "ready") return false
    if (!d.sentDate) return false
    if (d.replyStatus === "positive" || d.replyStatus === "rejected") return false
    return true
  }).length

  const handleConnect = async () => {
    setConnecting(true)
    setErrorMsg("")
    try {
      const auth = await requestGmailAccess()
      if (auth) {
        setGmailAuth(auth)
        toast({
          title: "Gmail connesso",
          description: `Autorizzato come ${auth.email || "account Gmail"}. Ora puoi scansionare le risposte alle demo.`,
        })
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

  const handleScan = useCallback(async () => {
    if (scanning) return
    setScanning(true)
    setScanProgress(null)
    setErrorMsg("")
    try {
      const result = await scanGmailReplies()
      setLastScanSummary(result)
      setScanProgress({ done: result.scanned, total: result.scanned })
      if (result.newReplies > 0) {
        toast({
          title: `${result.newReplies} nuova/e risposta/e trovata/e`,
          description: result.details
            .slice(0, 3)
            .map((d) => `• ${d.trackName} — ${REPLY_CATEGORY_LABELS[d.category as Exclude<ReplyClassification, "none">]?.it || "Non classificata"}`)
            .join("\n"),
        })
      } else if (result.scanned > 0) {
        toast({
          title: "Nessuna nuova risposta",
          description: `Scansionate ${result.scanned} demo. Le risposte arriveranno nelle prossime ore/giorni.`,
        })
      } else {
        toast({
          title: "Nessuna demo da scansionare",
          description: "Non ci sono demo inviate senza risposta.",
        })
      }
      if (result.errors > 0) {
        console.warn(`[Gmail scan] ${result.errors} errori durante la scansione`)
      }
    } catch (err: any) {
      console.error("Gmail scan failed:", err)
      setErrorMsg(`Scansione fallita: ${err.message || "errore sconosciuto"}`)
      toast({
        title: "Scansione fallita",
        description: err.message || "Riprova tra qualche secondo.",
        variant: "destructive",
      })
    } finally {
      setScanning(false)
      setTimeout(() => setScanProgress(null), 3000)
    }
  }, [scanning, scanGmailReplies, toast])

  const handleDisconnect = async () => {
    try {
      if (gmailAuth.accessToken) {
        await revokeGmailAccess(gmailAuth.accessToken)
      }
    } catch {
      // Ignore revoke errors
    }
    clearGmailAuth()
    setLastScanSummary(null)
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
          {gmailAuth.isConnected && newRepliesCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-cyan-500 text-white text-[9px] font-bold flex items-center justify-center">
              {newRepliesCount > 9 ? "9+" : newRepliesCount}
            </span>
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
                <div className="min-w-0">
                  <p className="text-xs font-medium text-emerald-300">Gmail connesso</p>
                  <p className="text-[10px] text-emerald-400/70 mt-0.5 truncate">{gmailAuth.email}</p>
                </div>
              </div>

              {/* Reply scan section */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Inbox className="h-3.5 w-3.5" />
                    <span>Scansione risposte</span>
                  </div>
                  {lastReplyScanAt && (
                    <span className="text-[10px] text-muted-foreground/70">
                      {formatRelativeTime(lastReplyScanAt, locale)}
                    </span>
                  )}
                </div>

                {eligibleDemosCount > 0 && (
                  <p className="text-[10px] text-muted-foreground/60">
                    {eligibleDemosCount} demo in attesa di risposta
                  </p>
                )}

                {newRepliesCount > 0 && (
                  <div className="flex items-center gap-2 p-2 rounded-md bg-cyan-500/10 border border-cyan-500/30">
                    <Bell className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                    <p className="text-xs text-cyan-300">
                      <span className="font-bold">{newRepliesCount}</span> nuova/e risposta/e rilevata/e
                    </p>
                  </div>
                )}

                <Button
                  onClick={handleScan}
                  className="w-full"
                  size="sm"
                  disabled={scanning || eligibleDemosCount === 0}
                >
                  {scanning ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      {scanProgress
                        ? `Scansione... (${scanProgress.done}/${scanProgress.total})`
                        : "Scansione in corso..."}
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                      Scansiona risposte ora
                    </>
                  )}
                </Button>

                {/* Last scan summary */}
                {lastScanSummary && lastScanSummary.newReplies > 0 && (
                  <div className="space-y-1 pt-1 max-h-32 overflow-y-auto">
                    <p className="text-[10px] text-muted-foreground/70 font-medium">
                      Ultime risposte rilevate:
                    </p>
                    {lastScanSummary.details.slice(0, 4).map((d, i) => {
                      // Narrow "none" out before indexing REPLY_CATEGORY_LABELS
                      const label = d.category !== "none" ? REPLY_CATEGORY_LABELS[d.category] : null
                      return (
                        <div
                          key={i}
                          className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-muted/30 text-[10px]"
                        >
                          <span className="truncate text-foreground/80">{d.trackName}</span>
                          {label && (
                            <span className={`shrink-0 font-medium ${label.color}`}>
                              {label.it}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {errorMsg && (
                  <div className="flex items-start gap-1.5 p-2 rounded bg-red-500/10 border border-red-500/30">
                    <AlertCircle className="h-3 w-3 text-red-400 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-red-300">{errorMsg}</p>
                  </div>
                )}
              </div>

              <div className="pt-1 border-t border-border/50">
                <Button
                  onClick={handleDisconnect}
                  variant="outline"
                  className="w-full text-xs"
                  size="sm"
                >
                  <Unplug className="h-3 w-3 mr-1.5" />
                  Disconnetti Gmail
                </Button>
              </div>
            </>
          ) : (
            <>
              {/* Disconnected state */}
              <p className="text-xs text-muted-foreground/70">
                Connetti il tuo account Gmail per inviare le demo <strong>dall'app</strong> e
                <strong> ricevere automaticamente</strong> le risposte delle label qui dentro.
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
                Permessi: invio email + lettura risposte (solo demo). Non leggiamo la tua posta privata.
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
