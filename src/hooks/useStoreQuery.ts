import { useStore } from "@/contexts/StoreContext";
import { useStaff } from "@/contexts/StaffContext";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Returns helpers for store-scoped Supabase queries.
 * For staff users, `userId` returns the store owner's ID (for inserts).
 */
export const useStoreQuery = () => {
  const { user } = useAuth();
  const { activeStore } = useStore();
  const { isStaff, staffInfo } = useStaff();

  const storeId = activeStore?.id ?? null;
  // For staff, use the owner's user_id for data inserts so RLS passes
  const userId = isStaff && staffInfo ? staffInfo.owner_id : (user?.id ?? null);

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
