import { supabase } from "@/integrations/supabase/client";

export interface CreateInvoiceArgs {
  plan: "pro" | "business";
  volume: number;
  billing_type: "monthly" | "yearly";
  coupon_code?: string;
}

export interface CreateInvoiceResult {
  payment_url: string;
  val_id: string;
  invoice_id: string | null;
  original_amount: number;
  discount_amount: number;
  final_amount: number;
  currency: "BDT";
  applied_coupon_code: string | null;
}

const ZINIPAY_VAL_KEY = "evx_zinipay_pending_val_id";

export async function createZinipayInvoice(
  args: CreateInvoiceArgs,
): Promise<CreateInvoiceResult> {
  const redirectOrigin =
    typeof window !== "undefined" ? window.location.origin : "";
  const { data, error } = await supabase.functions.invoke(
    "zinipay-create-invoice",
    {
      body: {
        plan_id: args.plan,
        volume: args.volume,
        billing_type: args.billing_type,
        coupon_code: args.coupon_code,
        redirect_origin: redirectOrigin,
      },
    },
  );
  if (error) {
    const details = typeof error.context === "object" && error.context !== null
      ? (error.context as { details?: string; error?: string })
      : null;
    throw new Error(details?.details || details?.error || error.message || "Failed to create invoice");
  }
  if (!data?.payment_url) {
    throw new Error(data?.error || "Invalid response from ZiniPay");
  }
  return data as CreateInvoiceResult;
}

export interface VerifyResult {
  status: "COMPLETED" | "PENDING" | "FAILED" | string;
  transaction_id?: string | null;
  payment_method?: string | null;
  amount?: number | null;
  already?: boolean;
  reason?: string;
}

export async function verifyZinipayPayment(valId: string): Promise<VerifyResult> {
  const { data, error } = await supabase.functions.invoke(
    "zinipay-verify-payment",
    { body: { val_id: valId } },
  );
  if (error) throw new Error(error.message || "Verification failed");
  return data as VerifyResult;
}

export function rememberPendingValId(valId: string) {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ZINIPAY_VAL_KEY, valId);
    }
  } catch { /* ignore */ }
}

export function readPendingValId(): string | null {
  try {
    if (typeof window !== "undefined") {
      return window.localStorage.getItem(ZINIPAY_VAL_KEY);
    }
  } catch { /* ignore */ }
  return null;
}

export function clearPendingValId() {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(ZINIPAY_VAL_KEY);
    }
  } catch { /* ignore */ }
}