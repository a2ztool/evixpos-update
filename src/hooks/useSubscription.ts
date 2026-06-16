import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStaff } from "@/contexts/StaffContext";
import { PLAN_FEATURES_LIST, type VolumeStep } from "@/lib/planConfig";
import { usePlansConfig } from "@/contexts/PlansConfigContext";
import { isExternalActionActive } from "@/lib/pageState";

export { PLAN_FEATURES_LIST };

export const PLAN_PRICES: Record<string, number> = { free: 0, pro: 19, business: 49 };

export interface AdminOverride {
  manual_override: boolean;
  is_unlimited_store: boolean;
  is_unlimited_customer: boolean;
  is_unlimited_product: boolean;
  override_volume: number | null;
  override_max_stores: number | null;
  override_max_products: number | null;
  override_max_customers: number | null;
}

/**
 * User-level subscription hook with real-time updates.
 * For staff, checks the store owner's plan.
 */
export const useSubscription = () => {
  const { user } = useAuth();
  const { isStaff, staffInfo } = useStaff();
  const [plan, setPlan] = useState<string | null>(null);
  const [volume, setVolume] = useState<VolumeStep | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [override, setOverride] = useState<AdminOverride | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const planUserId = isStaff && staffInfo ? staffInfo.owner_id : user?.id;

  const fetchPlan = useCallback(async () => {
    if (!planUserId) { setLoading(false); return; }
    const [{ data }, { data: volData }, { data: ovData }] = await Promise.all([
      supabase
      .from("subscriptions")
      .select("plan, status, end_date")
      .eq("user_id", planUserId)
      .eq("status", "active")
      .is("customer_id", null)
      .in("plan", ["free", "pro", "business"])
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
      supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", planUserId)
      .eq("status", "active")
      .is("customer_id", null)
      .in("plan", ["free", "pro", "business"])
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
      supabase
        .from("admin_plan_overrides" as any)
        .select("*")
        .eq("user_id", planUserId)
        .maybeSingle(),
    ]);
    setOverride((ovData as any) || null);
    if (data) {
      if (data.end_date && new Date(data.end_date) < new Date()) {
        setPlan("free");
        setVolume(null);
        setEndDate(null);
      } else {
        setPlan(data.plan);
        setVolume((volData as any)?.volume ?? null);
        setEndDate(data.end_date || null);
      }
    } else {
      setPlan("free");
      setVolume(null);
      setEndDate(null);
    }
    setLoading(false);
  }, [planUserId]);

  useEffect(() => { fetchPlan(); }, [fetchPlan]);

  // Refetch on tab focus / visibility change so admin updates land instantly
  useEffect(() => {
    const onFocus = () => { if (!isExternalActionActive()) fetchPlan(); };
    const onVis = () => { if (document.visibilityState === "visible" && !isExternalActionActive()) fetchPlan(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [fetchPlan]);

  useEffect(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (!planUserId) return;
    const ch = supabase
      .channel(`sub-plan-${planUserId}-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "subscriptions", filter: `user_id=eq.${planUserId}` }, () => fetchPlan())
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_plan_overrides", filter: `user_id=eq.${planUserId}` }, () => {
        fetchPlan();
        try {
          // soft chime to signal instant change
          const a = new Audio("data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=");
          a.volume = 0.2; a.play().catch(() => {});
        } catch {}
      })
      .subscribe();
    channelRef.current = ch;
    return () => {
      if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
    };
  }, [planUserId, fetchPlan]);

  const { getPlanLimits } = usePlansConfig();
  const baseLimits = getPlanLimits(plan ?? "free", volume ?? 500);

  // Apply admin override on top of plan limits
  const ov = override?.manual_override ? override : null;
  const limits = {
    ...baseLimits,
    maxStores: ov?.is_unlimited_store ? Infinity : (ov?.override_max_stores ?? baseLimits.maxStores),
    maxProducts: ov?.is_unlimited_product ? Infinity : (ov?.override_max_products ?? baseLimits.maxProducts),
    maxCustomers: ov?.is_unlimited_customer
      ? Infinity
      : (ov?.override_max_customers ?? ov?.override_volume ?? baseLimits.maxCustomers),
  };

  const hasUnlimited = !!(ov && (ov.is_unlimited_store || ov.is_unlimited_customer || ov.is_unlimited_product));
  const isOverridden = !!ov;

  const remainingDays = endDate ? Math.max(0, Math.ceil((new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : null;
  const isExpiringSoon = remainingDays !== null && remainingDays <= 3 && remainingDays > 0;
  const isExpired = remainingDays !== null && remainingDays <= 0;

  const upgradeTo = async (
    newPlan: "free" | "pro" | "business",
    newVolume?: VolumeStep,
    price?: number,
    billingType: "monthly" | "yearly" = "monthly"
  ) => {
    if (!planUserId) return;
    await supabase.from("subscriptions").update({ status: "inactive" } as any).eq("user_id", planUserId).eq("status", "active").in("plan", ["free", "pro", "business"]);
    const startDate = new Date();
    const durationDays = newPlan === "free" ? 0 : billingType === "yearly" ? 365 : 30;
    const newEndDate = newPlan === "free" ? null : new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("subscriptions").insert({
      user_id: planUserId,
      plan: newPlan,
      status: "active",
      end_date: newEndDate,
      ...(newVolume ? { volume: newVolume } : {}),
      ...(price ? { price } : {}),
      billing_type: billingType,
    } as any);
    setPlan(newPlan);
    setVolume(newVolume ?? null);
    setEndDate(newEndDate);
  };

  const effectivePlan = hasUnlimited ? "business" : plan;
  const displayPlan = hasUnlimited ? "unlimited" : (plan ?? "free");

  return { plan: effectivePlan, rawPlan: plan, displayPlan, volume, limits, loading, upgradeTo, endDate, remainingDays, isExpiringSoon, isExpired, override, isOverridden, hasUnlimited, refetch: fetchPlan };
};
