import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStaff } from "@/contexts/StaffContext";
import { useStore } from "@/contexts/StoreContext";

/**
 * Global hook to track unread message count across all direct chats.
 * Used by Sidebar and NotificationBell.
 */
export const useMessageUnread = () => {
  const { user } = useAuth();
  const { isStaff, staffInfo } = useStaff();
  const { activeStore } = useStore();
  const [unreadCount, setUnreadCount] = useState(0);

  const storeId = isStaff ? staffInfo?.store_id : activeStore?.id;
  const myId = user?.id;

  const fetchCount = useCallback(async () => {
    if (!storeId || !myId) return;
    const { count, error } = await supabase
      .from("staff_messages")
      .select("*", { count: "exact", head: true })
      .eq("store_id", storeId)
      .eq("receiver_id", myId)
      .eq("is_read", false);
    if (!error) {
      setUnreadCount(count ?? 0);
    }
  }, [storeId, myId]);

  useEffect(() => {
    fetchCount();
    if (!storeId || !myId) return;

    const channelName = `msg-unread-global-${myId}-${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "staff_messages",
        filter: `receiver_id=eq.${myId}`,
      }, () => {
        fetchCount();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [storeId, myId, fetchCount]);

  return { unreadCount, refetch: fetchCount };
};
