import { LucideIcon, Lightbulb } from "lucide-react";

interface GuideStep {
  icon?: LucideIcon;
  title: string;
  desc: string;
}

interface BotGuidePanelProps {
  title: string;
  subtitle?: string;
  steps: GuideStep[];
  accent?: "indigo" | "emerald" | "amber" | "violet" | "rose" | "sky";
  tip?: string;
}

const accentMap: Record<string, { from: string; to: string; iconBg: string; ring: string }> = {
  indigo: { from: "from-indigo-500/10", to: "to-violet-500/5", iconBg: "from-indigo-500 to-violet-600", ring: "border-indigo-500/20" },
  emerald: { from: "from-emerald-500/10", to: "to-teal-500/5", iconBg: "from-emerald-500 to-teal-600", ring: "border-emerald-500/20" },
  amber: { from: "from-amber-500/10", to: "to-orange-500/5", iconBg: "from-amber-500 to-orange-600", ring: "border-amber-500/20" },
  violet: { from: "from-violet-500/10", to: "to-fuchsia-500/5", iconBg: "from-violet-500 to-fuchsia-600", ring: "border-violet-500/20" },
  rose: { from: "from-rose-500/10", to: "to-pink-500/5", iconBg: "from-rose-500 to-pink-600", ring: "border-rose-500/20" },
  sky: { from: "from-sky-500/10", to: "to-cyan-500/5", iconBg: "from-sky-500 to-cyan-600", ring: "border-sky-500/20" },
};

const BotGuidePanel = ({ title, subtitle, steps, accent = "indigo", tip }: BotGuidePanelProps) => {
  const c = accentMap[accent];
  return (
    <div className={`rounded-2xl border ${c.ring} bg-gradient-to-br ${c.from} via-card ${c.to} p-5 backdrop-blur-sm`}>
      <div className="flex items-center gap-2.5 mb-4">
        <div className={`h-9 w-9 rounded-xl bg-gradient-to-br ${c.iconBg} flex items-center justify-center shadow-md`}>
          <Lightbulb className="h-4.5 w-4.5 text-white" />
        </div>
        <div>
          <div className="text-sm font-semibold tracking-tight">{title}</div>
          {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
        </div>
      </div>
      <div className="space-y-2.5">
        {steps.map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={i} className="flex items-start gap-3 rounded-lg bg-background/50 border border-border/40 px-3 py-2.5">
              <div className="h-6 w-6 rounded-md bg-gradient-to-br from-primary/15 to-primary/5 text-primary text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {Icon && <Icon className="h-3 w-3 text-muted-foreground" />}
                  <div className="text-xs font-semibold">{s.title}</div>
                </div>
                <div className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">{s.desc}</div>
              </div>
            </div>
          );
        })}
      </div>
      {tip && (
        <div className="mt-3 text-[11px] text-muted-foreground bg-background/40 border border-dashed border-border/60 rounded-lg px-3 py-2">
          💡 <span className="font-medium text-foreground">Pro tip:</span> {tip}
        </div>
      )}
    </div>
  );
};

export default BotGuidePanel;
