import { useState } from "react";
import { ChevronDown, Lightbulb, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface GuideStep {
  title: string;
  description: string;
  link?: { label: string; url: string };
}

interface Props {
  title: string;
  steps: GuideStep[];
  defaultOpen?: boolean;
}

export const GuidePanel = ({ title, steps, defaultOpen = true }: Props) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-primary/15 bg-gradient-to-br from-primary/5 via-background to-emerald-500/5 backdrop-blur-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 hover:bg-primary/5 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-sm shadow-amber-500/30">
            <Lightbulb className="h-4 w-4 text-white" />
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold">{title}</div>
            <div className="text-xs text-muted-foreground">Quick guide & best practices</div>
          </div>
        </div>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          {steps.map((s, i) => (
            <div key={i} className="flex gap-3 p-3 rounded-lg bg-background/60 border border-border/50">
              <div className="h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{s.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{s.description}</div>
                {s.link && (
                  <a
                    href={s.link.url}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1.5 font-medium"
                  >
                    {s.link.label} <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
