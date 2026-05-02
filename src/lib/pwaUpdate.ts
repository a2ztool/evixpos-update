// ════════════════════════════════════════════════════════════════
// PWA Update Manager
// ════════════════════════════════════════════════════════════════
// - Registers /sw.js and watches for new versions
// - Polls for updates every 60s + on visibility/online events
// - When a new SW is waiting, fires onUpdateReady callback
//   so the UI can show a "New update available – Refresh" toast
// - Falls back to a build-version check (BUILD_ID in localStorage)
//   to force a hard reload if HTML somehow served stale JS
// ════════════════════════════════════════════════════════════════

import { toast } from "sonner";

// Vite injects a fresh hash on every build → great as a build id
declare const __BUILD_TIME__: string;
const BUILD_ID = (import.meta.env.VITE_BUILD_ID as string | undefined) || `${import.meta.env.MODE}-${__BUILD_TIME__}`;
const STORAGE_KEY = "evix_build_id";
const UPDATE_POLL_MS = 30_000;

let updateToastShown = false;

const isInIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();
const isPreviewHost =
  typeof window !== "undefined" &&
  (window.location.hostname.includes("id-preview--") ||
   window.location.hostname.includes("lovableproject.com"));

function activateUpdate(reg: ServiceWorkerRegistration) {
  if (updateToastShown) return;
  updateToastShown = true;

  const waiting = reg.waiting;
  // Brief toast so user sees what's happening, then auto-reload via controllerchange
  toast("🚀 Updating to the latest version…", { duration: 2500 });

  if (waiting) {
    waiting.postMessage({ type: "SKIP_WAITING" });
    // controllerchange listener below will reload the page
  } else {
    setTimeout(() => window.location.reload(), 600);
  }
}

function trackInstalling(installing: ServiceWorker, reg: ServiceWorkerRegistration) {
  installing.addEventListener("statechange", () => {
    if (installing.state === "installed" && navigator.serviceWorker.controller) {
      // A new SW is waiting → activate it immediately
      activateUpdate(reg);
    }
  });
}

function checkBuildVersion() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      localStorage.setItem(STORAGE_KEY, BUILD_ID);
      return;
    }
    if (stored !== BUILD_ID) {
      // Build changed since last load → update stored id
      // (page is already running new JS; nothing to reload)
      localStorage.setItem(STORAGE_KEY, BUILD_ID);
    }
  } catch {
    // localStorage unavailable — ignore
  }
}

export function initPwaUpdate() {
  if (typeof window === "undefined") return;
  checkBuildVersion();

  // In preview/iframe: aggressively unregister any SW so editor stays fresh
  if (isPreviewHost || isInIframe) {
    navigator.serviceWorker?.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister());
    });
    return;
  }

  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });

      // If there's already a waiting worker on first load
      if (reg.waiting && navigator.serviceWorker.controller) {
        activateUpdate(reg);
      }

      // Watch new installs
      if (reg.installing) trackInstalling(reg.installing, reg);
      reg.addEventListener("updatefound", () => {
        if (reg.installing) trackInstalling(reg.installing, reg);
      });

      // Poll for updates periodically + on focus/online
      const triggerCheck = () => reg.update().catch(() => {});
      setInterval(triggerCheck, UPDATE_POLL_MS);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") triggerCheck();
      });
      window.addEventListener("online", triggerCheck);

      // When the new SW takes control, reload once so UI is fresh
      let reloading = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloading) return;
        reloading = true;
        window.location.reload();
      });
    } catch {
      // SW registration failed — non-fatal
    }
  });
}
