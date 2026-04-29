import { useStorePlan, FeatureKey, FEATURE_MIN_PLAN } from "@/hooks/useStorePlan";
import { useStoreMode } from "@/hooks/useStoreMode";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Crown, Lock, MapPin, Sparkles, ArrowLeft, Check } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";

interface FeatureGateProps {
  children: React.ReactNode;
  feature: FeatureKey;
  fullPage?: boolean;
}

const FeatureGate = ({ children, feature, fullPage = true }: FeatureGateProps) => {
  const { hasFeature, loading, plan } = useStorePlan();
  const { isModeFeatureAllowed, isOffline } = useStoreMode();
  const { lang } = useLanguage();
  const navigate = useNavigate();

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </DashboardLayout>
    );
  }

  // Check store mode restriction first
  if (!isModeFeatureAllowed(feature)) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
          <div className="h-20 w-20 rounded-2xl bg-orange-500/10 flex items-center justify-center mb-6">
            <MapPin className="h-10 w-10 text-orange-500" />
          </div>
          <h2 className="text-2xl font-bold mb-2">
            {lang === "bn" ? "এই ফিচার অফলাইন স্টোরে পাওয়া যায় না" : "Not Available in Offline Mode"}
          </h2>
          <p className="text-muted-foreground mb-6 max-w-md">
            {lang === "bn"
              ? "এই ফিচারটি শুধুমাত্র অনলাইন স্টোরে ব্যবহারযোগ্য। স্টোর মোড পরিবর্তন করতে সেটিংস-এ যান।"
              : "This feature is only available for online stores. Switch your store mode in Settings to access it."}
          </p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => window.history.back()}>
              {lang === "bn" ? "ফিরে যান" : "Go Back"}
            </Button>
            <Button onClick={() => navigate("/settings?tab=stores")} className="gap-2">
              {lang === "bn" ? "সেটিংসে যান" : "Go to Settings"}
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (hasFeature(feature)) {
    return <>{children}</>;
  }

  const minPlan = FEATURE_MIN_PLAN[feature] || "pro";
  const minPlanLabel = minPlan.charAt(0).toUpperCase() + minPlan.slice(1);

  const benefits = lang === "bn"
    ? ["সব প্রিমিয়াম ফিচার আনলক", "প্রায়োরিটি সাপোর্ট", "যেকোনো সময় বাতিল করুন"]
    : ["Unlock all premium features", "Priority support", "Cancel anytime"];

  return (
    <DashboardLayout>
      <div className="flex items-center justify-center min-h-[70vh] px-4 py-8">
        <div className="relative w-full max-w-xl">
          {/* Glow halos */}
          <div className="absolute -inset-x-10 -top-10 h-40 bg-gradient-to-r from-amber-400/20 via-orange-500/20 to-rose-500/20 blur-3xl rounded-full pointer-events-none" />
          <div className="absolute -inset-x-20 -bottom-10 h-40 bg-gradient-to-r from-primary/15 via-primary/10 to-amber-400/15 blur-3xl rounded-full pointer-events-none" />

          <div className="relative rounded-2xl border border-border/60 bg-gradient-to-br from-card via-card to-card/80 backdrop-blur-xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)] overflow-hidden">
            {/* Top gradient bar */}
            <div className="h-1 w-full bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500" />

            <div className="p-8 sm:p-10 text-center">
              {/* Icon block */}
              <div className="relative mx-auto mb-6 w-fit">
                <div className="absolute inset-0 bg-gradient-to-br from-amber-400 to-orange-500 blur-2xl opacity-30 rounded-3xl" />
                <div className="relative h-20 w-20 rounded-2xl bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 flex items-center justify-center shadow-lg shadow-amber-500/30">
                  <Lock className="h-9 w-9 text-white" strokeWidth={2.5} />
                  <span className="absolute -top-1.5 -right-1.5 h-6 w-6 rounded-full bg-white dark:bg-card flex items-center justify-center ring-2 ring-amber-500/40">
                    <Sparkles className="h-3.5 w-3.5 text-amber-500" strokeWidth={2.5} />
                  </span>
                </div>
              </div>

              {/* Plan badge */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-amber-400/15 to-orange-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-[11px] font-bold uppercase tracking-wider mb-4">
                <Crown className="h-3 w-3" />
                {minPlanLabel} Plan Required
              </div>

              <h2 className="text-2xl sm:text-3xl font-black tracking-tight mb-2 bg-gradient-to-b from-foreground to-foreground/70 bg-clip-text text-transparent">
                {lang === "bn" ? "প্রিমিয়াম ফিচার" : "Premium Feature"}
              </h2>
              <p className="text-muted-foreground text-sm sm:text-base mb-6 max-w-md mx-auto leading-relaxed">
                {lang === "bn"
                  ? `এই ফিচারটি ${minPlanLabel} প্ল্যানে অন্তর্ভুক্ত। আনলক করতে আপগ্রেড করুন।`
                  : `This feature is part of the ${minPlanLabel} plan. Upgrade now to unlock it and supercharge your workflow.`}
              </p>

              {/* Benefits */}
              <ul className="grid sm:grid-cols-3 gap-2 mb-7 text-left max-w-md mx-auto">
                {benefits.map((b, i) => (
                  <li key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/40 rounded-lg px-2.5 py-2 border border-border/50">
                    <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" strokeWidth={3} />
                    <span className="truncate">{b}</span>
                  </li>
                ))}
              </ul>

              <div className="flex flex-col sm:flex-row gap-2.5 justify-center">
                <Button variant="outline" onClick={() => window.history.back()} className="gap-2 h-11 px-5 rounded-xl">
                  <ArrowLeft className="h-4 w-4" />
                  {lang === "bn" ? "ফিরে যান" : "Go Back"}
                </Button>
                <Button
                  onClick={() => navigate("/my-plan")}
                  className="gap-2 h-11 px-6 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 hover:from-amber-600 hover:via-orange-600 hover:to-rose-600 text-white font-semibold shadow-lg shadow-orange-500/30 border-0"
                >
                  <Sparkles className="h-4 w-4" />
                  {lang === "bn" ? "এখনই আপগ্রেড করুন" : "Upgrade Now"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default FeatureGate;
