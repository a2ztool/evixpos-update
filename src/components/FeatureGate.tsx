import { useStorePlan, FeatureKey, FEATURE_MIN_PLAN } from "@/hooks/useStorePlan";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Crown, Lock } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";

interface FeatureGateProps {
  children: React.ReactNode;
  feature: FeatureKey;
  fullPage?: boolean;
}

const FeatureGate = ({ children, feature, fullPage = true }: FeatureGateProps) => {
  const { hasFeature, loading, plan } = useStorePlan();
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

  if (hasFeature(feature)) {
    return <>{children}</>;
  }

  const minPlan = FEATURE_MIN_PLAN[feature] || "pro";
  const minPlanLabel = minPlan.charAt(0).toUpperCase() + minPlan.slice(1);

  // Show upgrade UI instead of blank page
  return (
    <DashboardLayout>
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
          <Lock className="h-10 w-10 text-primary" />
        </div>
        <h2 className="text-2xl font-bold mb-2">
          {lang === "bn" ? "ফিচার লক করা আছে" : "Feature Locked"}
        </h2>
        <p className="text-muted-foreground mb-6 max-w-md">
          {lang === "bn"
            ? `এই ফিচারটি ব্যবহার করতে আপনার প্ল্যান ${minPlanLabel} বা তার উপরে আপগ্রেড করুন।`
            : `This feature requires the ${minPlanLabel} plan or higher. Upgrade your plan to unlock it.`}
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => window.history.back()}>
            {lang === "bn" ? "ফিরে যান" : "Go Back"}
          </Button>
          <Button onClick={() => navigate("/my-plan")} className="gap-2">
            <Crown className="h-4 w-4" />
            {lang === "bn" ? "প্ল্যান আপগ্রেড করুন" : "Upgrade Plan"}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default FeatureGate;
