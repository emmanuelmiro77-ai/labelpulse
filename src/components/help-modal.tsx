"use client";

import { useAppStore } from "@/lib/store";
import { t } from "@/lib/i18n";
import {
  LayoutDashboard,
  Music2,
  Send,
  PenTool,
  Target,
  TrendingUp,
  Layers,
  Lightbulb,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface HelpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HelpModal({ open, onOpenChange }: HelpModalProps) {
  const { locale } = useAppStore();

  const sections = [
    {
      icon: <LayoutDashboard className="h-5 w-5 text-primary" />,
      title: t(locale, "help.dashboard"),
      desc: t(locale, "help.dashboardDesc"),
    },
    {
      icon: <Music2 className="h-5 w-5 text-cyan-400" />,
      title: t(locale, "help.labelsSection"),
      desc: t(locale, "help.labelsDesc"),
    },
    {
      icon: <Send className="h-5 w-5 text-amber-400" />,
      title: t(locale, "help.demosSection"),
      desc: t(locale, "help.demosDesc"),
    },
    {
      icon: <PenTool className="h-5 w-5 text-emerald-400" />,
      title: t(locale, "help.pitchSection"),
      desc: t(locale, "help.pitchDesc"),
    },
    {
      icon: <Target className="h-5 w-5 text-purple-400" />,
      title: t(locale, "help.smartMatchSection"),
      desc: t(locale, "help.smartMatchDesc"),
    },
    {
      icon: <Layers className="h-5 w-5 text-blue-400" />,
      title: t(locale, "help.tiersSection"),
      desc: t(locale, "help.tiersDesc"),
    },
    {
      icon: <TrendingUp className="h-5 w-5 text-orange-400" />,
      title: t(locale, "help.trendingSection"),
      desc: t(locale, "help.trendingDesc"),
    },
  ];

  const tips = [
    t(locale, "help.tip1"),
    t(locale, "help.tip2"),
    t(locale, "help.tip3"),
    t(locale, "help.tip4"),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-card border-border/50 max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Lightbulb className="h-5 w-5 text-amber-400" />
            {t(locale, "help.title")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            {t(locale, "help.intro")}
          </p>

          {/* Feature sections */}
          <div className="space-y-3">
            {sections.map((s, i) => (
              <div
                key={i}
                className="flex gap-3 p-3 rounded-lg bg-secondary/30 border border-border/20"
              >
                <div className="shrink-0 mt-0.5">{s.icon}</div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">
                    {s.title}
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {s.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Tips */}
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
            <h4 className="text-sm font-semibold text-primary flex items-center gap-2 mb-2">
              <Lightbulb className="h-4 w-4" />
              {t(locale, "help.tipsSection")}
            </h4>
            <ul className="space-y-1.5">
              {tips.map((tip, i) => (
                <li key={i} className="text-xs text-muted-foreground flex gap-2">
                  <span className="text-primary font-bold">{i + 1}.</span>
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
