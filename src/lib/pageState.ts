export const EXTERNAL_ACTION_UNTIL_KEY = "evix:external-action-until";

const DEFAULT_EXTERNAL_ACTION_MS = 15 * 60 * 1000;

export const isExternalActionActive = () => {
  if (typeof window === "undefined") return false;
  try {
    const until = Number(window.sessionStorage.getItem(EXTERNAL_ACTION_UNTIL_KEY) || 0);
    return Number.isFinite(until) && until > Date.now();
  } catch {
    return false;
  }
};

export const markExternalAction = (durationMs = DEFAULT_EXTERNAL_ACTION_MS) => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(EXTERNAL_ACTION_UNTIL_KEY, String(Date.now() + durationMs));
  } catch {
    /* storage unavailable — ignore */
  }
};

export const preservePageStateForExternalAction = (
  state: Record<string, unknown>,
  scrollKey: string,
  targetKey?: string,
  targetId?: string,
) => {
  if (typeof window === "undefined") return;
  try {
    Object.entries(state).forEach(([key, value]) => {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    });
    window.sessionStorage.setItem(scrollKey, String(window.scrollY));
    if (targetKey && targetId) window.sessionStorage.setItem(targetKey, targetId);
    markExternalAction();
  } catch {
    markExternalAction();
  }
};

export const openExternalUrlPreservingState = (
  url: string,
  state: Record<string, unknown>,
  scrollKey: string,
  targetKey?: string,
  targetId?: string,
) => {
  preservePageStateForExternalAction(state, scrollKey, targetKey, targetId);
  return window.open(url, "_blank", "noopener,noreferrer");
};