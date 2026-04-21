import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { SOUND_CATEGORY, TYPE_EMOJI, TYPE_LABEL } from "@/lib/notificationTriggers";
import { debouncedPlaySound, showDesktopNotification } from "@/lib/notificationSound";

export interface Notification {
  id: string;
  user_id: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

// ══════════════════════════════════════════════════════
// Main Hook
// ══════════════════════════════════════════════════════
export const useNotifications = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const initialLoadDone = useRef(false);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (data) {
      const typed = data as Notification[];
      setNotifications(typed);
      setUnreadCount(typed.filter((n) => !n.is_read).length);
      initialLoadDone.current = true;
    }
  }, [user]);

  useEffect(() => {
    fetchNotifications();

    if (!user) return;

    const channelName = `notif-rt-${user.id}-${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (!initialLoadDone.current) return;
          const n = payload.new as Notification;

          setNotifications((prev) => {
            if (prev.some((p) => p.id === n.id)) return prev;
            return [n, ...prev];
          });
          setUnreadCount((prev) => prev + 1);

          const emoji = TYPE_EMOJI[n.type] || "🔔";
          const label = TYPE_LABEL[n.type] || "Notification";
          const category = SOUND_CATEGORY[n.type] || "info";

          if (category === "error" || n.type === "payment_failed") {
            toast.error(`${emoji} ${n.message}`, { description: label });
          } else if (category === "alert") {
            toast.warning(`${emoji} ${n.message}`, { description: label });
          } else {
            toast.success(`${emoji} ${n.message}`, { description: label });
          }

          debouncedPlaySound(n.type);
          showDesktopNotification(label, n.message, n.type);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const updated = payload.new as Notification;
          setNotifications((prev) =>
            prev.map((n) => (n.id === updated.id ? { ...n, ...updated } : n))
          );
          setUnreadCount((prev) => {
            if (updated.is_read) return Math.max(0, prev - 1);
            return prev;
          });
        }
      );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchNotifications]);

  const markAsRead = async (id: string) => {
    await supabase.from("notifications").update({ is_read: true } as any).eq("id", id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from("notifications").update({ is_read: true } as any).eq("user_id", user.id).eq("is_read", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  const clearAll = async () => {
    if (!user) return;
    await supabase.from("notifications").delete().eq("user_id", user.id);
    setNotifications([]);
    setUnreadCount(0);
  };

  return { notifications, unreadCount, markAsRead, markAllRead, clearAll, refetch: fetchNotifications };
};
