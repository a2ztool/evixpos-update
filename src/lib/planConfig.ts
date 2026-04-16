/**
 * Centralized plan configuration — single source of truth.
 * Plan data must ONLY come from Supabase `subscriptions` table.
 */

export const VOLUME_STEPS = [500, 1000, 5000, 10000, 20000, 50000, 100000] as const;
export type VolumeStep = (typeof VOLUME_STEPS)[number];

/** INR base prices per volume step */
export const PRO_PRICES_INR: Record<VolumeStep, number> = {
  500: 349,
  1000: 449,
  5000: 549,
  10000: 849,
  20000: 1449,
  50000: 3449,
  100000: 6449,
};

export const BUSINESS_PRICES_INR: Record<VolumeStep, number> = {
  500: 449,
  1000: 549,
  5000: 749,
  10000: 949,
  20000: 1849,
  50000: 4449,
  100000: 8449,
};

export interface PlanLimits {
  maxProducts: number;
  maxCustomers: number;
  maxStores: number;
  integrations: boolean;
  analytics: boolean;
}

/** Get plan limits based on plan type and selected volume */
export const getPlanLimits = (plan: string, volume: VolumeStep = 500): PlanLimits => {
  switch (plan) {
    case "pro":
      return { maxProducts: 100, maxCustomers: volume, maxStores: 3, integrations: true, analytics: true };
    case "business":
      return { maxProducts: 500, maxCustomers: volume, maxStores: 10, integrations: true, analytics: true };
    case "free":
    default:
      return { maxProducts: 25, maxCustomers: 50, maxStores: 1, integrations: false, analytics: false };
  }
};

/** Get INR price for a plan + volume combo */
export const getPriceINR = (plan: string, volume: VolumeStep): number => {
  if (plan === "pro") return PRO_PRICES_INR[volume] ?? 349;
  if (plan === "business") return BUSINESS_PRICES_INR[volume] ?? 449;
  return 0;
};

/** Snap an arbitrary number to the nearest valid volume step */
export const snapToVolumeStep = (val: number): VolumeStep => {
  let closest = VOLUME_STEPS[0];
  let minDist = Math.abs(val - closest);
  for (const step of VOLUME_STEPS) {
    const dist = Math.abs(val - step);
    if (dist < minDist) {
      minDist = dist;
      closest = step;
    }
  }
  return closest;
};

/** Format volume for display */
export const formatVolume = (v: number): string => {
  if (v >= 1000) return `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}K`;
  return v.toLocaleString();
};

export const PLAN_FEATURES_LIST: Record<string, string[]> = {
  free: ["Up to 1 store", "Up to 50 customers", "Up to 25 products", "Basic POS"],
  pro: ["Up to 3 stores", "Volume-based customers", "Up to 100 products", "Integrations", "Analytics"],
  business: ["Up to 10 stores", "Volume-based customers", "Up to 500 products", "Integrations", "Analytics", "Priority support"],
};
