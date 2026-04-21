// ══════════════════════════════════════════════════════════════════
// Centralized Notification Sound Engine
// — Web Audio API based, type-aware, debounced
// — Audio unlock on first user gesture (mobile / autoplay policies)
// — Resumes context on visibility change for background tab playback
// ══════════════════════════════════════════════════════════════════
import { SOUND_CATEGORY } from "@/lib/notificationTriggers";

type Prefs = {
  masterEnabled?: boolean;
  soundEnabled?: boolean;
  desktopNotifications?: boolean;
  volume?: number[];
  eventPrefs?: Record<string, boolean>;
};

export const getNotificationPrefs = (): Prefs => {
  try {
    const saved = localStorage.getItem("notification_prefs");
    if (saved) return JSON.parse(saved);
  } catch {}
  return { masterEnabled: true, soundEnabled: true, volume: [70] };
};

export const setNotificationPrefs = (patch: Partial<Prefs>) => {
  try {
    const prev = getNotificationPrefs();
    const next = { ...prev, ...patch };
    localStorage.setItem("notification_prefs", JSON.stringify(next));
    // Notify listeners (other tabs already get 'storage'; same-tab needs custom event)
    window.dispatchEvent(new CustomEvent("notification-prefs-changed", { detail: next }));
    return next;
  } catch {
    return getNotificationPrefs();
  }
};

// ──────────────────────────────────────────────────────────────────
// Shared AudioContext (one per page) + unlock
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
    // Tiny silent buffer to satisfy autoplay policies
    const buffer = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start(0);
    unlocked = true;
  } catch {}
};

// Install once
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
    if (!document.hidden) getCtx(); // resume if suspended
  });
}

// ──────────────────────────────────────────────────────────────────
// Tone scheduler — uses ONE shared context (no leaks)
// ──────────────────────────────────────────────────────────────────
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
      // Distinct gentle two-tone for messages, single chime for info
      if (type === "message") {
        scheduleTone(ctx, 660, 0, 0.12, volume);
        scheduleTone(ctx, 990, 0.1, 0.18, volume * 0.85);
      } else {
        scheduleTone(ctx, 800, 0, 0.25, volume);
      }
      break;
  }
};

// ──────────────────────────────────────────────────────────────────
// Debounce — prevent spam when many events fire rapidly
// ──────────────────────────────────────────────────────────────────
let lastSoundTime = 0;
const SOUND_DEBOUNCE_MS = 1500;

export const debouncedPlaySound = (type: string) => {
  const now = Date.now();
  if (now - lastSoundTime < SOUND_DEBOUNCE_MS) return;
  lastSoundTime = now;
  playNotificationSound(type);
};

// ──────────────────────────────────────────────────────────────────
// Desktop notification helper
// ──────────────────────────────────────────────────────────────────
export const showDesktopNotification = (title: string, body: string, type: string) => {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const prefs = getNotificationPrefs();
  if (prefs.masterEnabled === false || prefs.desktopNotifications === false) return;
  try {
    new window.Notification(title, {
      body,
      icon: "/favicon.ico",
      tag: `notif-${type}-${Date.now()}`,
      silent: true,
    });
  } catch {}
};
