/**
 * PlansConfigContext — fetches plans_config from Supabase with realtime updates.
 * Falls back to hardcoded planConfig.ts values if table doesn't exist yet.
 */
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  VOLUME_STEPS,
  PRO_PRICES_INR,
  BUSINESS_PRICES_INR,
  getPlanLimits as getHardcodedLimits,
  type VolumeStep,
  formatVolume,
  PLAN_FEATURES_LIST,
} from "@/lib/planConfig";

export interface PlanConfigRow {
  plan_type: string;
  volume: number;
  price_inr: number;
  price_bdt?: number | null;
  store_limit: number;
  product_limit: number;
  customer_limit: number;
}

interface PlansConfigContextValue {
  configs: PlanConfigRow[];
  loading: boolean;
  getPriceINR: (plan: string, volume: VolumeStep) => number;
  getPriceBDT: (plan: string, volume: VolumeStep) => number;
  getPlanLimits: (plan: string, volume?: VolumeStep | null) => {
    maxProducts: number;
    maxCustomers: number;
    maxStores: number;
    integrations: boolean;
    analytics: boolean;
  };
  refetch: () => void;
}

const PlansConfigContext = createContext<PlansConfigContextValue | null>(null);

export const PlansConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [configs, setConfigs] = useState<PlanConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchConfigs = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("plans_config" as any)
        .select("plan_type, volume, price_inr, price_bdt, store_limit, product_limit, customer_limit");
      if (error) {
        console.warn("plans_config table not available, using hardcoded values");
        setConfigs([]);
      } else {
        setConfigs((data as any[]) || []);
      }
    } catch {
      setConfigs([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  // Realtime subscription
  useEffect(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    const ch = supabase
      .channel(`plans-config-realtime-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "plans_config" }, () => {
        fetchConfigs();
      })
      .subscribe();
    channelRef.current = ch;
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [fetchConfigs]);

  const getPriceINR = useCallback(
    (plan: string, volume: VolumeStep): number => {
      if (plan === "free") return 0;
      if (configs.length > 0) {
        const row = configs.find((c) => c.plan_type === plan && c.volume === volume);
        if (row) return Number(row.price_inr);
      }
      // Fallback to hardcoded
      if (plan === "pro") return PRO_PRICES_INR[volume] ?? 349;
      if (plan === "business") return BUSINESS_PRICES_INR[volume] ?? 449;
      return 0;
    },
    [configs]
  );

  const getPriceBDT = useCallback(
    (plan: string, volume: VolumeStep): number => {
      if (plan === "free") return 0;
      if (configs.length > 0) {
        const row = configs.find((c) => c.plan_type === plan && c.volume === volume);
        if (row && row.price_bdt != null) return Number(row.price_bdt);
      }
      // Fallback: derive from INR (1 INR ≈ 1.45 BDT)
      const inr = plan === "pro"
        ? (PRO_PRICES_INR[volume] ?? 349)
        : (BUSINESS_PRICES_INR[volume] ?? 449);
      return Math.round(inr * 1.45);
    },
    [configs]
  );

  const getPlanLimits = useCallback(
    (plan: string, volume?: VolumeStep | null) => {
      const vol = (volume ?? 500) as VolumeStep;
      if (plan === "free") {
        if (configs.length > 0) {
          const row = configs.find((c) => c.plan_type === "free");
          if (row) {
            return {
              maxProducts: row.product_limit,
              maxCustomers: row.customer_limit,
              maxStores: row.store_limit,
              integrations: false,
              analytics: false,
            };
          }
        }
        return getHardcodedLimits("free", vol);
      }
      if (configs.length > 0) {
        const row = configs.find((c) => c.plan_type === plan && c.volume === vol);
        if (row) {
          return {
            maxProducts: row.product_limit,
            maxCustomers: row.customer_limit,
            maxStores: row.store_limit,
            integrations: true,
            analytics: true,
          };
        }
      }
      return getHardcodedLimits(plan, vol);
    },
    [configs]
  );

  return (
    <PlansConfigContext.Provider value={{ configs, loading, getPriceINR, getPriceBDT, getPlanLimits, refetch: fetchConfigs }}>
      {children}
    </PlansConfigContext.Provider>
  );
};

export const usePlansConfig = (): PlansConfigContextValue => {
  const ctx = useContext(PlansConfigContext);
  if (!ctx) {
    // If used outside provider, return hardcoded fallback
    return {
      configs: [],
      loading: false,
      getPriceINR: (plan, volume) => {
        if (plan === "pro") return PRO_PRICES_INR[volume] ?? 349;
        if (plan === "business") return BUSINESS_PRICES_INR[volume] ?? 449;
        return 0;
      },
      getPriceBDT: (plan, volume) => {
        const inr = plan === "pro"
          ? (PRO_PRICES_INR[volume] ?? 349)
          : (BUSINESS_PRICES_INR[volume] ?? 449);
        return Math.round(inr * 1.45);
      },
      getPlanLimits: (plan, volume) => getHardcodedLimits(plan, (volume ?? 500) as VolumeStep),
      refetch: () => {},
    };
  }
  return ctx;
};

export { VOLUME_STEPS, formatVolume, PLAN_FEATURES_LIST };
export type { VolumeStep };
