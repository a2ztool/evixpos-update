import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { SOUND_CATEGORY, TYPE_EMOJI, TYPE_LABEL } from "@/lib/notificationTriggers";

export interface Notification {
  id: string;
  user_id: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

// ══════════════════════════════════════════════════════
// Sound Engine — Web Audio API based, type-aware
// ══════════════════════════════════════════════════════
const getNotificationPrefs = () => {
  try {
    const saved = localStorage.getItem("notification_prefs");
    if (saved) return JSON.parse(saved);
  } catch {}
  return { masterEnabled: true, soundEnabled: true, volume: [70] };
};

const playNotificationSound = (type: string = "info") => {
  const prefs = getNotificationPrefs();
  if (!prefs.masterEnabled || !prefs.soundEnabled) return;

  const volume = ((prefs.volume?.[0] ?? 70) / 100) * 0.4;
  const category = SOUND_CATEGORY[type] || "info";

  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    switch (category) {
      case "order": {
        // Distinctive multi-tone chime for orders
        osc.frequency.value = 880;
        osc.type = "sine";
        gain.gain.value = volume;
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.stop(ctx.currentTime + 0.35);
        // Follow-up tones
        const orderTones = [1100, 1320, 1100];
        orderTones.forEach((freq, i) => {
          setTimeout(() => {
            try {
              const c = new AudioContext();
              const o = c.createOscillator();
              const g = c.createGain();
              o.connect(g); g.connect(c.destination);
              o.frequency.value = freq;
              o.type = "sine";
              g.gain.value = volume * 0.8;
              o.start();
              g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.25);
              o.stop(c.currentTime + 0.3);
            } catch {}
          }, (i + 1) * 200);
        });
        break;
      }
      case "payment": {
        // Cash register ka-ching sound
        osc.frequency.value = 1200;
        osc.type = "sine";
        gain.gain.value = volume;
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.stop(ctx.currentTime + 0.2);
        setTimeout(() => {
          try {
            const c = new AudioContext();
            const o = c.createOscillator();
            const g = c.createGain();
            o.connect(g); g.connect(c.destination);
            o.frequency.value = 1600;
            o.type = "sine";
            g.gain.value = volume * 0.9;
            o.start();
            g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.3);
            o.stop(c.currentTime + 0.35);
          } catch {}
        }, 120);
        break;
      }
      case "alert": {
        // Urgent double-beep
        osc.frequency.value = 600;
        osc.type = "triangle";
        gain.gain.value = volume;
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        osc.stop(ctx.currentTime + 0.25);
        setTimeout(() => {
          try {
            const c = new AudioContext();
            const o = c.createOscillator();
            const g = c.createGain();
            o.connect(g); g.connect(c.destination);
            o.frequency.value = 600;
            o.type = "triangle";
            g.gain.value = volume;
            o.start();
            g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.2);
            o.stop(c.currentTime + 0.25);
          } catch {}
        }, 300);
        break;
      }
      case "success": {
        osc.frequency.value = 880;
        osc.type = "sine";
        gain.gain.value = volume;
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        osc.stop(ctx.currentTime + 0.25);
        setTimeout(() => {
          try {
            const c = new AudioContext();
            const o = c.createOscillator();
            const g = c.createGain();
            o.connect(g); g.connect(c.destination);
            o.frequency.value = 1175;
            o.type = "sine";
            g.gain.value = volume * 0.8;
            o.start();
            g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.3);
            o.stop(c.currentTime + 0.35);
          } catch {}
        }, 150);
        break;
      }
      case "error": {
        osc.frequency.value = 300;
        osc.type = "square";
        gain.gain.value = volume * 0.7;
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.stop(ctx.currentTime + 0.45);
        break;
      }
      default: {
        // info — gentle chime
        osc.frequency.value = 800;
        osc.type = "sine";
        gain.gain.value = volume;
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc.stop(ctx.currentTime + 0.3);
        break;
      }
    }
  } catch {
    // Audio not available
  }
};

// ══════════════════════════════════════════════════════
// Sound debouncing — prevent spam when many events fire
// ══════════════════════════════════════════════════════
let lastSoundTime = 0;
const SOUND_DEBOUNCE_MS = 1500;

const debouncedPlaySound = (type: string) => {
  const now = Date.now();
  if (now - lastSoundTime < SOUND_DEBOUNCE_MS) return;
  lastSoundTime = now;
  playNotificationSound(type);
};

// ══════════════════════════════════════════════════════
// Desktop Notification helper
// ══════════════════════════════════════════════════════
const showDesktopNotification = (title: string, body: string, type: string) => {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const prefs = getNotificationPrefs();
  if (!prefs.masterEnabled || !prefs.desktopNotifications) return;

  try {
    new window.Notification(title, {
      body,
      icon: "/favicon.ico",
      tag: `notif-${type}-${Date.now()}`,
      silent: true, // We handle sound separately
    });
  } catch {}
};

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

    // Realtime subscription for new notifications
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
          // Only play sound/toast for genuinely new events (after initial load)
          if (!initialLoadDone.current) return;

          const n = payload.new as Notification;

          // Prevent processing same notification twice (multi-tab)
          setNotifications((prev) => {
            if (prev.some((p) => p.id === n.id)) return prev;
            return [n, ...prev];
          });
          setUnreadCount((prev) => prev + 1);

          // Toast notification
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

          // Sound (debounced)
          debouncedPlaySound(n.type);

          // Desktop notification
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
          // Sync read status across tabs
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
