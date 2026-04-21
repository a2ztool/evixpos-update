// ══════════════════════════════════════════════════════════════════
// Centralized Notification Sound Engine
// — Web Audio API based, type-aware, debounced
// — Audio unlock on first user gesture (mobile / autoplay policies)
// — Resumes context on visibility change for background tab playback
// — Honors masterEnabled / soundEnabled / quiet hours / event toggles
// — DB sync helpers for cross-device preferences
// ══════════════════════════════════════════════════════════════════
import { SOUND_CATEGORY } from "@/lib/notificationTriggers";
import { supabase } from "@/integrations/supabase/client";

export type EventPref = { enabled: boolean; sound: boolean; priority?: boolean };

export type NotificationPrefs = {
  masterEnabled?: boolean;
  soundEnabled?: boolean;
  desktopNotifications?: boolean;
  volume?: number[];
  soundType?: string;
  eventPrefs?: Record<string, EventPref>;
  quietHours?: { enabled: boolean; start: string; end: string }; // "HH:mm"
};

// ──────────────────────────────────────────────────────────────────
// Notification type → event-pref key mapping (used at runtime to gate)
// ──────────────────────────────────────────────────────────────────
const TYPE_TO_EVENT_KEY: Record<string, string> = {
  order: "new_order",
  order_pending: "new_order",
  pos_sale: "new_order",
  order_completed: "order_completed",
  customer: "new_customer",
  customer_due: "new_customer",
  payment: "payment_received",
  refund: "payment_received",
  low_stock: "low_stock",
  subscription: "subscription_expiring",
  subscription_expired: "subscription_expiring",
  integration: "woocommerce_order",
  message: "new_message",
};

export const getNotificationPrefs = (): NotificationPrefs => {
  try {
    const saved = localStorage.getItem("notification_prefs");
    if (saved) return JSON.parse(saved);
  } catch {}
  return { masterEnabled: true, soundEnabled: true, volume: [70] };
};

export const setNotificationPrefs = (patch: Partial<NotificationPrefs>) => {
  try {
    const prev = getNotificationPrefs();
    const next = { ...prev, ...patch };
    localStorage.setItem("notification_prefs", JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("notification-prefs-changed", { detail: next }));
    return next;
  } catch {
    return getNotificationPrefs();
  }
};

// ──────────────────────────────────────────────────────────────────
// DB sync — preferences live in business_settings.notification_prefs
// ──────────────────────────────────────────────────────────────────
const resolveOwnerId = async (authUserId: string): Promise<string> => {
  try {
    const { data: staff } = await supabase
      .from("staff_members")
      .select("user_id")
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    return staff?.user_id || authUserId;
  } catch {
    return authUserId;
  }
};

export const loadPrefsFromDB = async (): Promise<NotificationPrefs | null> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;
    const ownerId = await resolveOwnerId(session.user.id);
    const { data } = await (supabase as any)
      .from("business_settings")
      .select("notification_prefs")
      .eq("user_id", ownerId)
      .maybeSingle();
    const prefs = data?.notification_prefs as NotificationPrefs | undefined;
    if (prefs && Object.keys(prefs).length > 0) {
      // Merge with localStorage so we keep any local-only fields
      const merged = { ...getNotificationPrefs(), ...prefs };
      localStorage.setItem("notification_prefs", JSON.stringify(merged));
      window.dispatchEvent(new CustomEvent("notification-prefs-changed", { detail: merged }));
      return merged;
    }
    return null;
  } catch {
    return null;
  }
};

export const savePrefsToDB = async (prefs: NotificationPrefs): Promise<boolean> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return false;
    const ownerId = await resolveOwnerId(session.user.id);
    const { error } = await (supabase as any)
      .from("business_settings")
      .update({ notification_prefs: prefs })
      .eq("user_id", ownerId);
    return !error;
  } catch {
    return false;
  }
};

// ──────────────────────────────────────────────────────────────────
// Quiet hours / event-toggle gating
// ──────────────────────────────────────────────────────────────────
const isInQuietHours = (qh?: { enabled: boolean; start: string; end: string }): boolean => {
  if (!qh?.enabled || !qh.start || !qh.end) return false;
  const [sh, sm] = qh.start.split(":").map(Number);
  const [eh, em] = qh.end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return false;
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  // Handles overnight ranges (e.g. 22:00 → 07:00)
  return start < end ? cur >= start && cur < end : cur >= start || cur < end;
};

export const isEventEnabled = (type: string): boolean => {
  const prefs = getNotificationPrefs();
  if (prefs.masterEnabled === false) return false;
  const eventKey = TYPE_TO_EVENT_KEY[type];
  if (!eventKey) return true; // unknown types default to enabled
  const ep = prefs.eventPrefs?.[eventKey];
  return ep?.enabled !== false;
};

