"use client"

import { useSession, signIn, signOut } from "next-auth/react"
import { useAppStore } from "@/lib/store"
import { t } from "@/lib/i18n"
import { Mail, LogOut, LogIn } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export function GmailSettings() {
  const { data: session, status } = useSession()
  const locale = useAppStore((s) => s.locale)

  const isConnected = status === "authenticated" && session?.user

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`relative text-muted-foreground hover:text-foreground ${isConnected ? "hover:text-emerald-400" : ""}`}
          title={isConnected ? t(locale, "gmail.connected") : t(locale, "gmail.notConnected")}
        >
          <Mail className="h-5 w-5" />
          {isConnected && (
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-emerald-400 ring-1 ring-background" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-4" align="end">
        {isConnected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-sm font-medium text-emerald-400">
                {t(locale, "gmail.connected")}
              </span>
            </div>
            <p className="text-xs text-muted-foreground font-mono truncate">
              {t(locale, "gmail.as")} {session.user?.email}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="w-full border-border/50 text-muted-foreground hover:text-destructive"
              onClick={() => signOut()}
            >
              <LogOut className="h-3.5 w-3.5 mr-1.5" />
              {t(locale, "gmail.disconnect")}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">
                {t(locale, "gmail.notConnected")}
              </span>
            </div>
            <p className="text-xs text-muted-foreground/70 leading-relaxed">
              {t(locale, "gmail.connectDesc")}
            </p>
            <Button
              size="sm"
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
              onClick={() => signIn("google")}
            >
              <LogIn className="h-3.5 w-3.5 mr-1.5" />
              {t(locale, "gmail.connect")}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
