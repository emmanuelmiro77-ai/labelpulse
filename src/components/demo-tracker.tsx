"use client";

import { useAppStore, type Demo, type DemoStatus } from "@/lib/store";
import { t } from "@/lib/i18n";
import { useState, useMemo } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Clock,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Headphones,
  Send,
  Disc3,
  AlertTriangle,
  Search,
  Music,
  Eye,
  Mail,
  Link2,
  Calendar,
  User,
  FileText,
  Music2,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label as UILabel } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const STATUS_KEYS: DemoStatus[] = [
  "ready",
  "sent",
  "reviewing",
  "accepted",
  "rejected",
];

const STATUS_ICONS: Record<DemoStatus, React.ReactNode> = {
  ready: <Disc3 className="h-3.5 w-3.5" />,
  sent: <Send className="h-3.5 w-3.5" />,
  reviewing: <Headphones className="h-3.5 w-3.5" />,
  accepted: <CheckCircle2 className="h-3.5 w-3.5" />,
  rejected: <XCircle className="h-3.5 w-3.5" />,
};

const STATUS_COLORS: Record<
  DemoStatus,
  { color: string; bgColor: string; borderColor: string }
> = {
  ready: { color: "text-gray-400", bgColor: "bg-gray-500/10", borderColor: "border-gray-500/20" },
  sent: { color: "text-purple-400", bgColor: "bg-purple-500/10", borderColor: "border-purple-500/20" },
  reviewing: { color: "text-cyan-400", bgColor: "bg-cyan-500/10", borderColor: "border-cyan-500/20" },
  accepted: { color: "text-emerald-400", bgColor: "bg-emerald-500/10", borderColor: "border-emerald-500/20" },
  rejected: { color: "text-red-400", bgColor: "bg-red-500/10", borderColor: "border-red-500/20" },
};

const STATUS_FLOW: DemoStatus[] = ["ready", "sent", "reviewing", "accepted"];

function getDaysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

const STATUS_TKEYS: Record<DemoStatus, "demos.ready" | "demos.sent" | "demos.reviewing" | "demos.accepted" | "demos.rejected"> = {
  ready: "demos.ready",
  sent: "demos.sent",
  reviewing: "demos.reviewing",
  accepted: "demos.accepted",
  rejected: "demos.rejected",
};

