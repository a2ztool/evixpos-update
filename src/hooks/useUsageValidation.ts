import { useState, useCallback } from "react";
import { useUsageLimits } from "@/hooks/useUsageLimits";
import { useSubscription } from "@/hooks/useSubscription";

/**
 * Strict usage validation hook.
 * Returns check functions that validate against global limits.
 */
export const useUsageValidation = () => {
  const { plan, volume } = useSubscription();
  const usage = useUsageLimits(plan, volume);
  const [modal, setModal] = useState<{
    open: boolean;
    type: "products" | "customers" | "stores";
    current: number;
    max: number;
  }>({ open: false, type: "products", current: 0, max: 0 });

  /** Returns true if user can add more of the given type */
  const canAdd = useCallback(
    (type: "products" | "customers" | "stores"): boolean => {
      if (usage.loading) return true; // allow while loading
      switch (type) {
        case "products":
          return usage.totalProducts < usage.maxProducts;
        case "customers":
          return usage.totalCustomers < usage.maxCustomers;
        case "stores":
          return usage.totalStores < usage.maxStores;
        default:
          return true;
      }
    },
    [usage]
  );

  /** Checks and opens upgrade modal if limit reached. Returns true if allowed. */
  const checkAndPrompt = useCallback(
    (type: "products" | "customers" | "stores"): boolean => {
      if (canAdd(type)) return true;
      const map = {
        products: { current: usage.totalProducts, max: usage.maxProducts },
        customers: { current: usage.totalCustomers, max: usage.maxCustomers },
        stores: { current: usage.totalStores, max: usage.maxStores },
      };
      setModal({ open: true, type, ...map[type] });
      return false;
    },
    [canAdd, usage]
  );

  const closeModal = useCallback(() => setModal((p) => ({ ...p, open: false })), []);

  return { canAdd, checkAndPrompt, modal, closeModal, usage };
};
