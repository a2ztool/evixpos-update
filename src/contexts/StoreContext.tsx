import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

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
  switchStore: (storeId: string) => boolean;
  createStore: (name: string, address?: string, phone?: string, storeMode?: StoreMode) => Promise<Store | null>;
  refreshStores: () => Promise<void>;
  storeLimit: number;
  canCreateStore: boolean;
  /** Set of store ids that are locked due to plan limits (over the allowed quota) */
  lockedStoreIds: Set<string>;
  /** Returns true if a given store is locked by the plan limit */
  isStoreLocked: (storeId: string) => boolean;
  /** Current plan key */
  plan: string;
  /** True when the current user is a staff member (store loaded from staff assignment) */
  isStaffStore: boolean;
}

const StoreContext = createContext<StoreContextType>({
  stores: [],
  activeStore: null,
  loading: true,
  switchStore: () => false,
  createStore: async () => null,
  refreshStores: async () => {},
  storeLimit: 1,
  canCreateStore: false,
  lockedStoreIds: new Set(),
  isStoreLocked: () => false,
  plan: "free",
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

  // Determine which stores are locked due to plan limit.
  // Allowed stores = default store first, then oldest stores up to `storeLimit`.
  // Any extras beyond the quota are locked (cannot be switched to).
  const computeAllowedIds = (list: Store[], limit: number): Set<string> => {
    const sorted = [...list].sort((a, b) => {
      if (a.is_default && !b.is_default) return -1;
      if (!a.is_default && b.is_default) return 1;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
    return new Set(sorted.slice(0, Math.max(1, limit)).map(s => s.id));
  };

  const allowedStoreIds = isStaffStore
    ? new Set(stores.map(s => s.id))
    : computeAllowedIds(stores, storeLimit);
  const lockedStoreIds = new Set(
    stores.filter(s => !allowedStoreIds.has(s.id)).map(s => s.id)
  );
  const isStoreLocked = (storeId: string) => lockedStoreIds.has(storeId);

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

  const switchStore = (storeId: string): boolean => {
    if (isStaffStore) return false; // Staff can't switch stores
    const store = stores.find(s => s.id === storeId);
    if (!store || !user) return false;
    if (lockedStoreIds.has(storeId)) {
      toast.error(
        `This store is locked on the ${plan ?? "free"} plan. Upgrade to access more than ${storeLimit} store(s).`
      );
      return false;
    }
    setActiveStore(store);
    localStorage.setItem(`active_store_${user.id}`, storeId);
    return true;
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
      lockedStoreIds, isStoreLocked, plan: plan ?? "free",
    }}>
      {children}
    </StoreContext.Provider>
  );
};
