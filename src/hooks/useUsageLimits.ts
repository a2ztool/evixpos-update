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

  const { getPlanLimits } = usePlansConfig();
  const limits = getPlanLimits(plan ?? "free", (volume ?? 500) as VolumeStep);

  const ownerId = effectiveUserId ?? user?.id ?? null;

  const fetchUsage = useCallback(async () => {
    if (!ownerId) { setLoading(false); return; }
    const [prodRes, custRes, storeRes] = await Promise.all([
      supabase.from("products").select("id, store_id", { count: "exact" }).eq("user_id", ownerId),
      supabase.from("customers").select("id, store_id", { count: "exact" }).eq("user_id", ownerId),
      supabase.from("stores").select("id, name", { count: "exact" }).eq("user_id", ownerId),
    ]);
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

  useEffect(() => {
    if (!ownerId) return;
    if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
    const ch = supabase
      .channel(`usage-global-${ownerId}-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => fetchUsage())
      .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, () => fetchUsage())
      .on("postgres_changes", { event: "*", schema: "public", table: "stores" }, () => fetchUsage())
      .subscribe();
    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); channelRef.current = null; };
  }, [ownerId, fetchUsage]);

  return {
    totalProducts, totalCustomers, totalStores,
    maxProducts: limits.maxProducts,
    maxCustomers: limits.maxCustomers,
    maxStores: limits.maxStores,
    perStore, loading, refetch: fetchUsage,
  };
};
