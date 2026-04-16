import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStaff } from "@/contexts/StaffContext";
import { getPlanLimits, PLAN_FEATURES_LIST, type VolumeStep } from "@/lib/planConfig";

export { getPlanLimits, PLAN_FEATURES_LIST };

export const PLAN_PRICES: Record<string, number> = { free: 0, pro: 19, business: 49 };

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
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const planUserId = isStaff && staffInfo ? staffInfo.owner_id : user?.id;

  const fetchPlan = useCallback(async () => {
    if (!planUserId) { setLoading(false); return; }
    const { data } = await supabase
      .from("subscriptions")
      .select("plan, status, end_date, volume")
      .eq("user_id", planUserId)
      .eq("status", "active")
      .is("customer_id", null)
      .in("plan", ["free", "pro", "business"])
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      if (data.end_date && new Date(data.end_date) < new Date()) {
        setPlan("free");
        setVolume(null);
        setEndDate(null);
      } else {
        setPlan(data.plan);
        setVolume((data as any).volume ?? null);
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

  useEffect(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (!planUserId) return;
    const ch = supabase
      .channel(`sub-plan-${planUserId}-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "subscriptions", filter: `user_id=eq.${planUserId}` }, () => fetchPlan())
      .subscribe();
    channelRef.current = ch;
    return () => {
      if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
    };
  }, [planUserId, fetchPlan]);

  const limits = getPlanLimits(plan ?? "free", volume ?? 500);

  const remainingDays = endDate ? Math.max(0, Math.ceil((new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : null;
  const isExpiringSoon = remainingDays !== null && remainingDays <= 7 && remainingDays > 0;
  const isExpired = remainingDays !== null && remainingDays <= 0;

  const upgradeTo = async (newPlan: "free" | "pro" | "business", newVolume?: VolumeStep, price?: number) => {
    if (!planUserId) return;
    await supabase.from("subscriptions").update({ status: "inactive" } as any).eq("user_id", planUserId).eq("status", "active").in("plan", ["free", "pro", "business"]);
    const startDate = new Date();
    const newEndDate = newPlan === "free" ? null : new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("subscriptions").insert({
      user_id: planUserId,
      plan: newPlan,
      status: "active",
      end_date: newEndDate,
      ...(newVolume ? { volume: newVolume } : {}),
      ...(price ? { price } : {}),
    } as any);
    setPlan(newPlan);
    setVolume(newVolume ?? null);
    setEndDate(newEndDate);
  };

  return { plan, volume, limits, loading, upgradeTo, endDate, remainingDays, isExpiringSoon, isExpired };
};
