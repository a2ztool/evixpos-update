import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const PLAN_LIMITS = {
  free: { products: 25, customers: 50, stores: 1 },
  pro: { products: 100, customers: 1000, stores: 3 },
  business: { products: 500, customers: 5000, stores: 10 },
};

export interface UsageLimits {
  totalProducts: number;
  totalCustomers: number;
  totalStores: number;
  maxProducts: number;
  maxCustomers: number;
  maxStores: number;
  /** Per-store breakdown */
  perStore: { storeId: string; storeName: string; products: number; customers: number }[];
  loading: boolean;
  refetch: () => void;
}

export const useUsageLimits = (plan: string | null): UsageLimits => {
  const { user } = useAuth();
  const [totalProducts, setTotalProducts] = useState(0);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [totalStores, setTotalStores] = useState(0);
  const [perStore, setPerStore] = useState<UsageLimits["perStore"]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const limits = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS] ?? PLAN_LIMITS.free;

  const fetchUsage = useCallback(async () => {
    if (!user) { setLoading(false); return; }

    const [prodRes, custRes, storeRes] = await Promise.all([
      supabase.from("products").select("id, store_id", { count: "exact" }).eq("user_id", user.id),
      supabase.from("customers").select("id, store_id", { count: "exact" }).eq("user_id", user.id),
      supabase.from("stores").select("id, name", { count: "exact" }).eq("user_id", user.id),
    ]);

    setTotalProducts(prodRes.count ?? 0);
    setTotalCustomers(custRes.count ?? 0);
    setTotalStores(storeRes.count ?? 0);

    // Build per-store breakdown
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
  }, [user?.id]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  // Realtime for products & customers changes
  useEffect(() => {
    if (!user) return;

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const ch = supabase
      .channel(`usage-global-${user.id}-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => fetchUsage())
      .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, () => fetchUsage())
      .on("postgres_changes", { event: "*", schema: "public", table: "stores" }, () => fetchUsage())
      .subscribe();

    channelRef.current = ch;

    return () => {
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [user?.id, fetchUsage]);

  return {
    totalProducts,
    totalCustomers,
    totalStores,
    maxProducts: limits.products,
    maxCustomers: limits.customers,
    maxStores: limits.stores,
    perStore,
    loading,
    refetch: fetchUsage,
  };
};
