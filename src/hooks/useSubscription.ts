import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStaff } from "@/contexts/StaffContext";

export interface PlanLimits {
  maxProducts: number;
  maxCustomers: number;
  maxStores: number;
  integrations: boolean;
  analytics: boolean;
}

export const PLAN_LIMITS: Record<string, PlanLimits> = {
  free: { maxProducts: 25, maxCustomers: 50, maxStores: 1, integrations: false, analytics: false },
  pro: { maxProducts: 100, maxCustomers: 1000, maxStores: 3, integrations: true, analytics: true },
  business: { maxProducts: 500, maxCustomers: 5000, maxStores: 10, integrations: true, analytics: true },
};

export const PLAN_PRICES: Record<string, number> = { free: 0, pro: 19, business: 49 };

export const PLAN_FEATURES: Record<string, string[]> = {
  free: ["Up to 1 store", "Up to 50 customers (shared)", "Up to 25 products (shared)", "Basic POS"],
  pro: ["Up to 3 stores", "Up to 1,000 customers (shared)", "Up to 100 products (shared)", "Integrations", "Analytics"],
  business: ["Up to 10 stores", "Up to 5,000 customers (shared)", "Up to 500 products (shared)", "Integrations", "Analytics", "Priority support"],
};

/**
 * User-level subscription hook with real-time updates.
 * For staff, checks the store owner's plan.
 */
export const useSubscription = () => {
  const { user } = useAuth();
  const { isStaff, staffInfo } = useStaff();
  const [plan, setPlan] = useState<string>("free");
  const [endDate, setEndDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // For staff, use the store owner's plan
  const planUserId = isStaff && staffInfo ? staffInfo.owner_id : user?.id;

  const fetchPlan = useCallback(async () => {
    if (!planUserId) { setLoading(false); return; }
    const { data } = await supabase
      .from("subscriptions")
      .select("plan, status, end_date")
      .eq("user_id", planUserId)
      .eq("status", "active")
      .in("plan", ["free", "pro", "business"])
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      // Check if plan has expired
      if (data.end_date && new Date(data.end_date) < new Date()) {
        setPlan("free");
        setEndDate(null);
      } else {
        setPlan(data.plan);
        setEndDate(data.end_date || null);
      }
    } else {
      setPlan("free");
      setEndDate(null);
    }
    setLoading(false);
  }, [planUserId]);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  // Real-time subscription changes
  useEffect(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (!planUserId) return;

    const ch = supabase
      .channel(`sub-plan-${planUserId}-${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "subscriptions", filter: `user_id=eq.${planUserId}` },
        () => fetchPlan()
      )
      .subscribe();

    channelRef.current = ch;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [planUserId, fetchPlan]);

  const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;

  const remainingDays = endDate ? Math.max(0, Math.ceil((new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : null;
  const isExpiringSoon = remainingDays !== null && remainingDays <= 7 && remainingDays > 0;
  const isExpired = remainingDays !== null && remainingDays <= 0;

  const upgradeTo = async (newPlan: "free" | "pro" | "business") => {
    if (!planUserId) return;
    await supabase.from("subscriptions").update({ status: "inactive" }).eq("user_id", planUserId).eq("status", "active").in("plan", ["free", "pro", "business"]);
    const startDate = new Date();
    const newEndDate = newPlan === "free" ? null : new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("subscriptions").insert({
      user_id: planUserId,
      plan: newPlan,
      status: "active",
      end_date: newEndDate,
    });
    setPlan(newPlan);
    setEndDate(newEndDate);
  };

  return { plan, limits, loading, upgradeTo, endDate, remainingDays, isExpiringSoon, isExpired };
};
