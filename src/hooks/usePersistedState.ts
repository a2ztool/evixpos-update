import { useEffect, useRef, useState } from "react";

/**
 * useState backed by sessionStorage so the value survives:
 *  - tab switches (e.g. opening WhatsApp / external app and returning)
 *  - service-worker triggered reloads
 *  - component remounts within the same browser session
 *
 * Scope is `sessionStorage` (per tab) so it does not bleed across tabs/devices.
 */
export function usePersistedState<T>(key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = window.sessionStorage.getItem(key);
      if (raw === null) return initial;
      return JSON.parse(raw) as T;
    } catch {
      return initial;
    }
  });

  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* quota / private mode — ignore */
    }
  }, [key, value]);

  return [value, setValue];
}

/**
 * Restores window scroll position for a given key. Saves on scroll and
 * before the page is hidden (pagehide / visibilitychange) so returning from
 * an external tab (WhatsApp, payment gateway, etc.) lands you exactly where
 * you left off — even after a service-worker triggered reload.
 *
 * Pass `ready` = false while async data is still loading so we don't restore
 * to a position the page hasn't grown into yet.
 */
export function useScrollRestoration(key: string, ready: boolean = true) {
  const restored = useRef(false);

  // Save on scroll (throttled via rAF) and on hide.
 useEffect(() => {
    let pending = false;
    const save = () => {
      try {
        window.sessionStorage.setItem(key, String(window.scrollY));
      } catch { /* ignore */ }
    };
    const onScroll = () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        save();
      });
    };
    const onHide = () => save();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      save();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [key]);

  // Restore once content is ready.
  useEffect(() => {
    if (restored.current || !ready) return;
    try {
      const raw = window.sessionStorage.getItem(key);
      if (raw !== null) {
        const y = Number(raw);
        if (!Number.isNaN(y) && y > 0) {
          // Wait a frame so the DOM has its final height.
          requestAnimationFrame(() => {
            window.scrollTo({ top: y, behavior: "auto" });
          });
        }
      }
    } catch { /* ignore */ }
    restored.current = true;
  }, [key, ready]);
}