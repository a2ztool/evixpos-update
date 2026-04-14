import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStaff } from "@/contexts/StaffContext";
import { useStore } from "@/contexts/StoreContext";

/**
 * Global hook to track unread message count across all direct chats.
 * Uses polling (every 10s) instead of realtime to avoid Supabase channel conflicts
 * when multiple components use this hook simultaneously.
 */
export const useMessageUnread = () => {
  const { user } = useAuth();
  const { isStaff, staffInfo } = useStaff();
  const { activeStore } = useStore();
  const [unreadCount, setUnreadCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const storeId = isStaff ? staffInfo?.store_id : activeStore?.id;
  const myId = user?.id;

  const fetchCount = useCallback(async () => {
    if (!storeId || !myId) return;
    try {
      const { count, error } = await supabase
        .from("staff_messages")
        .select("*", { count: "exact", head: true })
        .eq("store_id", storeId)
        .eq("receiver_id", myId)
        .eq("is_read", false);
      if (!error) {
        setUnreadCount(count ?? 0);
      }
    } catch {
      // Silently ignore fetch errors
    }
  }, [storeId, myId]);

  useEffect(() => {
    fetchCount();

    // Poll every 10 seconds for unread count
    intervalRef.current = setInterval(fetchCount, 10000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [fetchCount]);

  return { unreadCount, refetch: fetchCount };
};