export function DemoTracker() {
  const { labels, demos, addDemo, updateDemo, deleteDemo, advanceDemoStatus, locale, getGenres } =
    useAppStore();
  const genres = getGenres();
  const [viewMode, setViewMode] = useState<"kanban" | "table">("kanban");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingDemo, setEditingDemo] = useState<Demo | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Detail dialog
  const [detailDemo, setDetailDemo] = useState<Demo | null>(null);

  // Label history view
  const [labelHistoryId, setLabelHistoryId] = useState<string | null>(null);

  const [formTrackName, setFormTrackName] = useState("");
  const [formLabelId, setFormLabelId] = useState("");
  const [formStatus, setFormStatus] = useState<DemoStatus>("ready");
  const [formSentDate, setFormSentDate] = useState("");
  const [formLink, setFormLink] = useState("");
  const [formNotes, setFormNotes] = useState("");

  const filteredDemos = useMemo(() => {
    return demos.filter((d) => {
      const matchSearch =
        !search ||
        d.trackName.toLowerCase().includes(search.toLowerCase()) ||
        d.notes.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || d.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [demos, search, statusFilter]);

  // Label history: all demos for a specific label
  const labelHistoryDemos = useMemo(() => {
    if (!labelHistoryId) return [];
    return demos
      .filter((d) => d.labelId === labelHistoryId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [demos, labelHistoryId]);

  const labelHistoryName = useMemo(() => {
    if (!labelHistoryId) return "";
    return labels.find((l) => l.id === labelHistoryId)?.name ?? "";
  }, [labels, labelHistoryId]);

  const getLabelName = (labelId: string) => {
    return labels.find((l) => l.id === labelId)?.name ?? "—";
  };

  const resetForm = () => {
    setFormTrackName("");
    setFormLabelId("");
    setFormStatus("ready");
    setFormSentDate("");
    setFormLink("");
    setFormNotes("");
  };

  const openAdd = () => { resetForm(); setEditingDemo(null); setShowAddDialog(true); };

  const openEdit = (demo: Demo) => {
    setFormTrackName(demo.trackName);
    setFormLabelId(demo.labelId);
    setFormStatus(demo.status);
    setFormSentDate(demo.sentDate ?? "");
    setFormLink(demo.link);
    setFormNotes(demo.notes);
    setEditingDemo(demo);
    setShowAddDialog(true);
  };

  const handleSave = () => {
    if (!formTrackName.trim() || !formLabelId) return;
    const data = {
      trackName: formTrackName.trim(),
      labelId: formLabelId,
      status: formStatus,
      sentDate: formSentDate || null,
      link: formLink.trim(),
      notes: formNotes.trim(),
      pitchText: editingDemo?.pitchText || "",
      artistName: editingDemo?.artistName || "",
    };
    if (editingDemo) { updateDemo(editingDemo.id, data); }
    else { addDemo(data); }
    setShowAddDialog(false);
    resetForm();
  };

  const canAdvance = (status: DemoStatus) => STATUS_FLOW.indexOf(status) < STATUS_FLOW.length - 1;

  // If viewing label history, show that instead
  if (labelHistoryId) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setLabelHistoryId(null)} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            {t(locale, "demos.backToTracker")}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Music2 className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-bold text-foreground">{labelHistoryName}</h3>
          <Badge variant="secondary" className="text-[10px]">{labelHistoryDemos.length} {t(locale, "demos.submissions")}</Badge>
        </div>

        {labelHistoryDemos.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Music className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">{t(locale, "demos.noDemos")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {labelHistoryDemos.map((demo) => {
              const config = STATUS_COLORS[demo.status];
              const daysSince = getDaysSince(demo.sentDate);
              return (
                <Card
                  key={demo.id}
                  className="bg-card/80 border-border/30 hover:border-primary/30 transition-all cursor-pointer"
                  onClick={() => setDetailDemo(demo)}
                >
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-semibold text-foreground">{demo.trackName}</h4>
                          <Badge variant="outline" className={`${config.bgColor} ${config.color} ${config.borderColor} text-[10px]`}>
                            {STATUS_ICONS[demo.status]}
                            <span className="ml-1">{t(locale, STATUS_TKEYS[demo.status])}</span>
                          </Badge>
                          {demo.artistName && (
                            <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-0.5">
                              <User className="h-2.5 w-2.5" /> {demo.artistName}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[11px] text-muted-foreground">
                          {demo.sentDate && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" /> {demo.sentDate}
                              {daysSince !== null && <span className="ml-0.5">({daysSince}{t(locale, "dash.daysAgo")})</span>}
                            </span>
                          )}
                          {demo.link && (
                            <span className="flex items-center gap-1 font-mono truncate max-w-[200px]">
                              <Link2 className="h-3 w-3" /> {demo.link}
                            </span>
                          )}
                          {demo.pitchText && (
                            <span className="flex items-center gap-1 text-primary/50">
                              <FileText className="h-3 w-3" /> {t(locale, "demos.hasPitch")}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setDetailDemo(demo); }} title={t(locale, "demos.viewDetail")}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {canAdvance(demo.status) && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); advanceDemoStatus(demo.id); }} title={t(locale, "demos.advance")}>
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEdit(demo); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Detail Dialog (reused) */}
        <DemoDetailDialog demo={detailDemo} onClose={() => setDetailDemo(null)} locale={locale} getLabelName={getLabelName} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t(locale, "demos.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-secondary/50 border-border/50"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[170px] bg-secondary/50 border-border/50">
            <SelectValue placeholder={t(locale, "demos.allStatuses")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t(locale, "demos.allStatuses")}</SelectItem>
            {STATUS_KEYS.map((s) => (
              <SelectItem key={s} value={s}>
                {t(locale, STATUS_TKEYS[s])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Button variant={viewMode === "kanban" ? "default" : "outline"} size="sm" onClick={() => setViewMode("kanban")} className="text-xs">
            {t(locale, "demos.kanban")}
          </Button>
          <Button variant={viewMode === "table" ? "default" : "outline"} size="sm" onClick={() => setViewMode("table")} className="text-xs">
            {t(locale, "demos.table")}
          </Button>
        </div>
        <Button onClick={openAdd} className="glow-purple shrink-0">
          <Plus className="h-4 w-4 mr-1.5" />
          {t(locale, "demos.addDemo")}
        </Button>
      </div>

      {/* Kanban View */}
      {viewMode === "kanban" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 min-h-[400px]">
          {STATUS_KEYS.map((status) => {
            const config = STATUS_COLORS[status];
            const columnDemos = filteredDemos.filter((d) => d.status === status);
            return (
              <div key={status} className={`rounded-xl border ${config.borderColor} ${config.bgColor} p-3 space-y-2`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={config.color}>{STATUS_ICONS[status]}</span>
                  <span className={`text-xs font-semibold uppercase tracking-wider ${config.color}`}>
                    {t(locale, STATUS_TKEYS[status])}
                  </span>
                  <span className="ml-auto text-[10px] font-mono text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
                    {columnDemos.length}
                  </span>
                </div>
                {columnDemos.map((demo) => {
                  const daysSince = getDaysSince(demo.sentDate);
                  const isOverdue = (demo.status === "sent" || demo.status === "reviewing") && daysSince !== null && daysSince > 14;
                  return (
                    <Card
                      key={demo.id}
                      className={`bg-card/80 border-border/30 hover:border-primary/20 transition-all group cursor-pointer ${isOverdue ? "ring-1 ring-amber-500/40" : ""}`}
                      onClick={() => setDetailDemo(demo)}
                    >
                      <CardContent className="p-3 space-y-1.5">
                        <div className="flex items-start justify-between gap-1">
                          <h4 className="text-sm font-semibold text-foreground leading-tight">{demo.trackName}</h4>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); setDetailDemo(demo); }} title={t(locale, "demos.viewDetail")}>
                              <Eye className="h-3 w-3" />
                            </Button>
                            {canAdvance(demo.status) && (
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); advanceDemoStatus(demo.id); }} title={t(locale, "demos.advance")}>
                                <ChevronRight className="h-3 w-3" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); openEdit(demo); }}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 hover:text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(demo.id); }}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <p
                          className="text-xs text-primary/70 font-medium cursor-pointer hover:underline"
                          onClick={(e) => { e.stopPropagation(); setLabelHistoryId(demo.labelId); }}
                        >
                          {getLabelName(demo.labelId)}
                        </p>
                        {demo.sentDate && (
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span>{demo.sentDate}{daysSince !== null && <span className={isOverdue ? "text-amber-400 font-semibold ml-1" : "ml-1"}>({daysSince}{t(locale, "dash.daysAgo")})</span>}</span>
                          </div>
                        )}
                        {demo.pitchText && (
                          <div className="flex items-center gap-1 text-[10px] text-primary/50">
                            <FileText className="h-2.5 w-2.5" /> {t(locale, "demos.hasPitch")}
                          </div>
                        )}
                        {isOverdue && (
                          <div className="flex items-center gap-1 text-[11px] text-amber-400 font-medium">
                            <AlertTriangle className="h-3 w-3" />
                            {t(locale, "demos.followUp")}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
                {columnDemos.length === 0 && <div className="text-center py-6 text-muted-foreground/40 text-xs">—</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* Table View */}
      {viewMode === "table" && (
        <div className="rounded-xl border border-border/40 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/30">
                <tr className="text-left text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">{t(locale, "demos.trackName")}</th>
                  <th className="px-4 py-3">{t(locale, "demos.targetLabel")}</th>
                  <th className="px-4 py-3">{t(locale, "labels.status")}</th>
                  <th className="px-4 py-3">{t(locale, "demos.sentDate")}</th>
                  <th className="px-4 py-3">{t(locale, "demos.daysSince")}</th>
                  <th className="px-4 py-3 text-right">{t(locale, "demos.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {filteredDemos.map((demo) => {
                  const config = STATUS_COLORS[demo.status];
                  const daysSince = getDaysSince(demo.sentDate);
                  const isOverdue = (demo.status === "sent" || demo.status === "reviewing") && daysSince !== null && daysSince > 14;
                  return (
                    <tr
                      key={demo.id}
                      className="hover:bg-secondary/20 transition-colors cursor-pointer"
                      onClick={() => setDetailDemo(demo)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{demo.trackName}</div>
                        {demo.artistName && <div className="text-[10px] text-muted-foreground/60 mt-0.5">{demo.artistName}</div>}
                        {demo.notes && <div className="text-[11px] text-muted-foreground/60 mt-0.5 line-clamp-1">{demo.notes}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="text-primary/80 text-xs font-medium cursor-pointer hover:underline"
                          onClick={(e) => { e.stopPropagation(); setLabelHistoryId(demo.labelId); }}
                        >
                          {getLabelName(demo.labelId)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={`${config.bgColor} ${config.color} ${config.borderColor}`}>
                          {STATUS_ICONS[demo.status]}
                          <span className="ml-1">{t(locale, STATUS_TKEYS[demo.status])}</span>
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{demo.sentDate ?? "—"}</td>
                      <td className="px-4 py-3 text-xs font-mono">
                        {daysSince !== null ? (
                          <span className={isOverdue ? "text-amber-400 font-semibold" : "text-muted-foreground"}>
                            {daysSince}{t(locale, "dash.daysAgo")}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setDetailDemo(demo); }} title={t(locale, "demos.viewDetail")}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {canAdvance(demo.status) && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); advanceDemoStatus(demo.id); }} title={t(locale, "demos.advance")}>
                              <ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEdit(demo); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(demo.id); }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredDemos.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                    <Music className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">{t(locale, "demos.noDemos")}</p>
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail Dialog */}
      <DemoDetailDialog demo={detailDemo} onClose={() => setDetailDemo(null)} locale={locale} getLabelName={getLabelName} />

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md bg-card border-border/50">
          <DialogHeader>
            <DialogTitle>{editingDemo ? t(locale, "demos.editDemo") : t(locale, "demos.addDemo")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <UILabel className="text-xs font-mono uppercase text-muted-foreground">{t(locale, "demos.trackName")}</UILabel>
              <Input value={formTrackName} onChange={(e) => setFormTrackName(e.target.value)} placeholder="e.g. Midnight Drive" className="bg-secondary/50" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <UILabel className="text-xs font-mono uppercase text-muted-foreground">{t(locale, "demos.targetLabel")}</UILabel>
                <Select value={formLabelId} onValueChange={setFormLabelId}>
                  <SelectTrigger className="bg-secondary/50"><SelectValue placeholder={t(locale, "demos.selectLabel")} /></SelectTrigger>
                  <SelectContent>
                    {labels.filter((l) => l.status === "open").slice(0, 50).map((l) => (
                      <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <UILabel className="text-xs font-mono uppercase text-muted-foreground">{t(locale, "labels.status")}</UILabel>
                <Select value={formStatus} onValueChange={(v) => setFormStatus(v as DemoStatus)}>
                  <SelectTrigger className="bg-secondary/50"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_KEYS.map((s) => (<SelectItem key={s} value={s}>{t(locale, STATUS_TKEYS[s])}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <UILabel className="text-xs font-mono uppercase text-muted-foreground">{t(locale, "demos.scLink")}</UILabel>
              <Input value={formLink} onChange={(e) => setFormLink(e.target.value)} placeholder="https://soundcloud.com/..." className="bg-secondary/50" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <UILabel className="text-xs font-mono uppercase text-muted-foreground">{t(locale, "demos.dateSent")}</UILabel>
                <Input type="date" value={formSentDate} onChange={(e) => setFormSentDate(e.target.value)} className="bg-secondary/50" />
              </div>
            </div>
            <div className="space-y-1.5">
              <UILabel className="text-xs font-mono uppercase text-muted-foreground">{t(locale, "labels.notes")}</UILabel>
              <Textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="BPM, key..." rows={2} className="bg-secondary/50 resize-none" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAddDialog(false)}>{t(locale, "labels.cancel")}</Button>
            <Button onClick={handleSave} disabled={!formTrackName.trim() || !formLabelId}>
              {editingDemo ? t(locale, "labels.update") : t(locale, "labels.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent className="sm:max-w-sm bg-card border-border/50">
          <DialogHeader><DialogTitle>{t(locale, "demos.deleteConfirm")}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{t(locale, "demos.deleteConfirmMsg")}</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteConfirmId(null)}>{t(locale, "labels.cancel")}</Button>
            <Button variant="destructive" onClick={() => { if (deleteConfirmId) { deleteDemo(deleteConfirmId); setDeleteConfirmId(null); } }}>
              {t(locale, "labels.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== DETAIL DIALOG COMPONENT ====================

function DemoDetailDialog({
  demo,
  onClose,
  locale,
  getLabelName,
}: {
  demo: Demo | null;
  onClose: () => void;
  locale: string;
  getLabelName: (id: string) => string;
}) {
  if (!demo) return null;

  const config = STATUS_COLORS[demo.status];
  const daysSince = getDaysSince(demo.sentDate);
  const labelName = getLabelName(demo.labelId);

  return (
    <Dialog open={!!demo} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-2xl bg-card border-border/50 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <Music className="h-5 w-5 text-primary" />
            <span>{demo.trackName}</span>
            <Badge variant="outline" className={`${config.bgColor} ${config.color} ${config.borderColor} text-[10px]`}>
              {STATUS_ICONS[demo.status]}
              <span className="ml-1">{t(locale, STATUS_TKEYS[demo.status])}</span>
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Key info grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-secondary/30 rounded-lg p-3">
              <p className="text-[10px] text-muted-foreground uppercase flex items-center gap-1"><Music2 className="h-3 w-3" /> {t(locale, "demos.targetLabel")}</p>
              <p className="text-sm font-semibold text-primary mt-1 truncate">{labelName}</p>
            </div>
            {demo.sentDate && (
              <div className="bg-secondary/30 rounded-lg p-3">
                <p className="text-[10px] text-muted-foreground uppercase flex items-center gap-1"><Calendar className="h-3 w-3" /> {t(locale, "demos.sentDate")}</p>
                <p className="text-sm font-semibold text-foreground mt-1">{demo.sentDate}</p>
                {daysSince !== null && <p className="text-[10px] text-muted-foreground mt-0.5">{daysSince} {t(locale, "dash.daysAgo")}</p>}
              </div>
            )}
            {demo.artistName && (
              <div className="bg-secondary/30 rounded-lg p-3">
                <p className="text-[10px] text-muted-foreground uppercase flex items-center gap-1"><User className="h-3 w-3" /> {t(locale, "pitch.artistName")}</p>
                <p className="text-sm font-semibold text-foreground mt-1 truncate">{demo.artistName}</p>
              </div>
            )}
            <div className="bg-secondary/30 rounded-lg p-3">
              <p className="text-[10px] text-muted-foreground uppercase">{t(locale, "labels.status")}</p>
              <p className={`text-sm font-bold mt-1 ${config.color}`}>{t(locale, STATUS_TKEYS[demo.status])}</p>
            </div>
          </div>

          {/* SoundCloud Link */}
          {demo.link && (
            <div className="space-y-1.5">
              <UILabel className="text-xs font-mono uppercase text-muted-foreground flex items-center gap-1">
                <Link2 className="h-3 w-3" /> {t(locale, "pitch.scLink")}
              </UILabel>
              <a href={demo.link} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline font-mono break-all">
                {demo.link}
              </a>
            </div>
          )}

          {/* Notes */}
          {demo.notes && (
            <div className="space-y-1.5">
              <UILabel className="text-xs font-mono uppercase text-muted-foreground">{t(locale, "labels.notes")}</UILabel>
              <p className="text-sm text-foreground/80">{demo.notes}</p>
            </div>
          )}

          {/* Pitch text (the email that was sent) */}
          {demo.pitchText && (
            <div className="space-y-2 border-t border-border/30 pt-3">
              <UILabel className="text-xs font-mono uppercase text-muted-foreground flex items-center gap-1">
                <FileText className="h-3 w-3" /> {t(locale, "demos.pitchSent")}
              </UILabel>
              <Card className="bg-card/80 border-border/30">
                <CardContent className="p-4 max-h-[350px] overflow-y-auto">
                  <pre className="text-[11px] leading-relaxed whitespace-pre-wrap font-mono text-foreground/80">{demo.pitchText}</pre>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Creation date */}
          <div className="text-[10px] text-muted-foreground/40 font-mono pt-1">
            {t(locale, "demos.createdOn")} {new Date(demo.createdAt).toLocaleString(locale === "it" ? "it-IT" : locale === "es" ? "es-ES" : locale === "fr" ? "fr-FR" : locale === "de" ? "de-DE" : locale === "pt" ? "pt-PT" : "en-US")}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t(locale, "labels.close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