export const isEventSoundEnabled = (type: string): boolean => {
  const prefs = getNotificationPrefs();
  if (prefs.masterEnabled === false || prefs.soundEnabled === false) return false;
  if (isInQuietHours(prefs.quietHours)) return false;
  const eventKey = TYPE_TO_EVENT_KEY[type];
  if (!eventKey) return true;
  const ep = prefs.eventPrefs?.[eventKey];
  return ep?.sound !== false;
};

// ──────────────────────────────────────────────────────────────────
// Shared AudioContext + unlock
// ──────────────────────────────────────────────────────────────────
let sharedCtx: AudioContext | null = null;
let unlocked = false;

const getCtx = (): AudioContext | null => {
  try {
    if (!sharedCtx) {
      const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return null;
      sharedCtx = new Ctor();
    }
    if (sharedCtx?.state === "suspended") {
      sharedCtx.resume().catch(() => {});
    }
    return sharedCtx;
  } catch {
    return null;
  }
};

const unlockAudio = () => {
  if (unlocked) return;
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const buffer = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start(0);
    unlocked = true;
  } catch {}
};

if (typeof window !== "undefined") {
  const onGesture = () => {
    unlockAudio();
    if (unlocked) {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
      window.removeEventListener("touchstart", onGesture);
    }
  };
  window.addEventListener("pointerdown", onGesture, { once: false });
  window.addEventListener("keydown", onGesture, { once: false });
  window.addEventListener("touchstart", onGesture, { once: false });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) getCtx();
  });
}

const scheduleTone = (
  ctx: AudioContext,
  freq: number,
  startOffset: number,
  duration: number,
  volume: number,
  type: OscillatorType = "sine"
) => {
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const t0 = ctx.currentTime + startOffset;
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  } catch {}
};

export const playNotificationSound = (type: string = "info") => {
  const prefs = getNotificationPrefs();
  if (prefs.masterEnabled === false || prefs.soundEnabled === false) return;
  if (isInQuietHours(prefs.quietHours)) return;

  const volume = ((prefs.volume?.[0] ?? 70) / 100) * 0.4;
  const category = SOUND_CATEGORY[type] || (type === "message" ? "info" : "info");
  const ctx = getCtx();
  if (!ctx) return;

  switch (category) {
    case "order":
      scheduleTone(ctx, 880, 0, 0.3, volume);
      scheduleTone(ctx, 1100, 0.2, 0.25, volume * 0.8);
      scheduleTone(ctx, 1320, 0.4, 0.25, volume * 0.8);
      scheduleTone(ctx, 1100, 0.6, 0.25, volume * 0.8);
      break;
    case "payment":
      scheduleTone(ctx, 1200, 0, 0.15, volume);
      scheduleTone(ctx, 1600, 0.12, 0.3, volume * 0.9);
      break;
    case "alert":
      scheduleTone(ctx, 600, 0, 0.2, volume, "triangle");
      scheduleTone(ctx, 600, 0.3, 0.2, volume, "triangle");
      break;
    case "success":
      scheduleTone(ctx, 880, 0, 0.2, volume);
      scheduleTone(ctx, 1175, 0.15, 0.3, volume * 0.8);
      break;
    case "error":
      scheduleTone(ctx, 300, 0, 0.4, volume * 0.7, "square");
      break;
    default:
      if (type === "message") {
        scheduleTone(ctx, 660, 0, 0.12, volume);
        scheduleTone(ctx, 990, 0.1, 0.18, volume * 0.85);
      } else {
        scheduleTone(ctx, 800, 0, 0.25, volume);
      }
      break;
  }
};

// Debounce
let lastSoundTime = 0;
const SOUND_DEBOUNCE_MS = 1500;
export const debouncedPlaySound = (type: string) => {
  const now = Date.now();
  if (now - lastSoundTime < SOUND_DEBOUNCE_MS) return;
  lastSoundTime = now;
  playNotificationSound(type);
};

// Desktop notification
export const showDesktopNotification = (title: string, body: string, type: string) => {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const prefs = getNotificationPrefs();
  if (prefs.masterEnabled === false || prefs.desktopNotifications === false) return;
  if (isInQuietHours(prefs.quietHours)) return;
  try {
    new window.Notification(title, {
      body,
      icon: "/favicon.ico",
      tag: `notif-${type}-${Date.now()}`,
      silent: true,
    });
  } catch {}
};

// Auto-load DB prefs on auth change (cross-device sync)
if (typeof window !== "undefined") {
  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
      loadPrefsFromDB();
    }
  });
}
