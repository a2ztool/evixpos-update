import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type StoreMode = "online" | "offline";

export interface Store {
  id: string;
  name: string;
  address: string;
  phone: string;
  is_active: boolean;
  is_default: boolean;
  store_mode: StoreMode;
  created_at: string;
}

interface StoreContextType {
  stores: Store[];
  activeStore: Store | null;
  loading: boolean;
  switchStore: (storeId: string) => void;
  createStore: (name: string, address?: string, phone?: string, storeMode?: StoreMode) => Promise<Store | null>;
  refreshStores: () => Promise<void>;
  storeLimit: number;
  canCreateStore: boolean;
  /** True when the current user is a staff member (store loaded from staff assignment) */
  isStaffStore: boolean;
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
  isStaffStore: false,
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
  const [plan, setPlan] = useState<string | null>(null);
  const [isStaffStore, setIsStaffStore] = useState(false);

  const storeLimit = PLAN_STORE_LIMITS[plan ?? "free"] ?? 1;
  const canCreateStore = !isStaffStore && stores.length < storeLimit;

  const fetchStores = useCallback(async () => {
    if (!user) { setLoading(false); return; }

    // First check if user is a staff member
    const { data: staffData } = await supabase
      .from("staff_members")
      .select("store_id, user_id")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (staffData?.store_id) {
      // Staff user: load only their assigned store
      const { data: storeData } = await supabase
        .from("stores")
        .select("*")
        .eq("id", staffData.store_id)
        .single();

      if (storeData) {
        const store = storeData as Store;
        setStores([store]);
        setActiveStore(store);
        setIsStaffStore(true);
      }
      setLoading(false);
      return;
    }

    // Owner: load all their stores
    setIsStaffStore(false);
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
      .select("plan, status, end_date")
      .eq("user_id", user.id)
      .eq("status", "active")
      .is("customer_id", null)
      .in("plan", ["free", "pro", "business"])
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const isExpired = data.end_date && new Date(data.end_date) < new Date();
          setPlan(isExpired ? "free" : data.plan);
        } else {
          setPlan("free");
        }
      });
  }, [user]);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  // Realtime: keep stores in sync across the app without requiring a refresh
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`stores-realtime-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stores" },
        () => {
          fetchStores();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchStores]);

  const switchStore = (storeId: string) => {
    if (isStaffStore) return; // Staff can't switch stores
    const store = stores.find(s => s.id === storeId);
    if (store && user) {
      setActiveStore(store);
      localStorage.setItem(`active_store_${user.id}`, storeId);
    }
  };

  const createStore = async (name: string, address = "", phone = "", storeMode: StoreMode = "online"): Promise<Store | null> => {
    if (!user || isStaffStore) return null;
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
        store_mode: storeMode,
      })
      .select()
      .single();

    if (error || !data) {
      if (error?.message?.includes("Store limit reached")) {
        return null;
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
      storeLimit, canCreateStore, isStaffStore,
    }}>
      {children}
    </StoreContext.Provider>
  );
};
