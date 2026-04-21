import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStaff } from "@/contexts/StaffContext";
import { useStore } from "@/contexts/StoreContext";
import { debouncedPlaySound } from "@/lib/notificationSound";

/**
 * Global hook to track unread message count across all direct chats.
 * - Polls every 10s for accurate count (avoids realtime channel conflicts).
 * - Subscribes to staff_messages INSERT to play a sound + bump count instantly.
 */
export const useMessageUnread = () => {
  const { user } = useAuth();
  const { isStaff, staffInfo } = useStaff();
  const { activeStore } = useStore();
  const [unreadCount, setUnreadCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initialLoadDone = useRef(false);

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
        initialLoadDone.current = true;
      }
    } catch {
      // Silently ignore fetch errors
    }
  }, [storeId, myId]);

  useEffect(() => {
    fetchCount();
    intervalRef.current = setInterval(fetchCount, 10000);

    // Realtime subscription — sound on incoming messages
    let channel: ReturnType<typeof supabase.channel> | null = null;
    if (storeId && myId) {
      const channelName = `msg-sound-${myId}-${Date.now()}`;
      channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "staff_messages",
            filter: `receiver_id=eq.${myId}`,
          },
          (payload) => {
            if (!initialLoadDone.current) return;
            const msg = payload.new as { sender_id?: string; store_id?: string };
            // Ignore self-echoes and cross-store leaks
            if (!msg || msg.sender_id === myId) return;
            if (msg.store_id && msg.store_id !== storeId) return;
            setUnreadCount((prev) => prev + 1);
            debouncedPlaySound("message");
          }
        );
      channel.subscribe();
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (channel) supabase.removeChannel(channel);
    };
  }, [fetchCount, storeId, myId]);

  return { unreadCount, refetch: fetchCount };
};
