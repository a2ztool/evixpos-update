import { supabase } from "@/integrations/supabase/client";

declare global {
  interface Window {
    Razorpay?: any;
  }
}

let scriptPromise: Promise<boolean> | null = null;

export const loadRazorpayScript = (): Promise<boolean> => {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => { scriptPromise = null; resolve(false); };
    document.body.appendChild(s);
  });
  return scriptPromise;
};

export interface CreateOrderArgs {
  plan: "pro" | "business";
  volume: number;
  billing_type: "monthly" | "yearly";
  coupon_code?: string;
}

export interface CreateOrderResult {
  order_id: string;
  amount: number; // in paise
  currency: string;
  key_id: string;
  receipt: string;
  original_amount?: number;
  discount_amount?: number;
  final_amount?: number;
  applied_coupon_code?: string | null;
}

export const createRazorpayOrder = async (args: CreateOrderArgs): Promise<CreateOrderResult> => {
  const { data, error } = await supabase.functions.invoke("razorpay-create-order", {
    body: {
      plan_id: args.plan,
      volume: args.volume,
      billing_type: args.billing_type,
      coupon_code: args.coupon_code,
    },
  });
  if (error) throw new Error(error.message || "Failed to create order");
  if (!data?.order_id) throw new Error(data?.error || "Invalid order response");
  return data as CreateOrderResult;
};

/* ------------------------------------------------------------------ */
/* Dynamic brand resolution                                           */
/* ------------------------------------------------------------------ */

/** Convert "H S% L%" (the format we store in CSS vars) to "#rrggbb". */
function hslVarToHex(hslString: string): string | null {
  const m = hslString.trim().match(/^(-?\d*\.?\d+)\s+(-?\d*\.?\d+)%\s+(-?\d*\.?\d+)%$/);
  if (!m) return null;
  const h = parseFloat(m[1]) / 360;
  const s = parseFloat(m[2]) / 100;
  const l = parseFloat(m[3]) / 100;
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = (x: number) =>
    Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Read the current EvixPOS brand color from the CSS `--primary` token. */
export function getBrandPrimaryHex(): string {
  if (typeof document === "undefined") return "#22c55e";
  try {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue("--primary")
      .trim();
    const hex = v ? hslVarToHex(v) : null;
    return hex || "#22c55e";
  } catch {
    return "#22c55e";
  }
}

export interface BrandInfo {
  name: string;
  logoUrl: string;
  themeColor: string;
}

let brandCache: BrandInfo | null = null;

/** Fetch brand_name + brand_logo from landing_content; cache for the session. */
export async function fetchBrandInfo(): Promise<BrandInfo> {
  if (brandCache) return brandCache;
  const themeColor = getBrandPrimaryHex();
  let name = "EvixPOS";
  let logoUrl = "";
  try {
    const { data } = await supabase
      .from("landing_content")
      .select("key,value")
      .in("key", ["brand_name", "brand_logo"]);
    for (const row of data || []) {
      if (row.key === "brand_name" && row.value) name = row.value;
      if (row.key === "brand_logo" && row.value) logoUrl = row.value;
    }
  } catch {
    /* ignore — fall back to defaults */
  }
  brandCache = { name, logoUrl, themeColor };
  return brandCache;
}

export interface OpenCheckoutArgs extends CreateOrderResult {
  planName: string;
  prefill?: { name?: string; email?: string; contact?: string };
  onSuccess: (resp: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }) => void;
  onDismiss?: () => void;
  onFailure?: (err: any) => void;
}

export const openRazorpayCheckout = async (args: OpenCheckoutArgs): Promise<void> => {
  const ok = await loadRazorpayScript();
  if (!ok || !window.Razorpay) throw new Error("Razorpay SDK failed to load");

  // Defensive cleanup: Radix Dialog / other modal libraries may leave
  // `pointer-events: none` on <body> or scroll-lock styles that would
  // block clicks inside Razorpay's iframe (Continue, Close, OTP fields).
  if (typeof document !== "undefined") {
    document.body.style.pointerEvents = "";
    document.body.style.overflow = "";
    document.documentElement.style.pointerEvents = "";
    document.documentElement.style.overflow = "";
    // Remove any lingering Radix overlay nodes that weren't cleaned up
    document
      .querySelectorAll<HTMLElement>("[data-radix-focus-guard]")
      .forEach((el) => el.remove());
  }

  const brand = await fetchBrandInfo();

  const options: Record<string, unknown> = {
    key: args.key_id,
    amount: args.amount,
    currency: args.currency,
    name: brand.name,
    description: `${args.planName} subscription`,
    order_id: args.order_id,
    prefill: {
      name: args.prefill?.name || "",
      email: args.prefill?.email || "",
      contact: args.prefill?.contact || "",
    },
    theme: {
      color: brand.themeColor,
      backdrop_color: "rgba(0,0,0,0.6)",
    },
    modal: {
      backdropclose: false,
      escape: true,
      ondismiss: () => args.onDismiss?.(),
    },
    handler: (response: any) => args.onSuccess(response),
  };
  if (brand.logoUrl) options.image = brand.logoUrl;

  const rzp = new window.Razorpay(options);
  rzp.on("payment.failed", (resp: any) => args.onFailure?.(resp.error));
  rzp.open();
};
