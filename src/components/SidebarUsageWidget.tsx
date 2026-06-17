import { useAuth } from "@/contexts/AuthContext";
import { useStaff } from "@/contexts/StaffContext";
import { useUsageLimits } from "@/hooks/useUsageLimits";
import { type VolumeStep } from "@/lib/planConfig";
import { Button } from "@/components/ui/button";
import { Zap, ExternalLink, Store } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Props {
  navigate: (path: string) => void;
  plan: string;
  volume?: VolumeStep | null;
}

const SidebarUsageWidget = ({ navigate, plan, volume }: Props) => {
  const { user } = useAuth();
  const { isStaff } = useStaff();
  const usage = useUsageLimits(plan, volume);

  if (!user || usage.loading) return null;

  const pctOf = (cur: number, max: number) => !isFinite(max) ? 0 : Math.min(100, Math.round((cur / max) * 100));
  const fmt = (n: number) => isFinite(n) ? n : "∞";
  const productPct = pctOf(usage.totalProducts, usage.maxProducts);
  const customerPct = pctOf(usage.totalCustomers, usage.maxCustomers);

  const UsageBar = ({ label, count, max, pct }: { label: string; count: number; max: number; pct: number }) => (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] font-semibold leading-none">{label}</span>
        <span className="text-[9px] font-bold text-primary tabular-nums leading-none">{isFinite(max) ? `${pct}%` : "∞"}</span>
      </div>
      <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${pct >= 90 ? "bg-destructive" : "bg-gradient-to-r from-primary to-primary/70"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[9px] text-muted-foreground mt-0.5 leading-tight">{count}/{fmt(max)}</p>
    </div>
  );

  return (
    <div className="rounded-xl bg-card border border-border/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
          <Zap className="h-3.5 w-3.5 text-primary" />
        </div>
        <div>
          <p className="text-xs font-semibold text-foreground leading-none">Plan Usage</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{plan} plan</p>
        </div>
      </div>

      <UsageBar label="Products" count={usage.totalProducts} max={usage.maxProducts} pct={productPct} />
      <UsageBar label="Customers" count={usage.totalCustomers} max={usage.maxCustomers} pct={customerPct} />

      {/* Per-store breakdown tooltip — owners only */}
      {!isStaff && usage.perStore.length > 1 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5 cursor-help text-[11px] text-muted-foreground hover:text-primary transition-colors">
                <Store className="h-3.5 w-3.5" />
                <span>{usage.totalStores} / {fmt(usage.maxStores)} stores · View breakdown</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs space-y-1 p-3 max-w-[200px]">
              {usage.perStore.map(s => (
                <div key={s.storeId} className="flex justify-between gap-3">
                  <span className="truncate font-medium">{s.storeName}</span>
                  <span className="text-muted-foreground whitespace-nowrap">{s.products}P · {s.customers}C</span>
                </div>
              ))}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {!isStaff && (
        <div className="flex items-center justify-between pt-1">
          <button onClick={() => navigate("/my-plan")} className="text-[11px] text-muted-foreground hover:text-primary transition-colors font-medium">
            Learn more
          </button>
          <Button
            size="sm"
            onClick={() => navigate("/my-plan")}
            className="h-7 px-3 text-[11px] font-semibold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
          >
            Upgrade <ExternalLink className="h-3 w-3 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default SidebarUsageWidget;
