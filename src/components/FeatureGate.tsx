import { useStorePlan, FeatureKey, FEATURE_MIN_PLAN } from "@/hooks/useStorePlan";
import { useStoreMode } from "@/hooks/useStoreMode";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Crown, Lock, MapPin } from "lucide-react";
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
