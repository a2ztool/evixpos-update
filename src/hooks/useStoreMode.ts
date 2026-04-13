import { useStore } from "@/contexts/StoreContext";
import { useCallback } from "react";

/** Features that are ONLY available in online mode */
const ONLINE_ONLY_FEATURES = [
  "woocommerce",
  "bot_automation",
  "order_forms",
  "subscriptions",
  "ad_costs",
  "google_sheets",
] as const;

/** Features that are ONLY available in offline mode */
const OFFLINE_ONLY_FEATURES = [] as const;

export type StoreModeFeature = string;

/**
 * Central hook for store-mode-based feature toggling.
 * Use this to check if a feature should be visible/available
 * based on the current active store's mode (online/offline).
 */
export const useStoreMode = () => {
  const { activeStore } = useStore();
  const isOffline = activeStore?.store_mode === "offline";
  const isOnline = !isOffline;
  const storeMode = activeStore?.store_mode ?? "online";

  /**
   * Returns true if the given feature is allowed in the current store mode.
   */
  const isModeFeatureAllowed = useCallback(
    (feature: StoreModeFeature): boolean => {
      if (isOffline && (ONLINE_ONLY_FEATURES as readonly string[]).includes(feature)) {
        return false;
      }
      if (isOnline && (OFFLINE_ONLY_FEATURES as readonly string[]).includes(feature)) {
        return false;
      }
      return true;
    },
    [isOffline, isOnline]
  );

  return {
    storeMode,
    isOnline,
    isOffline,
    isModeFeatureAllowed,
  };
};
