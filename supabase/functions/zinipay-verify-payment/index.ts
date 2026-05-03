// ZiniPay: Verify Payment edge function
// - Called by frontend after redirect to /payment/zinipay/success
// - Safety net in case webhook didn't fire
// - Validates user JWT and re-verifies with ZiniPay; activates plan if COMPLETED

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function activateForPayment(admin: any, payment: any, ziniData: any) {
  if (payment.status === "paid" || payment.status === "approved") return;
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

  await admin.from("subscriptions")
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

  if (payment.applied_coupon_code) {
    const { data: cpn } = await admin
      .from("platform_coupons")
      .select("id, used_count")
      .eq("code", payment.applied_coupon_code)
      .maybeSingle();
    if (cpn) {
      await admin.from("platform_coupons")
        .update({ used_count: (cpn.used_count ?? 0) + 1 })
        .eq("id", cpn.id);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    let ZINI_API_KEY = "";
    try {
      const { data: gw } = await admin
        .from("payment_gateways")
        .select("api_config")
        .ilike("gateway_name", "%zinipay%")
        .eq("is_active", true)
        .maybeSingle();
      const cfg = (gw?.api_config || {}) as Record<string, string>;
      ZINI_API_KEY = String(cfg.api_key || cfg.apiKey || cfg.ZINIPAY_API_KEY || cfg.key || "").trim();
    } catch { /* ignore */ }
    if (!ZINI_API_KEY) ZINI_API_KEY = (Deno.env.get("ZINIPAY_API_KEY") || "").trim();
    if (!ZINI_API_KEY) return jsonResponse({ error: "ZiniPay API key not configured by admin" }, 500);

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return jsonResponse({ error: "Unauthorized" }, 401);
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) return jsonResponse({ error: "Unauthorized" }, 401);
    const user = userData.user;

    const body = await req.json().catch(() => ({}));
    const valId = String(body?.val_id || "").trim();
    if (!valId) return jsonResponse({ error: "Missing val_id" }, 400);

    const { data: payment } = await admin
      .from("plan_payments")
      .select("id, user_id, plan, volume, billing_type, amount, final_amount, applied_coupon_code, status, zinipay_invoice_id, zinipay_val_id")
      .eq("zinipay_val_id", valId)
      .maybeSingle();

    if (!payment) return jsonResponse({ error: "Payment not found" }, 404);
    if (payment.user_id !== user.id) return jsonResponse({ error: "Forbidden" }, 403);

    // Already done
    if (payment.status === "paid" || payment.status === "approved") {
      return jsonResponse({ status: "COMPLETED", already: true });
    }

    if (!payment.zinipay_invoice_id) {
      return jsonResponse({ status: "PENDING", reason: "no_invoice_id" });
    }

    const verifyRes = await fetch("https://api.zinipay.com/v1/payment/verify", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "zini-api-key": ZINI_API_KEY,
        "zinipay-api-key": ZINI_API_KEY,
      },
      body: JSON.stringify({ invoice_id: payment.zinipay_invoice_id }),
    });
    const verifyJson = await verifyRes.json().catch(() => ({}));
    if (!verifyRes.ok) {
      console.error("[zinipay-verify] failed", verifyRes.status, verifyJson);
      return jsonResponse({ error: "Verification failed", details: verifyJson }, 502);
    }

    const upstreamStatus = String(verifyJson?.status || "").toUpperCase();

    if (upstreamStatus === "COMPLETED") {
      const expected = Number(payment.final_amount ?? payment.amount);
      const received = Number(verifyJson?.amount);
      if (Number.isFinite(expected) && Number.isFinite(received) && Math.abs(expected - received) > 1) {
        console.error("[zinipay-verify] amount mismatch", { expected, received });
        return jsonResponse({ status: "FAILED", reason: "amount_mismatch" });
      }
      await activateForPayment(admin, payment, verifyJson);
    } else if (upstreamStatus === "FAILED") {
      await admin.from("plan_payments")
        .update({ status: "rejected", reviewed_at: new Date().toISOString() })
        .eq("id", payment.id);
    }

    return jsonResponse({
      status: upstreamStatus,
      transaction_id: verifyJson?.transaction_id || null,
      payment_method: verifyJson?.payment_method || null,
      amount: verifyJson?.amount || null,
    });
  } catch (e) {
    console.error("zinipay-verify error", e);
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});