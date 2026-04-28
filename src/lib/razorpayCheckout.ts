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

export interface OpenCheckoutArgs extends CreateOrderResult {
  planName: string;
  prefill?: { name?: string; email?: string; contact?: string };
  onSuccess: (resp: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => void;
  onDismiss?: () => void;
  onFailure?: (err: any) => void;
}

export const openRazorpayCheckout = async (args: OpenCheckoutArgs): Promise<void> => {
  const ok = await loadRazorpayScript();
  if (!ok || !window.Razorpay) throw new Error("Razorpay SDK failed to load");

  const rzp = new window.Razorpay({
    key: args.key_id,
    amount: args.amount,
    currency: args.currency,
    name: "EvixPOS",
    description: `${args.planName} subscription`,
    order_id: args.order_id,
    prefill: {
      name: args.prefill?.name || "",
      email: args.prefill?.email || "",
      contact: args.prefill?.contact || "",
    },
    theme: { color: "#6366f1" },
    handler: (response: any) => args.onSuccess(response),
    modal: { ondismiss: () => args.onDismiss?.() },
  });
  rzp.on("payment.failed", (resp: any) => args.onFailure?.(resp.error));
  rzp.open();
};
