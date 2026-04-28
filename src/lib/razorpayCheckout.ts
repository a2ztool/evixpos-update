import { supabase } from "@/integrations/supabase/client";

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
  /** Razorpay hosted Payment Link URL — redirect the browser here. */
  payment_link_url?: string;
  payment_link_id?: string;
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

/**
 * Redirect the browser to Razorpay's fully hosted checkout page.
 * Branding (logo, theme color, font) is controlled from the Razorpay Dashboard.
 */
export const redirectToRazorpayHosted = (url: string): void => {
  if (!url) throw new Error("Missing Razorpay payment link URL");
  window.location.href = url;
};
