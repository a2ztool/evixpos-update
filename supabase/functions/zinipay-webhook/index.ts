// ZiniPay webhook handler
// - Public endpoint (verify_jwt = false). ZiniPay does not provide signature.
// - SECURITY: Always re-verify with /v1/payment/verify before activating.
// - Idempotent: safe to call multiple times.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Activate subscription based on a paid plan_payments row. Idempotent. */
async function activateForPayment(admin: any, payment: any, ziniData: any) {
  if (payment.status === "paid" || payment.status === "approved") {
    console.log("[zinipay] payment already processed, skipping", payment.id);
    return;
  }

  await admin
    .from("plan_payments")
    .update({
      status: "paid",
      zinipay_transaction_id: ziniData?.transaction_id || null,
      zinipay_payment_method: ziniData?.payment_method || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", payment.id);

  const newPlan = payment.plan;
  const billingType = payment.billing_type === "yearly" ? "yearly" : "monthly";
  const durationDays = billingType === "yearly" ? 365 : 30;
  const endDate = new Date(Date.now() + durationDays * 86400000).toISOString();

  // Deactivate existing active account-level subscriptions
  await admin
    .from("subscriptions")
    .update({ status: "inactive" })
    .eq("user_id", payment.user_id)
    .eq("status", "active")
    .is("customer_id", null)
    .in("plan", ["free", "pro", "business"]);

  await admin.from("subscriptions").insert({
    user_id: payment.user_id,
    plan: newPlan,
    status: "active",
    end_date: endDate,
    volume: payment.volume,
    price: payment.amount,
    billing_type: billingType,
  });

  // Increment coupon usage (best-effort)
  if (payment.applied_coupon_code) {
    const { data: cpn } = await admin
      .from("platform_coupons")
      .select("id, used_count")
      .eq("code", payment.applied_coupon_code)
      .maybeSingle();
    if (cpn) {
      await admin
        .from("platform_coupons")
        .update({ used_count: (cpn.used_count ?? 0) + 1 })
        .eq("id", cpn.id);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ZINI_API_KEY = Deno.env.get("ZINIPAY_API_KEY");
    if (!ZINI_API_KEY) {
      console.error("Missing ZINIPAY_API_KEY");
      return jsonResponse({ error: "Misconfigured" }, 500);
    }

    // Extract invoice_id + val_id from JSON body or query string
    let invoiceId: string | null = null;
    let valId: string | null = null;
    let bodyStatus: string | null = null;

    const url = new URL(req.url);
    invoiceId = url.searchParams.get("invoice_id");
    valId = url.searchParams.get("val_id");
    bodyStatus = url.searchParams.get("status");

    if (req.method === "POST") {
      try {
        const body = await req.json();
        invoiceId = invoiceId || body?.invoice_id || null;
        valId = valId || body?.val_id || null;
        bodyStatus = bodyStatus || body?.status || null;
      } catch { /* body might be empty/non-json */ }
    }

    console.log("[zinipay-webhook] received", { invoiceId, valId, bodyStatus });

    if (!invoiceId && !valId) {
      return jsonResponse({ error: "Missing invoice_id or val_id" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Look up our pending payment
    const query = admin.from("plan_payments")
      .select("id, user_id, plan, volume, billing_type, amount, final_amount, applied_coupon_code, status, zinipay_invoice_id, zinipay_val_id");
    const { data: payment } = valId
      ? await query.eq("zinipay_val_id", valId).maybeSingle()
      : await query.eq("zinipay_invoice_id", invoiceId!).maybeSingle();

    if (!payment) {
      console.warn("[zinipay-webhook] no plan_payments row", { invoiceId, valId });
      return jsonResponse({ ok: true, found: false });
    }

    // Always re-verify with ZiniPay (security)
    const verifyId = invoiceId || payment.zinipay_invoice_id;
    if (!verifyId) {
      console.warn("[zinipay-webhook] no invoice_id to verify");
      return jsonResponse({ ok: true, unverified: true });
    }

    const verifyRes = await fetch("https://api.zinipay.com/v1/payment/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "zini-api-key": ZINI_API_KEY,
      },
      body: JSON.stringify({ invoice_id: verifyId }),
    });
    const verifyJson = await verifyRes.json().catch(() => ({}));
    if (!verifyRes.ok) {
      console.error("[zinipay-webhook] verify failed", verifyRes.status, verifyJson);
      return jsonResponse({ ok: false, verify_failed: true }, 200);
    }

    const upstreamStatus = String(verifyJson?.status || "").toUpperCase();
    console.log("[zinipay-webhook] verified", { upstreamStatus, verifyJson });

    if (upstreamStatus === "COMPLETED") {
      // Amount cross-check
      const expected = Number(payment.final_amount ?? payment.amount);
      const received = Number(verifyJson?.amount);
      if (Number.isFinite(expected) && Number.isFinite(received) && Math.abs(expected - received) > 1) {
        console.error("[zinipay-webhook] amount mismatch", { expected, received });
        return jsonResponse({ ok: true, mismatch: true });
      }
      await activateForPayment(admin, payment, verifyJson);
    } else if (upstreamStatus === "FAILED") {
      await admin.from("plan_payments")
        .update({ status: "rejected", reviewed_at: new Date().toISOString() })
        .eq("id", payment.id);
    }
    // PENDING — do nothing, keep waiting

    return jsonResponse({ ok: true, status: upstreamStatus });
  } catch (e) {
    console.error("zinipay-webhook error", e);
    return jsonResponse({ ok: false, error: (e as Error).message }, 200);
  }
});