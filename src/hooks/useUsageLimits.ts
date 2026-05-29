import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStaff } from "@/contexts/StaffContext";
import { type VolumeStep } from "@/lib/planConfig";
import { usePlansConfig } from "@/contexts/PlansConfigContext";

export interface UsageLimits {
  totalProducts: number;
  totalCustomers: number;
  totalStores: number;
  maxProducts: number;
  maxCustomers: number;
  maxStores: number;
  perStore: { storeId: string; storeName: string; products: number; customers: number }[];
  loading: boolean;
  refetch: () => void;
}

export const useUsageLimits = (plan: string | null, volume?: VolumeStep | null): UsageLimits => {
  const { user } = useAuth();
  const { effectiveUserId } = useStaff();
  const [totalProducts, setTotalProducts] = useState(0);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [totalStores, setTotalStores] = useState(0);
  const [perStore, setPerStore] = useState<UsageLimits["perStore"]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { getPlanLimits } = usePlansConfig();
  const baseLimits = getPlanLimits(plan ?? "free", (volume ?? 500) as VolumeStep);
  const [override, setOverride] = useState<any>(null);

  const ownerId = effectiveUserId ?? user?.id ?? null;

  const fetchUsage = useCallback(async () => {
    if (!ownerId) { setLoading(false); return; }
    const [prodRes, custRes, storeRes, ovRes] = await Promise.all([
      supabase.from("products").select("id, store_id", { count: "exact" }).eq("user_id", ownerId),
      supabase.from("customers").select("id, store_id", { count: "exact" }).eq("user_id", ownerId),
      supabase.from("stores").select("id, name", { count: "exact" }).eq("user_id", ownerId),
      supabase.from("admin_plan_overrides" as any).select("*").eq("user_id", ownerId).maybeSingle(),
    ]);
    setOverride((ovRes as any)?.data || null);
    setTotalProducts(prodRes.count ?? 0);
    setTotalCustomers(custRes.count ?? 0);
    setTotalStores(storeRes.count ?? 0);
    const stores = storeRes.data ?? [];
    const products = prodRes.data ?? [];
    const customers = custRes.data ?? [];
    const breakdown = stores.map(s => ({
      storeId: s.id,
      storeName: s.name,
      products: products.filter(p => p.store_id === s.id).length,
      customers: customers.filter(c => c.store_id === s.id).length,
    }));
    setPerStore(breakdown);
    setLoading(false);
  }, [ownerId]);

  useEffect(() => { fetchUsage(); }, [fetchUsage]);

  // Debounced refetch so realtime bursts (multiple inserts/updates in the
  // same second) collapse into a single recompute instead of flickering the UI.
  const scheduleRefetch = useCallback(() => {
    if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    refetchTimerRef.current = setTimeout(() => {
      refetchTimerRef.current = null;
      fetchUsage();
    }, 600);
  }, [fetchUsage]);

  useEffect(() => {
    if (!ownerId) return;
    if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
    const ch = supabase
      .channel(`usage-global-${ownerId}-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "products", filter: `user_id=eq.${ownerId}` }, () => scheduleRefetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "customers", filter: `user_id=eq.${ownerId}` }, () => scheduleRefetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "stores", filter: `user_id=eq.${ownerId}` }, () => scheduleRefetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_plan_overrides", filter: `user_id=eq.${ownerId}` }, () => scheduleRefetch())
      .subscribe();
    channelRef.current = ch;
    return () => {
      if (refetchTimerRef.current) { clearTimeout(refetchTimerRef.current); refetchTimerRef.current = null; }
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [ownerId, fetchUsage, scheduleRefetch]);

  const ov = override?.manual_override ? override : null;
  const maxStores = ov?.is_unlimited_store ? Infinity : (ov?.override_max_stores ?? baseLimits.maxStores);
  const maxProducts = ov?.is_unlimited_product ? Infinity : (ov?.override_max_products ?? baseLimits.maxProducts);
  const maxCustomers = ov?.is_unlimited_customer
    ? Infinity
    : (ov?.override_max_customers ?? ov?.override_volume ?? baseLimits.maxCustomers);

  return {
    totalProducts, totalCustomers, totalStores,
    maxProducts, maxCustomers, maxStores,
    perStore, loading, refetch: fetchUsage,
  };
};
