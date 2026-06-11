"use client";

import { useAppStore } from "@/lib/store";
import { t } from "@/lib/i18n";
import { useState, useEffect, useCallback, useRef } from "react";
import { Save, FolderOpen, CheckCircle2, AlertCircle, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";

// IndexedDB helpers for storing FileSystemFileHandle
const IDB_NAME = "labelpulse-autosave";
const IDB_STORE = "filehandles";
const IDB_KEY = "backupHandle";

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveHandleToIDB(handle: FileSystemFileHandle): Promise<void> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(handle, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getHandleFromIDB(): Promise<FileSystemFileHandle | null> {
  try {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function removeHandleFromIDB(): Promise<void> {
  try {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}

// Write data to a file handle
async function writeToFileHandle(
  handle: FileSystemFileHandle,
  content: string
): Promise<boolean> {
  try {
    // Check if we need permission
    const perm = await handle.queryPermission({ mode: "readwrite" });
    if (perm !== "granted") {
      // Request permission (may fail without user gesture)
      const req = await handle.requestPermission({ mode: "readwrite" });
      if (req !== "granted") return false;
    }
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
    return true;
  } catch {
    return false;
  }
}

export function AutoSave() {
  const { locale, exportData } = useAppStore();
  const { toast } = useToast();
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(false);
  const [savePath, setSavePath] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const fileHandleRef = useRef<FileSystemFileHandle | null>(null);
  const exportDataRef = useRef(exportData);

  // Keep exportData ref updated
  useEffect(() => {
    exportDataRef.current = exportData;
  }, [exportData]);

  // Load saved handle on mount
  useEffect(() => {
    (async () => {
      const handle = await getHandleFromIDB();
      if (handle) {
        fileHandleRef.current = handle;
        setAutoSaveEnabled(true);
        setSavePath(handle.name);
      }
    })();
  }, []);

  // Auto-save on visibility change / beforeunload
  useEffect(() => {
    if (!autoSaveEnabled) return;

    const doAutoSave = async () => {
      const handle = fileHandleRef.current;
      if (!handle) return;
      const json = exportDataRef.current();
      const success = await writeToFileHandle(handle, json);
      if (success) {
        const now = new Date().toLocaleTimeString(locale === "it" ? "it-IT" : "en-US", { hour: "2-digit", minute: "2-digit" });
        setLastSaved(now);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        doAutoSave();
      }
    };

    const handleBeforeUnload = () => {
      // Try synchronous approach for beforeunload
      const handle = fileHandleRef.current;
      if (handle) {
        // We can't do async operations reliably in beforeunload,
        // but visibilitychange should have already saved
        doAutoSave();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [autoSaveEnabled, locale]);

  const handleChoosePath = useCallback(async () => {
    try {
      if (!("showSaveFilePicker" in window)) {
        toast({
          title: t(locale, "autosave.notSupported"),
          description: t(locale, "autosave.notSupportedDesc"),
          variant: "destructive",
        });
        return;
      }

      const handle = await (window as any).showSaveFilePicker({
        suggestedName: "labelpulse_backup.json",
        types: [
          {
            description: "JSON Backup",
            accept: { "application/json": [".json"] },
          },
        ],
      });

      fileHandleRef.current = handle;
      await saveHandleToIDB(handle);
      setAutoSaveEnabled(true);
      setSavePath(handle.name);

      // Do an initial save
      const json = exportData();
      const success = await writeToFileHandle(handle, json);
      if (success) {
        const now = new Date().toLocaleTimeString(locale === "it" ? "it-IT" : "en-US", { hour: "2-digit", minute: "2-digit" });
        setLastSaved(now);
        toast({
          title: t(locale, "autosave.configured"),
          description: t(locale, "autosave.configuredDesc"),
        });
      }
    } catch (err: any) {
      // User cancelled the picker
      if (err.name !== "AbortError") {
        toast({
          title: t(locale, "autosave.error"),
          variant: "destructive",
        });
      }
    }
  }, [locale, exportData, toast]);

  const handleManualSave = useCallback(async () => {
    const handle = fileHandleRef.current;
    if (handle) {
      const json = exportData();
      const success = await writeToFileHandle(handle, json);
      if (success) {
        const now = new Date().toLocaleTimeString(locale === "it" ? "it-IT" : "en-US", { hour: "2-digit", minute: "2-digit" });
        setLastSaved(now);
        toast({ title: t(locale, "autosave.saved") });
      } else {
        toast({ title: t(locale, "autosave.error"), variant: "destructive" });
      }
    } else {
      // No file handle configured — do a regular download
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
    }
  }, [exportData, locale, toast]);

  const handleDisable = useCallback(async () => {
    fileHandleRef.current = null;
    await removeHandleFromIDB();
    setAutoSaveEnabled(false);
    setSavePath(null);
    setLastSaved(null);
    toast({ title: t(locale, "autosave.disabled") });
  }, [locale, toast]);

  return (
    <div className="flex items-center gap-1">
      {/* Quick Save Button */}
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-emerald-400 gap-1.5 text-xs h-8 px-2"
        onClick={handleManualSave}
        title={t(locale, "autosave.saveNow")}
      >
        <Save className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{t(locale, "autosave.saveNow")}</span>
      </Button>

      {/* Auto-save Settings */}
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 ${autoSaveEnabled ? "text-emerald-400" : "text-muted-foreground hover:text-cyan-400"}`}
            title={t(locale, "autosave.title")}
          >
            <Settings2 className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-4" align="end">
          <div className="space-y-4">
            <div className="text-sm font-semibold flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-cyan-400" />
              {t(locale, "autosave.title")}
            </div>

            <p className="text-xs text-muted-foreground">
              {t(locale, "autosave.description")}
            </p>

            {autoSaveEnabled ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-2 rounded-md bg-emerald-500/10 border border-emerald-500/30">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-emerald-400 font-medium">{t(locale, "autosave.active")}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{savePath}</p>
                  </div>
                </div>
                {lastSaved && (
                  <p className="text-[10px] text-muted-foreground">
                    {t(locale, "autosave.lastSaved")} {lastSaved}
                  </p>
                )}
                <div className="flex gap-2">
                  <Button onClick={handleManualSave} size="sm" className="flex-1">
                    <Save className="h-3.5 w-3.5 mr-1.5" />
                    {t(locale, "autosave.saveNow")}
                  </Button>
                  <Button onClick={handleDisable} variant="outline" size="sm" className="text-destructive hover:text-destructive">
                    {t(locale, "autosave.disable")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {!("showSaveFilePicker" in window) ? (
                  <div className="flex items-start gap-2 p-2 rounded-md bg-amber-500/10 border border-amber-500/30">
                    <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs text-amber-400 font-medium">{t(locale, "autosave.notSupported")}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">{t(locale, "autosave.notSupportedDesc")}</p>
                    </div>
                  </div>
                ) : (
                  <Button onClick={handleChoosePath} className="w-full" size="sm">
                    <FolderOpen className="h-3.5 w-3.5 mr-1.5" />
                    {t(locale, "autosave.choosePath")}
                  </Button>
                )}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
