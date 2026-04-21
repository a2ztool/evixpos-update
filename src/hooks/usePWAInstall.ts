import { useState, useEffect, useCallback } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Module-level singleton — survives component remounts so any mounted
// InstallAppButton can fire the prompt even if its component mounted AFTER
// the browser dispatched `beforeinstallprompt`.
let cachedPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<(p: BeforeInstallPromptEvent | null) => void>();
let globalListenersAttached = false;

const setCachedPrompt = (p: BeforeInstallPromptEvent | null) => {
  cachedPrompt = p;
  listeners.forEach((l) => l(p));
};

const attachGlobalListeners = () => {
  if (globalListenersAttached || typeof window === "undefined") return;
  globalListenersAttached = true;

  window.addEventListener("beforeinstallprompt", (e: Event) => {
    e.preventDefault();
    setCachedPrompt(e as BeforeInstallPromptEvent);
  });

  window.addEventListener("appinstalled", () => {
    setCachedPrompt(null);
  });
};

// Attach as soon as this module is loaded (before any component mounts).
attachGlobalListeners();

const checkStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true);

export const usePWAInstall = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(cachedPrompt);
  const [isInstalled, setIsInstalled] = useState(checkStandalone());
  const [isStandalone, setIsStandalone] = useState(checkStandalone());

  useEffect(() => {
    const listener = (p: BeforeInstallPromptEvent | null) => {
      setDeferredPrompt(p);
      if (p === null && checkStandalone()) setIsInstalled(true);
    };
    listeners.add(listener);

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener("appinstalled", handleAppInstalled);

    const mq = window.matchMedia("(display-mode: standalone)");
    const handleChange = (e: MediaQueryListEvent) => {
      setIsStandalone(e.matches);
      if (e.matches) setIsInstalled(true);
    };
    mq.addEventListener("change", handleChange);

    const refresh = () => {
      const s = checkStandalone();
      setIsStandalone(s);
      if (s) setIsInstalled(true);
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("visibilitychange", refresh);

    return () => {
      listeners.delete(listener);
      window.removeEventListener("appinstalled", handleAppInstalled);
      mq.removeEventListener("change", handleChange);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    const p = deferredPrompt ?? cachedPrompt;
    if (!p) return false;
    await p.prompt();
    const { outcome } = await p.userChoice;
    if (outcome === "accepted") {
      setIsInstalled(true);
    }
    setCachedPrompt(null);
    return outcome === "accepted";
  }, [deferredPrompt]);

  const canInstall = !!deferredPrompt && !isInstalled;

  return { canInstall, isInstalled, isStandalone, promptInstall };
};
