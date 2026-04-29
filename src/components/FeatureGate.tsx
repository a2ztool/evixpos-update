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
      <div className="relative flex items-center justify-center min-h-[calc(100vh-5rem)] -mx-3 -my-2 sm:-m-4 lg:-m-8 px-4 py-8 overflow-hidden">
        {/* Ambient grid + glow background — full page */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,hsl(var(--primary)/0.18),transparent_60%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_100%,hsl(var(--primary)/0.12),transparent_50%)]" />
          <div className="absolute inset-0 opacity-[0.04] [background-image:linear-gradient(to_right,hsl(var(--foreground))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--foreground))_1px,transparent_1px)] [background-size:32px_32px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
        </div>

        <div className="relative w-full max-w-lg">
          {/* Outer animated glow ring */}
          <div className="absolute -inset-px rounded-3xl bg-gradient-to-br from-primary/40 via-primary/10 to-primary/40 blur-md opacity-60 animate-pulse" />

          <div className="relative rounded-3xl border border-primary/15 bg-card/80 backdrop-blur-2xl shadow-[0_30px_80px_-20px_hsl(var(--primary)/0.25)] overflow-hidden">
            {/* Subtle inner highlight */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

            {/* Floating sparkles decoration */}
            <Sparkles className="absolute top-6 right-6 h-4 w-4 text-primary/30" />
            <Sparkles className="absolute bottom-8 left-8 h-3 w-3 text-primary/20" />

            <div className="relative p-10 sm:p-12 text-center">
              {/* Icon — brand colored */}
              <div className="relative mx-auto mb-7 w-fit">
                <div className="absolute inset-0 bg-primary blur-2xl opacity-40 rounded-full scale-110" />
                <div className="relative h-[88px] w-[88px] rounded-2xl bg-gradient-to-br from-primary via-primary to-primary/70 flex items-center justify-center shadow-[0_15px_40px_-10px_hsl(var(--primary)/0.6)] ring-1 ring-primary-foreground/10">
                  <div className="absolute inset-[3px] rounded-[14px] bg-gradient-to-br from-white/20 to-transparent" />
                  <Lock className="relative h-10 w-10 text-primary-foreground" strokeWidth={2.5} />
                  <span className="absolute -top-2 -right-2 h-7 w-7 rounded-full bg-card flex items-center justify-center ring-2 ring-primary/30 shadow-lg">
                    <Crown className="h-3.5 w-3.5 text-primary" strokeWidth={2.5} fill="currentColor" />
                  </span>
                </div>
              </div>

              {/* Plan badge — brand */}
              <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-primary/10 border border-primary/25 text-primary text-[10px] font-bold uppercase tracking-[0.15em] mb-5">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                {minPlanLabel} Exclusive
              </div>

              {/* Premium gradient title */}
              <h2 className="text-3xl sm:text-4xl font-black tracking-tight mb-3 leading-[1.1]">
                <span className="bg-gradient-to-br from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent">
                  {lang === "bn" ? "আনলক করুন " : "Unlock "}
                </span>
                <span className="bg-gradient-to-r from-primary via-primary to-primary/70 bg-clip-text text-transparent">
                  {lang === "bn" ? "প্রিমিয়াম" : "Premium"}
                </span>
              </h2>
              <p className="text-muted-foreground text-[15px] mb-7 max-w-sm mx-auto leading-relaxed">
                {lang === "bn"
                  ? `${minPlanLabel} প্ল্যানে আপগ্রেড করে এই ফিচার ও আরও অনেক কিছু আনলক করুন।`
                  : `Upgrade to ${minPlanLabel} to access this feature and unlock everything you need to scale faster.`}
              </p>

              {/* Benefits — refined chips */}
              <ul className="flex flex-wrap justify-center gap-1.5 mb-8 max-w-md mx-auto">
                {benefits.map((b, i) => (
                  <li key={i} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-foreground/80 bg-primary/[0.06] rounded-full pl-1.5 pr-3 py-1 border border-primary/15">
                    <span className="h-4 w-4 rounded-full bg-primary/15 flex items-center justify-center">
                      <Check className="h-2.5 w-2.5 text-primary" strokeWidth={3.5} />
                    </span>
                    {b}
                  </li>
                ))}
              </ul>

              <div className="flex flex-col-reverse sm:flex-row gap-2.5 justify-center">
                <Button
                  variant="ghost"
                  onClick={() => window.history.back()}
                  className="gap-2 h-11 px-5 rounded-xl text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-4 w-4" />
                  {lang === "bn" ? "ফিরে যান" : "Go Back"}
                </Button>
                <Button
                  onClick={() => navigate("/my-plan")}
                  className="group relative gap-2 h-11 px-7 rounded-xl bg-gradient-to-r from-primary via-primary to-primary/85 hover:from-primary/90 hover:to-primary/75 text-primary-foreground font-semibold shadow-[0_10px_30px_-8px_hsl(var(--primary)/0.55)] border-0 overflow-hidden"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                  <Crown className="h-4 w-4 relative" />
                  <span className="relative">{lang === "bn" ? "এখনই আপগ্রেড করুন" : "Upgrade Now"}</span>
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
