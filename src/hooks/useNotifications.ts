import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface Notification {
  id: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

// Different notification sounds per type
const playNotificationSound = (type: string = "info") => {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    switch (type) {
      case "success":
        osc.frequency.value = 880;
        osc.type = "sine";
        gain.gain.value = 0.25;
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc.stop(ctx.currentTime + 0.25);
        // Second tone for success chime
        setTimeout(() => {
          try {
            const ctx2 = new AudioContext();
            const osc2 = ctx2.createOscillator();
            const gain2 = ctx2.createGain();
            osc2.connect(gain2);
            gain2.connect(ctx2.destination);
            osc2.frequency.value = 1175;
            osc2.type = "sine";
            gain2.gain.value = 0.2;
            osc2.start();
            gain2.gain.exponentialRampToValueAtTime(0.001, ctx2.currentTime + 0.3);
            osc2.stop(ctx2.currentTime + 0.3);
          } catch {}
        }, 150);
        break;
      case "error":
        osc.frequency.value = 300;
        osc.type = "square";
        gain.gain.value = 0.2;
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.stop(ctx.currentTime + 0.4);
        break;
      case "warning":
        osc.frequency.value = 600;
        osc.type = "triangle";
        gain.gain.value = 0.25;
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.stop(ctx.currentTime + 0.35);
        break;
      default: // info / new_customer etc
        osc.frequency.value = 800;
        osc.type = "sine";
        gain.gain.value = 0.3;
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.stop(ctx.currentTime + 0.3);
        break;
      case "order":
        // Multi-tone 5-second alert for new orders
        osc.frequency.value = 880;
        osc.type = "sine";
        gain.gain.value = 0.3;
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.stop(ctx.currentTime + 0.45);
        // Chain additional tones
        [1100, 880, 1100, 880, 1320, 880, 1100, 880].forEach((freq, i) => {
          try {
            const ctxN = new AudioContext();
            const oscN = ctxN.createOscillator();
            const gainN = ctxN.createGain();
            oscN.connect(gainN);
            gainN.connect(ctxN.destination);
            oscN.frequency.value = freq;
            oscN.type = "sine";
            const t = ctxN.currentTime;
            gainN.gain.setValueAtTime(0.25, t);
            gainN.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
            setTimeout(() => { oscN.start(); oscN.stop(ctxN.currentTime + 0.4); }, (i + 1) * 500);
          } catch {}
        });
        break;
    }
  } catch {
    // Audio not available
  }
};

export const useNotifications = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) {
      setNotifications(data as Notification[]);
      setUnreadCount((data as Notification[]).filter((n) => !n.is_read).length);
    }
  }, [user]);

  useEffect(() => {
    fetchNotifications();

    if (!user) return;

    const channelName = `notifications-${user.id}-${Date.now()}`;
    const channel = supabase.channel(channelName);

    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
      (payload) => {
        const n = payload.new as Notification;
        setNotifications((prev) => [n, ...prev]);
        setUnreadCount((prev) => prev + 1);

        const toastFn = n.type === "error" ? toast.error : n.type === "warning" ? toast.warning : toast.success;
        toastFn(n.message);
        playNotificationSound(n.type);
      }
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchNotifications]);

  const markAsRead = async (id: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
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
