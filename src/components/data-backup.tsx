"use client";

import { useAppStore } from "@/lib/store";
import { t } from "@/lib/i18n";
import { useState, useRef } from "react";
import { Download, Upload, Database, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";

export function DataBackup() {
  const { locale, exportData, importData } = useAppStore();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importWarning, setImportWarning] = useState(false);

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
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-cyan-400" title={t(locale, "data.title")}>
          <Database className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4" align="end">
        <div className="space-y-4">
          <div className="text-sm font-semibold flex items-center gap-2">
            <Database className="h-4 w-4 text-cyan-400" />
            {t(locale, "data.title")}
          </div>

          {/* Export */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{t(locale, "data.exportDesc")}</p>
            <Button onClick={handleExport} className="w-full" size="sm">
              <Download className="h-3.5 w-3.5 mr-1.5" />
              {t(locale, "data.exportButton")}
            </Button>
          </div>

          <div className="border-t border-border/30" />

          {/* Import */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{t(locale, "data.importDesc")}</p>
            {importWarning && (
              <div className="flex items-start gap-2 p-2 rounded-md bg-amber-500/10 border border-amber-500/30">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-400">{t(locale, "data.importDesc")}</p>
              </div>
            )}
            <Button
              onClick={handleImportClick}
              variant={importWarning ? "destructive" : "outline"}
              className="w-full"
              size="sm"
            >
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              {importWarning ? t(locale, "data.importButton") + " (conferma)" : t(locale, "data.importButton")}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
