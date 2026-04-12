import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Store {
  id: string;
  name: string;
  address: string;
  phone: string;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
}

interface StoreContextType {
  stores: Store[];
  activeStore: Store | null;
  loading: boolean;
  switchStore: (storeId: string) => void;
  createStore: (name: string, address?: string, phone?: string) => Promise<Store | null>;
  refreshStores: () => Promise<void>;
  storeLimit: number;
  canCreateStore: boolean;
}

const StoreContext = createContext<StoreContextType>({
  stores: [],
  activeStore: null,
  loading: true,
  switchStore: () => {},
  createStore: async () => null,
  refreshStores: async () => {},
  storeLimit: 1,
  canCreateStore: false,
});

export const useStore = () => useContext(StoreContext);

const PLAN_STORE_LIMITS: Record<string, number> = {
  free: 1,
  pro: 3,
  business: 10,
};

export const StoreProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [activeStore, setActiveStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState("free");

  const storeLimit = PLAN_STORE_LIMITS[plan] ?? 1;
  const canCreateStore = stores.length < storeLimit;

  const fetchStores = useCallback(async () => {
    if (!user) { setLoading(false); return; }

    const { data } = await supabase
      .from("stores")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    const storeList = (data ?? []) as Store[];
    setStores(storeList);

    // Restore last active store from localStorage or pick default
    const savedStoreId = localStorage.getItem(`active_store_${user.id}`);
    const saved = storeList.find(s => s.id === savedStoreId);
    const defaultStore = storeList.find(s => s.is_default) || storeList[0];
    setActiveStore(saved || defaultStore || null);

    setLoading(false);
  }, [user]);

  // Fetch plan (user-level)
  useEffect(() => {
    if (!user) return;
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
      });
  }, [user]);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  const switchStore = (storeId: string) => {
    const store = stores.find(s => s.id === storeId);
    if (store && user) {
      setActiveStore(store);
      localStorage.setItem(`active_store_${user.id}`, storeId);
    }
  };

  const createStore = async (name: string, address = "", phone = ""): Promise<Store | null> => {
    if (!user) return null;
    if (!canCreateStore) return null;
    const isFirst = stores.length === 0;
    const { data, error } = await supabase
      .from("stores")
      .insert({
        user_id: user.id,
        name,
        address,
        phone,
        is_default: isFirst,
        is_active: true,
      })
      .select()
      .single();

    if (error || !data) {
      if (error?.message?.includes("Store limit reached")) {
        return null; // caller will handle toast
      }
      return null;
    }

    const newStore = data as Store;
    await fetchStores();
    switchStore(newStore.id);
    return newStore;
  };

  return (
    <StoreContext.Provider value={{
      stores, activeStore, loading,
      switchStore, createStore, refreshStores: fetchStores,
      storeLimit, canCreateStore,
    }}>
      {children}
    </StoreContext.Provider>
  );
};
