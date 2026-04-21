// ════════════════════════════════════════════════════════════════
// Web Push Subscription Hook
// ────────────────────────────────────────────────────────────────
// - Registers /sw.js in production deploys (NOT in Lovable preview/iframe)
// - Requests Notification permission
// - Subscribes via PushManager and persists to push_subscriptions table
// ════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const VAPID_PUBLIC_KEY =
  "BONe3ra8bucP44-DXlrEFqnMsoNZeptZ-PDshM4CoTn2XsUdbwLfLJri-MhVY7iafsBy8QJS4Ae5DLXtvNbmfBI";

const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

const isPreviewHost =
  typeof window !== "undefined" &&
  (window.location.hostname.includes("id-preview--") ||
    window.location.hostname.includes("lovableproject.com"));

const isPushBlocked = isInIframe || isPreviewHost;

const isPushSupported = () =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

export type PushStatus =
  | "unsupported"
  | "preview-blocked"
  | "denied"
  | "default"
  | "subscribed"
  | "loading";

export const useWebPush = () => {
  const { user } = useAuth();
  const [status, setStatus] = useState<PushStatus>("loading");

  const refreshStatus = useCallback(async () => {
    if (!isPushSupported()) {
      setStatus("unsupported");
      return;
    }
    if (isPushBlocked) {
      setStatus("preview-blocked");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      setStatus(sub ? "subscribed" : Notification.permission === "granted" ? "default" : "default");
    } catch {
      setStatus("default");
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // Auto-register SW once in production. Does NOT auto-prompt — user must click.
  useEffect(() => {
    if (!isPushSupported() || isPushBlocked) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  const subscribe = useCallback(async () => {
    if (!user) {
      toast.error("Please sign in first");
      return false;
    }
    if (!isPushSupported()) {
      toast.error("Push notifications not supported on this browser");
      return false;
    }
    if (isPushBlocked) {
      toast.info("Push only works on the published app, not the preview");
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "default");
        toast.error("Notification permission denied");
        return false;
      }

      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      const json = sub.toJSON();
      const endpoint = json.endpoint!;
      const p256dh = json.keys?.p256dh!;
      const auth = json.keys?.auth!;

      // Upsert by endpoint (unique). Insert; on conflict, ignore (already saved).
      const { error } = await supabase
        .from("push_subscriptions")
        .upsert(
          {
            user_id: user.id,
            endpoint,
            p256dh,
            auth,
            user_agent: navigator.userAgent.slice(0, 255),
            last_used_at: new Date().toISOString(),
          },
          { onConflict: "endpoint" }
        );

      if (error) throw error;

      setStatus("subscribed");
      toast.success("🔔 Push notifications enabled");
      return true;
    } catch (err: any) {
      console.error("[push] subscribe failed", err);
      toast.error("Could not enable push: " + (err?.message || "unknown"));
      return false;
    }
  }, [user]);

  const unsubscribe = useCallback(async () => {
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
      }
      setStatus("default");
      toast.success("Push notifications disabled");
      return true;
    } catch (err) {
      console.error("[push] unsubscribe failed", err);
      return false;
    }
  }, []);

  return { status, subscribe, unsubscribe, refreshStatus, isBlocked: isPushBlocked };
};
