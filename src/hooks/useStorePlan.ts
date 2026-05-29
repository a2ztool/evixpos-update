import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStaff } from "@/contexts/StaffContext";
import { toast } from "sonner";
import { type VolumeStep } from "@/lib/planConfig";
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
  | "due_book"
  | "split_payment";

const PLAN_FEATURES: Record<string, FeatureKey[]> = {
  free: ["pos", "subscriptions", "due_book", "referral"],
  pro: [
    "pos", "integrations", "analytics", "reports", "coupons",
    "order_forms", "subscriptions", "task_mission", "referral",
    "ad_costs", "bot_automation", "woocommerce", "whatsapp", "google_sheets",
    "due_book", "split_payment",
  ],
  business: [
    "pos", "integrations", "analytics", "reports", "coupons",
    "order_forms", "subscriptions", "task_mission", "referral",
    "ad_costs", "bot_automation", "woocommerce", "whatsapp", "google_sheets",
    "due_book", "split_payment",
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
  split_payment: "pro",
};

/**
 * Returns the USER-LEVEL plan (not per-store).
 * Plan applies globally to the user across all stores.
 */
export const useStorePlan = () => {
  const { user } = useAuth();
  const { isStaff, staffInfo } = useStaff();
  const [plan, setPlan] = useState<string | null>(null);
  const [volume, setVolume] = useState<VolumeStep | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [override, setOverride] = useState<any>(null);
  const initialLoadDone = useRef(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelInstanceIdRef = useRef(
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  );

  // For staff, we need to check the store owner's plan, not the staff's own plan
  const planUserId = isStaff && staffInfo ? staffInfo.owner_id : user?.id;

  const fetchPlan = useCallback(async (isRealtimeUpdate = false) => {
    if (!planUserId) {
      // No user yet — keep null, don't default to free
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("subscriptions")
      .select("plan, status, end_date")
      .eq("user_id", planUserId)
      .eq("status", "active")
      .is("customer_id", null)
      .in("plan", ["free", "pro", "business"])
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Separate query for volume (column may not exist yet)
    const { data: volData } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", planUserId)
      .eq("status", "active")
      .is("customer_id", null)
      .in("plan", ["free", "pro", "business"])
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: ovData } = await supabase
      .from("admin_plan_overrides" as any)
      .select("*")
      .eq("user_id", planUserId)
      .maybeSingle();
    setOverride((ovData as any) || null);

    const isExpired = data?.end_date && new Date(data.end_date) < new Date();
    const newPlan = isExpired ? "free" : (data?.plan ?? "free");
    setEndDate(isExpired ? null : (data?.end_date || null));
    setVolume(isExpired ? null : ((volData as any)?.volume ?? null));
    
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

  // Debounced realtime refetch — avoid fetch storms when many subscription
  // rows (customer subscriptions, status flips, etc.) update in a burst.
  const scheduleRealtimeRefetch = useCallback(() => {
    if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    refetchTimerRef.current = setTimeout(() => {
      refetchTimerRef.current = null;
      fetchPlan(true);
    }, 600);
  }, [fetchPlan]);

  // Realtime subscription for instant plan changes (user-level)
  useEffect(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    if (!planUserId) return;

    const channelName = `user-plan-${planUserId}-${channelInstanceIdRef.current}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "subscriptions",
          filter: `user_id=eq.${planUserId}`,
        },
        (payload: any) => {
          // Only react when the user-level subscription row changes
          // (customer_id IS NULL). Customer subscriptions for this user's
          // customers also share user_id and would otherwise fire constantly.
          const newRow = payload?.new ?? {};
          const oldRow = payload?.old ?? {};
          const isUserLevel =
            newRow?.customer_id == null && oldRow?.customer_id == null;
          if (!isUserLevel) return;
          scheduleRealtimeRefetch();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "admin_plan_overrides",
          filter: `user_id=eq.${planUserId}`,
        },
        () => { scheduleRealtimeRefetch(); }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (refetchTimerRef.current) {
        clearTimeout(refetchTimerRef.current);
        refetchTimerRef.current = null;
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
        return;
      }

      supabase.removeChannel(channel);
    };
  }, [planUserId, fetchPlan, scheduleRealtimeRefetch]);

  const ov = override?.manual_override ? override : null;
  const isUnlimited = !!(ov && (ov.is_unlimited_store || ov.is_unlimited_customer || ov.is_unlimited_product));
  // Effective plan: unlimited override promotes user to Business-tier features everywhere
  const effectivePlan = isUnlimited ? "business" : plan;

  const hasFeature = useCallback(
    (feature: FeatureKey): boolean => {
      if (!effectivePlan) return false;
      const features = PLAN_FEATURES[effectivePlan] ?? PLAN_FEATURES.free;
      return features.includes(feature);
    },
    [effectivePlan]
  );
  const remainingDays = endDate ? Math.max(0, Math.ceil((new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : null;
  const displayPlan = isUnlimited ? "unlimited" : (plan ?? "free");

  return { plan: effectivePlan, volume, loading, hasFeature, endDate, remainingDays, override, isUnlimited, displayPlan };
};
