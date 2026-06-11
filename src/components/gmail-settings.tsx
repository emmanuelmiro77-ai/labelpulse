"use client"

import { useAppStore } from "@/lib/store"
import { t } from "@/lib/i18n"
import { Mail, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export function GmailSettings() {
  const locale = useAppStore((s) => s.locale)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-muted-foreground hover:text-foreground hover:text-cyan-400"
          title={t(locale, "gmail.emailOptions")}
        >
          <Mail className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-4" align="end">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-cyan-400" />
            <span className="text-sm font-medium text-foreground">
              {t(locale, "gmail.emailOptions")}
            </span>
          </div>
          <p className="text-xs text-muted-foreground/70 leading-relaxed">
            {t(locale, "gmail.clientSideDesc")}
          </p>
          <div className="space-y-2 pt-1">
            <div className="flex items-start gap-2 p-2 rounded-md bg-secondary/30 border border-border/20">
              <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[10px] text-emerald-400">1</span>
              </div>
              <div>
                <p className="text-xs font-medium text-foreground">Gmail Web</p>
                <p className="text-[10px] text-muted-foreground">{t(locale, "gmail.gmailWebDesc")}</p>
              </div>
            </div>
            <div className="flex items-start gap-2 p-2 rounded-md bg-secondary/30 border border-border/20">
              <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[10px] text-primary">2</span>
              </div>
              <div>
                <p className="text-xs font-medium text-foreground">mailto:</p>
                <p className="text-[10px] text-muted-foreground">{t(locale, "gmail.mailtoDesc")}</p>
              </div>
            </div>
          </div>
          <div className="flex items-start gap-2 p-2 rounded-md bg-cyan-500/10 border border-cyan-500/20">
            <Info className="h-3.5 w-3.5 text-cyan-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-cyan-300/80 leading-relaxed">
              {t(locale, "gmail.autoTrack")}
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
