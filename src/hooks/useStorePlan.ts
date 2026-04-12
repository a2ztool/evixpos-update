import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStaff } from "@/contexts/StaffContext";
import { toast } from "sonner";

export type FeatureKey =
  | "pos"
  | "integrations"
  | "analytics"
  | "reports"
  | "ad_costs"
  | "bot_automation"
  | "woocommerce"
  | "google_sheets"
  | "whatsapp"
  | "coupons"
  | "order_forms"
  | "subscriptions"
  | "task_mission"
  | "referral"
  | "due_book";

const PLAN_FEATURES: Record<string, FeatureKey[]> = {
  free: ["pos", "subscriptions", "due_book", "referral"],
  pro: [
    "pos", "integrations", "analytics", "reports", "coupons",
    "order_forms", "subscriptions", "task_mission", "referral",
    "ad_costs", "bot_automation", "woocommerce", "whatsapp", "google_sheets",
    "due_book",
  ],
  business: [
    "pos", "integrations", "analytics", "reports", "coupons",
    "order_forms", "subscriptions", "task_mission", "referral",
    "ad_costs", "bot_automation", "woocommerce", "whatsapp", "google_sheets",
    "due_book",
  ],
};

export const FEATURE_MIN_PLAN: Record<FeatureKey, string> = {
  pos: "free",
  subscriptions: "free",
  due_book: "free",
  referral: "free",
  integrations: "pro",
  analytics: "pro",
  reports: "pro",
  ad_costs: "pro",
  bot_automation: "pro",
  coupons: "pro",
  order_forms: "pro",
  task_mission: "pro",
  woocommerce: "pro",
  google_sheets: "pro",
  whatsapp: "pro",
};

/**
 * Returns the USER-LEVEL plan (not per-store).
 * Plan applies globally to the user across all stores.
 */
export const useStorePlan = () => {
  const { user } = useAuth();
  const { isStaff, staffInfo } = useStaff();
  const [plan, setPlan] = useState<string>("free");
  const [loading, setLoading] = useState(true);
  const initialLoadDone = useRef(false);

  // For staff, we need to check the store owner's plan, not the staff's own plan
  const planUserId = isStaff && staffInfo ? staffInfo.owner_id : user?.id;

  const fetchPlan = useCallback(async (isRealtimeUpdate = false) => {
    if (!planUserId) {
      setPlan("free");
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("subscriptions")
      .select("plan, status")
      .eq("user_id", planUserId)
      .eq("status", "active")
      .is("customer_id", null)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const newPlan = data?.plan ?? "free";
    
    setPlan(prev => {
      if (isRealtimeUpdate && initialLoadDone.current && prev !== newPlan) {
        const upgraded = ["free", "pro", "business"].indexOf(newPlan) > ["free", "pro", "business"].indexOf(prev);
        if (upgraded) {
          toast.success(`🎉 Your plan has been upgraded to ${newPlan.charAt(0).toUpperCase() + newPlan.slice(1)}!`, {
            description: "New features are now unlocked for all your stores.",
            duration: 6000,
          });
        } else {
          toast.info(`Your plan has been changed to ${newPlan.charAt(0).toUpperCase() + newPlan.slice(1)}.`, {
            description: "Some features may now be restricted.",
            duration: 6000,
          });
        }
      }
      return newPlan;
    });
    
    initialLoadDone.current = true;
    setLoading(false);
  }, [planUserId]);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  // Realtime subscription for instant plan changes (user-level)
  useEffect(() => {
    if (!planUserId) return;

    const channelName = `user-plan-${user.id}-${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "subscriptions",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchPlan(true);
        }
      );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchPlan]);

  const hasFeature = useCallback(
    (feature: FeatureKey): boolean => {
      const features = PLAN_FEATURES[plan] ?? PLAN_FEATURES.free;
      return features.includes(feature);
    },
    [plan]
  );

  return { plan, loading, hasFeature };
};
