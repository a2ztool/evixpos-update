import { useState, useEffect, useCallback, useRef } from "react";
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
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

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

    // Clean up any existing channel first
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase.channel(`msg-unread-${myId}-${Date.now()}`);
    channelRef.current = channel;

    channel
      .on("postgres_changes", {
        event: "*", schema: "public", table: "staff_messages",
        filter: `receiver_id=eq.${myId}`,
      }, () => {
        fetchCount();
      })
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [storeId, myId, fetchCount]);

  return { unreadCount, refetch: fetchCount };
};
