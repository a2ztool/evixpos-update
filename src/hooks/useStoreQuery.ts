import { useStore } from "@/contexts/StoreContext";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Returns helpers for store-scoped Supabase queries.
 * Use `storeFilter` to add `.eq("store_id", activeStoreId)` to any query.
 * Use `storeInsertData` to get `{ user_id, store_id }` for inserts.
 */
export const useStoreQuery = () => {
  const { user } = useAuth();
  const { activeStore } = useStore();

  const storeId = activeStore?.id ?? null;
  const userId = user?.id ?? null;

  /** Apply store_id filter to a Supabase query builder */
  const withStore = <T extends { eq: (col: string, val: string) => T }>(query: T): T => {
    if (storeId) {
      return query.eq("store_id", storeId);
    }
    return query;
  };

  /** Common insert fields */
  const storeInsertData = {
    user_id: userId!,
    store_id: storeId!,
  };

  return { storeId, userId, withStore, storeInsertData, ready: !!storeId && !!userId };
};
