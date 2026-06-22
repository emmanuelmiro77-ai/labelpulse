"use client";

import { useAppStore } from "@/lib/store";
import { t } from "@/lib/i18n";
import { useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { Download, Upload, Database, AlertTriangle, Info, FileDown, FileUp, Save, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { RankingsWizard } from "@/components/rankings-wizard";
import { isAdminEmail } from "@/lib/supabase";

export function DataBackup() {
  const { locale, rankingsUpdatedAt, exportData, importData } = useAppStore();
  const { data: session } = useSession();
  const isAdmin = isAdminEmail(session?.user?.email as string | undefined);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importWarning, setImportWarning] = useState(false);

  // Check if rankings are stale (30+ days)
  const daysSinceRankings = rankingsUpdatedAt
    ? Math.floor((Date.now() - new Date(rankingsUpdatedAt).getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const isRankingsStale = daysSinceRankings === null || daysSinceRankings > 30;

  const handleExport = () => {
    const json = exportData();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `labelpulse_backup_${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: t(locale, "data.exportSuccess") });
  };

  const handleImportClick = () => {
    // Defense-in-depth: only admin can import Beatport data. Even if the
    // button were somehow rendered for a non-admin, block the action here.
    if (!isAdmin) {
      toast({
        title: locale === "it" ? "Operazione riservata all'admin" : "Admin-only operation",
        description: locale === "it"
          ? "Solo l'amministratore può importare dati Beatport."
          : "Only the admin can import Beatport data.",
        variant: "destructive",
      });
      return;
    }
    if (!importWarning) {
      setImportWarning(true);
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const success = importData(content);
      if (success) {
        toast({ title: t(locale, "data.importSuccess") });
        setImportWarning(false);
      } else {
        toast({ title: t(locale, "data.importError"), variant: "destructive" });
      }
    };
    reader.readAsText(file);
    // Reset input
    e.target.value = "";
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`gap-1.5 text-xs text-muted-foreground hover:text-cyan-400 relative ${isRankingsStale ? "animate-pulse" : ""}`}
          title={t(locale, "data.title")}
        >
          <Database className="h-4 w-4" />
          <span>{t(locale, "data.title")}</span>
          {isRankingsStale && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-400 rounded-full" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4 max-h-[80vh] overflow-y-auto" align="end">
        <div className="space-y-4">
          <div className="text-sm font-semibold flex items-center gap-2">
            <Database className="h-4 w-4 text-cyan-400" />
            {t(locale, "data.title")}
          </div>

          {/* Admin-only badge */}
          {isAdmin && (
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-medium text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-md px-2 py-1">
              <Lock className="h-3 w-3" />
              {locale === "it" ? "Modalità Admin" : "Admin mode"}
            </div>
          )}

          {/* Rankings Wizard — ADMIN ONLY */}
          {isAdmin ? (
            <RankingsWizard />
          ) : (
            <div className="rounded-md border border-border/40 bg-secondary/20 p-3">
              <div className="flex items-start gap-2">
                <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs font-medium text-foreground">
                    {locale === "it" ? "Aggiornamento classifiche" : "Rankings update"}
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {locale === "it"
                      ? "Le classifiche Beatport e gli artisti vengono aggiornati automaticamente dall'amministratore. Tu vedi sempre la versione più recente."
                      : "Beatport rankings and artists are updated automatically by the admin. You always see the latest version."}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="border-t border-border/30" />

          {/* Export — Download Backup (available to all users) */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <FileDown className="h-3.5 w-3.5 text-emerald-400" />
              <p className="text-xs font-medium text-foreground">{t(locale, "data.btnDownloadBackup_title")}</p>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{t(locale, "data.btnDownloadBackup_desc")}</p>
            <Button onClick={handleExport} className="w-full" size="sm" variant="outline">
              <Download className="h-3.5 w-3.5 mr-1.5" />
              {t(locale, "data.exportButton")}
            </Button>
          </div>

          <div className="border-t border-border/30" />

          {/* Import — Restore Backup: ADMIN ONLY */}
          {isAdmin ? (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <FileUp className="h-3.5 w-3.5 text-cyan-400" />
                <p className="text-xs font-medium text-foreground">{t(locale, "data.btnImportBackup_title")}</p>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">{t(locale, "data.btnImportBackup_desc")}</p>
              {importWarning && (
                <div className="flex items-start gap-2 p-2 rounded-md bg-amber-500/10 border border-amber-500/30">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-400">
                    {locale === "it"
                      ? "Conferma: i dati del file verranno uniti a quelli attuali. Le tue note/email esistenti rimangono."
                      : "Confirm: file data will be merged with current. Your existing notes/emails stay."}
                  </p>
                </div>
              )}
              <Button
                onClick={handleImportClick}
                variant={importWarning ? "default" : "outline"}
                className="w-full"
                size="sm"
              >
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                {importWarning ? t(locale, "data.importButton") + " ✓" : t(locale, "data.importButton")}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          ) : (
            <div className="rounded-md border border-border/40 bg-secondary/20 p-3">
              <div className="flex items-start gap-2">
                <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs font-medium text-foreground">
                    {locale === "it" ? "Importazione classifiche" : "Rankings import"}
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {locale === "it"
                      ? "L'importazione dei dati Beatport è riservata all'amministratore. Le classifiche che vedi sono già aggiornate all'ultima versione disponibile."
                      : "Beatport data import is admin-only. The rankings you see are already up to date."}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="border-t border-border/30" />

          {/* "What each button does" — disambiguation table */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5 text-amber-400" />
              <p className="text-xs font-medium text-foreground">{t(locale, "data.whatDoesWhat")}</p>
            </div>
            <p className="text-[11px] text-muted-foreground">{t(locale, "data.whatDoesWhatHint")}</p>

            <div className="space-y-2 mt-1">
              {/* Save (top icon) */}
              <div className="rounded-md border border-border/40 bg-secondary/30 p-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <Save className="h-3 w-3 text-emerald-400" />
                  <p className="text-[11px] font-medium text-foreground">{t(locale, "data.btnSaveFile_title")}</p>
                </div>
                <p className="text-[10px] text-muted-foreground leading-snug">{t(locale, "data.btnSaveFile_desc")}</p>
              </div>

              {/* Download Backup */}
              <div className="rounded-md border border-border/40 bg-secondary/30 p-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <FileDown className="h-3 w-3 text-cyan-400" />
                  <p className="text-[11px] font-medium text-foreground">{t(locale, "data.btnDownloadBackup_title")}</p>
                </div>
                <p className="text-[10px] text-muted-foreground leading-snug">{t(locale, "data.btnDownloadBackup_desc")}</p>
              </div>

              {/* Restore Backup */}
              <div className="rounded-md border border-border/40 bg-secondary/30 p-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <FileUp className="h-3 w-3 text-violet-400" />
                  <p className="text-[11px] font-medium text-foreground">{t(locale, "data.btnImportBackup_title")}</p>
                </div>
                <p className="text-[10px] text-muted-foreground leading-snug">{t(locale, "data.btnImportBackup_desc")}</p>
              </div>

              {/* Save changes (label dialog) */}
              <div className="rounded-md border border-border/40 bg-secondary/30 p-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <Save className="h-3 w-3 text-blue-400" />
                  <p className="text-[11px] font-medium text-foreground">{t(locale, "data.btnSaveLabel_title")}</p>
                </div>
                <p className="text-[10px] text-muted-foreground leading-snug">{t(locale, "data.btnSaveLabel_desc")}</p>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
