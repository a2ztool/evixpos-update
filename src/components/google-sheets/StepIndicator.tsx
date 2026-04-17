import { Check, KeyRound, Link2, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: 1, label: "Credentials", icon: KeyRound, hint: "Service Account" },
  { id: 2, label: "Sheet Setup", icon: Link2, hint: "Spreadsheet & Tab" },
  { id: 3, label: "Field Mapping", icon: ListChecks, hint: "Columns to sync" },
];

interface Props {
  currentStep: number;
  maxStep: number;
  onStepClick?: (s: number) => void;
}

export const StepIndicator = ({ currentStep, maxStep, onStepClick }: Props) => {
  return (
    <div className="relative">
      <div className="absolute top-5 left-0 right-0 h-0.5 bg-border -z-0">
        <div
          className="h-full bg-gradient-to-r from-primary to-emerald-500 transition-all duration-500"
          style={{ width: `${((currentStep - 1) / (STEPS.length - 1)) * 100}%` }}
        />
      </div>
      <div className="relative grid grid-cols-3 gap-2">
        {STEPS.map((s) => {
          const Icon = s.icon;
          const isActive = currentStep === s.id;
          const isDone = currentStep > s.id;
          const canClick = s.id <= maxStep && onStepClick;
          return (
            <button
              key={s.id}
              type="button"
              disabled={!canClick}
              onClick={() => canClick && onStepClick?.(s.id)}
              className={cn(
                "flex flex-col items-center gap-2 group",
                canClick ? "cursor-pointer" : "cursor-default"
              )}
            >
              <div
                className={cn(
                  "h-10 w-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 bg-background shadow-sm",
                  isDone && "bg-gradient-to-br from-primary to-emerald-600 border-transparent text-primary-foreground shadow-md shadow-primary/20",
                  isActive && !isDone && "border-primary text-primary scale-110 shadow-lg shadow-primary/20 ring-4 ring-primary/10",
                  !isActive && !isDone && "border-border text-muted-foreground"
                )}
              >
                {isDone ? <Check className="h-5 w-5" /> : <Icon className="h-4 w-4" />}
              </div>
              <div className="text-center">
                <div className={cn(
                  "text-xs font-semibold",
                  isActive || isDone ? "text-foreground" : "text-muted-foreground"
                )}>{s.label}</div>
                <div className="text-[10px] text-muted-foreground hidden sm:block">{s.hint}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
