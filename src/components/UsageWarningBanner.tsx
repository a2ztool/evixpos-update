import { useUsageLimits } from "@/hooks/useUsageLimits";
import { useStorePlan } from "@/hooks/useStorePlan";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UsageWarningBannerProps {
  type: "products" | "customers";
}

const UsageWarningBanner = ({ type }: UsageWarningBannerProps) => {
  const { plan } = useStorePlan();
  const { totalProducts, totalCustomers, maxProducts, maxCustomers, loading } = useUsageLimits(plan);
  const { lang } = useLanguage();
  const navigate = useNavigate();

  if (loading) return null;

  const current = type === "products" ? totalProducts : totalCustomers;
  const max = type === "products" ? maxProducts : maxCustomers;
  const pct = max > 0 ? (current / max) * 100 : 0;

  if (pct < 80) return null;

  const isAtLimit = pct >= 100;
  const label = type === "products"
    ? (lang === "bn" ? "প্রোডাক্ট" : "products")
    : (lang === "bn" ? "কাস্টমার" : "customers");

  return (
    <div className={`flex items-center justify-between rounded-lg border px-4 py-3 mb-4 ${
      isAtLimit
        ? "bg-destructive/10 border-destructive/30 text-destructive"
        : "bg-amber-50 dark:bg-amber-950/30 border-amber-200/50 text-amber-800 dark:text-amber-300"
    }`}>
      <div className="flex items-center gap-2 text-sm font-medium">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {isAtLimit
          ? (lang === "bn"
            ? `আপনি ${label} লিমিটে পৌঁছে গেছেন (${current}/${max})। আপগ্রেড করুন।`
            : `You've reached your ${label} limit (${current}/${max}). Upgrade to add more.`)
          : (lang === "bn"
            ? `আপনি ${label} লিমিটের ${Math.round(pct)}% ব্যবহার করেছেন (${current}/${max})।`
            : `You've used ${Math.round(pct)}% of your ${label} limit (${current}/${max}).`)}
      </div>
      <Button
        size="sm"
        variant={isAtLimit ? "destructive" : "outline"}
        className="shrink-0 gap-1.5 text-xs"
        onClick={() => navigate("/my-plan")}
      >
        <Crown className="h-3 w-3" />
        {lang === "bn" ? "আপগ্রেড" : "Upgrade"}
      </Button>
    </div>
  );
};

export default UsageWarningBanner;
