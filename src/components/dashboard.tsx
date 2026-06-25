"use client";

import { useAppStore, type DemoStatus } from "@/lib/store";
import { t } from "@/lib/i18n";
import { useMemo } from "react";
import {
  Music2,
  Send,
  TrendingUp,
  CheckCircle2,
  Disc3,
  BarChart3,
  Clock,
  Rocket,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const NEON_COLORS = [
  "oklch(0.65 0.25 300)",
  "oklch(0.65 0.2 180)",
  "oklch(0.75 0.18 70)",
  "oklch(0.6 0.22 330)",
  "oklch(0.65 0.2 25)",
];

const STATUS_TKEYS: Record<DemoStatus, "demos.ready" | "demos.sent" | "demos.reviewing" | "demos.accepted" | "demos.rejected"> = {
  ready: "demos.ready",
  sent: "demos.sent",
  reviewing: "demos.reviewing",
  accepted: "demos.accepted",
  rejected: "demos.rejected",
};

const STATUS_SHORT: Record<DemoStatus, string> = {
  ready: "Ready",
  sent: "Sent",
  reviewing: "Reviewing",
  accepted: "Accepted",
  rejected: "Rejected",
};

export function Dashboard() {
  const { labels, demos, locale } = useAppStore();

  const stats = useMemo(() => {
    const totalDemos = demos.length;
    const totalLabels = labels.length;
    // "open" = explicitly confirmed by the user (manual edit or demo sent).
    // "unknown" = default for seed labels — we have no signal.
    // "closed" = explicitly marked as not accepting demos.
    // See fix 2026-06-25: previously every label defaulted to "open",
    // making this counter misleading.
    const openLabels = labels.filter((l) => l.status === "open").length;
    const closedLabels = labels.filter((l) => l.status === "closed").length;
    const unknownLabels = labels.filter((l) => l.status === "unknown" || (l.status !== "open" && l.status !== "closed")).length;
    const sent = demos.filter((d) => d.status === "sent").length;
    const reviewing = demos.filter((d) => d.status === "reviewing").length;
    const accepted = demos.filter((d) => d.status === "accepted").length;
    const rejected = demos.filter((d) => d.status === "rejected").length;
    const ready = demos.filter((d) => d.status === "ready").length;
    const responded = reviewing + accepted + rejected;
    const responseRate = sent + reviewing + accepted + rejected > 0
      ? Math.round((responded / (sent + reviewing + accepted + rejected)) * 100) : 0;
    return { totalDemos, totalLabels, openLabels, closedLabels, unknownLabels, sent, reviewing, accepted, rejected, ready, responseRate };
  }, [labels, demos]);

  const pieData = useMemo(() => [
    { name: "Ready", value: stats.ready, status: "ready" as DemoStatus },
    { name: "Sent", value: stats.sent, status: "sent" as DemoStatus },
    { name: "Reviewing", value: stats.reviewing, status: "reviewing" as DemoStatus },
    { name: "Accepted", value: stats.accepted, status: "accepted" as DemoStatus },
    { name: "Rejected", value: stats.rejected, status: "rejected" as DemoStatus },
  ].filter((d) => d.value > 0), [stats]);

  const barData = useMemo(() => {
    const map = new Map<string, number>();
    demos.forEach((d) => {
      const label = labels.find((l) => l.id === d.labelId);
      const name = label?.name ?? "Unknown";
      map.set(name, (map.get(name) ?? 0) + 1);
    });
    return Array.from(map.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8);
  }, [labels, demos]);

  const overdueDemos = useMemo(() => {
    return demos.filter((d) => {
      if (!d.sentDate || (d.status !== "sent" && d.status !== "reviewing")) return false;
      const days = Math.floor((Date.now() - new Date(d.sentDate).getTime()) / 86400000);
      return days > 14;
    });
  }, [demos]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="bg-card/60 border-border/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10"><Music2 className="h-5 w-5 text-purple-400" /></div>
              <div>
                <p className="text-xs text-muted-foreground font-mono uppercase">{t(locale, "dash.labels")}</p>
                <p className="text-2xl font-bold text-foreground">{stats.totalLabels.toLocaleString()}</p>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              {stats.openLabels > 0 ? (
                <>
                  <span className="text-emerald-400">{stats.openLabels}</span> {t(locale, "dash.confirmedOpen")}
                  {stats.unknownLabels > 0 && (
                    <span className="text-muted-foreground/70"> · {stats.unknownLabels} {t(locale, "dash.unknownStatus")}</span>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground/70">{stats.unknownLabels} {t(locale, "dash.unknownStatus")}</span>
              )}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card/60 border-border/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-cyan-500/10"><Send className="h-5 w-5 text-cyan-400" /></div>
              <div>
                <p className="text-xs text-muted-foreground font-mono uppercase">{t(locale, "dash.totalDemos")}</p>
                <p className="text-2xl font-bold text-foreground">{stats.totalDemos}</p>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">{stats.ready} {t(locale, "dash.readyToSend")}</p>
          </CardContent>
        </Card>
        <Card className="bg-card/60 border-border/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10"><TrendingUp className="h-5 w-5 text-amber-400" /></div>
              <div>
                <p className="text-xs text-muted-foreground font-mono uppercase">{t(locale, "dash.responseRate")}</p>
                <p className="text-2xl font-bold text-foreground">{stats.responseRate}%</p>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">{stats.reviewing} {t(locale, "dash.underReview")}</p>
          </CardContent>
        </Card>
        <Card className="bg-card/60 border-border/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10"><CheckCircle2 className="h-5 w-5 text-emerald-400" /></div>
              <div>
                <p className="text-xs text-muted-foreground font-mono uppercase">{t(locale, "dash.accepted")}</p>
                <p className="text-2xl font-bold text-foreground">{stats.accepted}</p>
              </div>
            </div>
            <p className="text-[11px] text-red-400 mt-2">{stats.rejected} {t(locale, "dash.rejected")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Welcome card when no demos */}
      {stats.totalDemos === 0 && (
        <Card className="bg-gradient-to-br from-primary/5 via-card/60 to-purple-500/5 border-primary/20">
          <CardContent className="p-6 text-center">
            <Rocket className="h-10 w-10 text-primary mx-auto mb-3 opacity-70" />
            <h3 className="text-lg font-bold text-foreground mb-1">{t(locale, "dash.welcomeTitle")}</h3>
            <p className="text-sm text-muted-foreground mb-4">{t(locale, "dash.welcomeDesc")}</p>
            <div className="max-w-md mx-auto space-y-2 text-left">
              <p className="text-sm text-muted-foreground/80">{t(locale, "dash.welcomeStep1")}</p>
              <p className="text-sm text-muted-foreground/80">{t(locale, "dash.welcomeStep2")}</p>
              <p className="text-sm text-muted-foreground/80">{t(locale, "dash.welcomeStep3")}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="bg-card/60 border-border/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />{t(locale, "dash.statusBreakdown")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" stroke="none">
                        {pieData.map((_, i) => <Cell key={i} fill={NEON_COLORS[i % NEON_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: "oklch(0.12 0.01 280)", border: "1px solid oklch(1 0 0 / 10%)", borderRadius: "8px", fontSize: "12px", color: "oklch(0.93 0 0)" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap gap-3 mt-2 justify-center">
                  {pieData.map((entry, i) => (
                    <div key={entry.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: NEON_COLORS[i % NEON_COLORS.length] }} />
                      {entry.name} ({entry.value})
                    </div>
                  ))}
                </div>
              </>
            ) : <div className="h-[200px] flex items-center justify-center text-muted-foreground/40 text-sm">{t(locale, "dash.noData")}</div>}
          </CardContent>
        </Card>

        <Card className="bg-card/60 border-border/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />{t(locale, "dash.subsPerLabel")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {barData.length > 0 ? (
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} layout="vertical" margin={{ left: 10 }}>
                    <XAxis type="number" tick={{ fill: "oklch(0.6 0 0)", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fill: "oklch(0.7 0 0)", fontSize: 11 }} axisLine={false} tickLine={false} width={90} />
                    <Tooltip contentStyle={{ backgroundColor: "oklch(0.12 0.01 280)", border: "1px solid oklch(1 0 0 / 10%)", borderRadius: "8px", fontSize: "12px", color: "oklch(0.93 0 0)" }} />
                    <Bar dataKey="count" fill="oklch(0.65 0.25 300)" radius={[0, 4, 4, 0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <div className="h-[240px] flex items-center justify-center text-muted-foreground/40 text-sm">{t(locale, "dash.noData")}</div>}
          </CardContent>
        </Card>
      </div>

      {overdueDemos.length > 0 && (
        <Card className="bg-card/60 border-border/30 ring-1 ring-amber-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-amber-400 flex items-center gap-2">
              <Clock className="h-4 w-4" />{t(locale, "dash.overdueFollowups")} ({overdueDemos.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {overdueDemos.map((d) => {
                const label = labels.find((l) => l.id === d.labelId);
                const days = Math.floor((Date.now() - new Date(d.sentDate!).getTime()) / 86400000);
                return (
                  <div key={d.id} className="flex items-center justify-between py-1.5 text-sm">
                    <div>
                      <span className="font-medium text-foreground">{d.trackName}</span>
                      <span className="text-muted-foreground ml-2">→ {label?.name ?? "—"}</span>
                    </div>
                    <span className="text-amber-400 text-xs font-mono font-semibold">{days}{t(locale, "dash.daysAgo")}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
