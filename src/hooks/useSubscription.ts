import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

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
 * User-level subscription hook.
 * Plan applies globally to the user, not per store.
 */
export const useSubscription = () => {
  const { user } = useAuth();
  const [plan, setPlan] = useState<string>("free");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    supabase
      .from("subscriptions")
      .select("plan, status")
      .eq("user_id", user.id)
      .eq("status", "active")
      .is("customer_id", null)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setPlan(data.plan);
        setLoading(false);
      });
  }, [user]);

  const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;

  const upgradeTo = async (newPlan: "free" | "pro" | "business") => {
    if (!user) return;
    // Deactivate current platform subscriptions only (not customer subs)
    await supabase.from("subscriptions").update({ status: "inactive" }).eq("user_id", user.id).eq("status", "active").is("customer_id", null);
    // Create new (user-level, no store_id needed)
    await supabase.from("subscriptions").insert({
      user_id: user.id,
      plan: newPlan,
      status: "active",
    });
    setPlan(newPlan);
  };

  return { plan, limits, loading, upgradeTo };
};
