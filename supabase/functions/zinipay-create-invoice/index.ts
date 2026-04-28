// ZiniPay: Create Invoice edge function
// - Validates user JWT
// - Recomputes BDT amount server-side from plans_config (never trusts client)
// - Validates coupon if provided
// - Calls ZiniPay /v1/payment/create
// - Persists pending row in plan_payments with zinipay_invoice_id + val_id

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VOLUME_STEPS = [500, 1000, 5000, 10000, 20000, 50000, 100000];
// Fallback BDT prices (used if plans_config has no price_bdt)
const PRO_PRICES_BDT: Record<number, number> = {
  500: 500, 1000: 650, 5000: 800, 10000: 1230, 20000: 2100, 50000: 5000, 100000: 9350,
};
const BUSINESS_PRICES_BDT: Record<number, number> = {
  500: 650, 1000: 800, 5000: 1090, 10000: 1380, 20000: 2680, 50000: 6450, 100000: 12250,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ZINI_API_KEY = Deno.env.get("ZINIPAY_API_KEY");
    if (!ZINI_API_KEY) {
      return jsonResponse({ error: "ZiniPay API key not configured" }, 500);
    }

    // Validate caller JWT
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return jsonResponse({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) return jsonResponse({ error: "Unauthorized" }, 401);
    const user = userData.user;

    const body = await req.json().catch(() => ({}));
    const plan = String(body.plan_id ?? body.plan ?? "").toLowerCase();
    const volume = Number(body.volume ?? 500);
    const billingType = body.billing_type === "yearly" ? "yearly" : "monthly";
    const couponCodeRaw = typeof body.coupon_code === "string"
      ? body.coupon_code.trim().toUpperCase()
      : "";
    const redirectOrigin = String(body.redirect_origin || "").replace(/\/+$/, "");
    if (!redirectOrigin || !/^https?:\/\//.test(redirectOrigin)) {
      return jsonResponse({ error: "Invalid redirect_origin" }, 400);
    }

    if (!["pro", "business"].includes(plan)) {
      return jsonResponse({ error: "Invalid plan" }, 400);
    }
    if (!VOLUME_STEPS.includes(volume)) {
      return jsonResponse({ error: "Invalid volume" }, 400);
    }

    // Server-side BDT price lookup
    let priceBdt = 0;
    const { data: cfg } = await admin
      .from("plans_config")
      .select("price_bdt")
      .eq("plan_type", plan)
      .eq("volume", volume)
      .maybeSingle();
    if (cfg?.price_bdt) {
      priceBdt = Number(cfg.price_bdt);
    } else {
      priceBdt = plan === "pro" ? PRO_PRICES_BDT[volume] : BUSINESS_PRICES_BDT[volume];
    }
    if (!priceBdt || priceBdt <= 0) {
      return jsonResponse({ error: "Could not determine price" }, 400);
    }

    // Yearly = 12 months with 20% discount
    const rawBaseBdt = billingType === "yearly" ? priceBdt * 12 * 0.8 : priceBdt;
    const baseBdt = Math.round(rawBaseBdt);
    if (baseBdt <= 0 || baseBdt > 2_000_000) {
      return jsonResponse({ error: "Computed amount out of range" }, 400);
    }

    // Server-side coupon validation
    let discountBdt = 0;
    let appliedCouponCode: string | null = null;
    let couponMeta: any = null;
    if (couponCodeRaw) {
      const { data: coupon } = await admin
        .from("platform_coupons")
        .select("*")
        .eq("code", couponCodeRaw)
        .eq("is_active", true)
        .maybeSingle();
      if (!coupon) return jsonResponse({ error: "Invalid or inactive coupon code" }, 400);
      if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
        return jsonResponse({ error: "This coupon has expired" }, 400);
      }
      if (coupon.max_uses > 0 && coupon.used_count >= coupon.max_uses) {
        return jsonResponse({ error: "This coupon has reached its usage limit" }, 400);
      }
      const dv = Number(coupon.discount_value);
      if (!Number.isFinite(dv) || dv < 0) {
        return jsonResponse({ error: "Invalid coupon configuration" }, 400);
      }
      if (coupon.discount_type === "percentage") {
        if (dv > 100) return jsonResponse({ error: "Invalid coupon configuration" }, 400);
        discountBdt = Math.round(baseBdt * (dv / 100));
      } else {
        discountBdt = Math.round(dv);
      }
      discountBdt = Math.max(0, Math.min(discountBdt, baseBdt));
      appliedCouponCode = coupon.code;
      couponMeta = { id: coupon.id, type: coupon.discount_type, value: dv };
    }

    const finalBdt = Math.max(1, baseBdt - discountBdt);
    if (finalBdt < 1 || finalBdt > 2_000_000) {
      return jsonResponse({ error: "Final amount out of allowed range" }, 400);
    }

    // Generate unique val_id (our internal reference)
    const valId = `EVX-${user.id.slice(0, 8)}-${Date.now()}`;

    // Resolve customer name/email from profiles
    let cusName = user.user_metadata?.name || user.email?.split("@")[0] || "Customer";
    let cusEmail = user.email || "noreply@evixpos.com";
    try {
      const { data: profile } = await admin
        .from("profiles").select("name, email").eq("id", user.id).maybeSingle();
      if (profile?.name) cusName = profile.name;
      if (profile?.email) cusEmail = profile.email;
    } catch { /* ignore */ }

    const webhookUrl = `${SUPABASE_URL}/functions/v1/zinipay-webhook`;
    const redirectUrl = `${redirectOrigin}/payment/zinipay/success?val_id=${encodeURIComponent(valId)}`;
    const cancelUrl = `${redirectOrigin}/payment/zinipay/cancel?val_id=${encodeURIComponent(valId)}`;

    console.log("[zinipay-create-invoice]", {
      user: user.id, plan, volume, billingType,
      priceBdt, baseBdt, discountBdt, finalBdt, valId,
    });

    // Call ZiniPay Create Invoice API
    const ziniRes = await fetch("https://api.zinipay.com/v1/payment/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "zini-api-key": ZINI_API_KEY,
      },
      body: JSON.stringify({
        cus_name: cusName,
        cus_email: cusEmail,
        amount: finalBdt,
        metadata: {
          plan, volume, billing: billingType, user_id: user.id,
          coupon: appliedCouponCode || null,
        },
        redirect_url: redirectUrl,
        cancel_url: cancelUrl,
        val_id: valId,
        webhook_url: webhookUrl,
      }),
    });
    const ziniJson = await ziniRes.json().catch(() => ({}));
    if (!ziniRes.ok || !ziniJson?.payment_url) {
      console.error("ZiniPay create failed", ziniRes.status, ziniJson);
      return jsonResponse(
        { error: "ZiniPay error", details: ziniJson?.message || ziniJson },
        502,
      );
    }

    // Extract invoice_id from payment_url (last path segment)
    let zinipayInvoiceId: string | null = null;
    try {
      const u = new URL(ziniJson.payment_url);
      const parts = u.pathname.split("/").filter(Boolean);
      zinipayInvoiceId = parts[parts.length - 1] || null;
    } catch { /* ignore */ }

    // Persist pending payment
    const { error: insErr } = await admin.from("plan_payments").insert({
      user_id: user.id,
      plan,
      amount: finalBdt,
      original_amount: baseBdt,
      discount_amount: discountBdt,
      final_amount: finalBdt,
      applied_coupon_code: appliedCouponCode,
      currency: "BDT",
      gateway: "zinipay",
      status: "pending",
      zinipay_invoice_id: zinipayInvoiceId,
      zinipay_val_id: valId,
      volume,
      billing_type: billingType,
      payment_data: {
        coupon: couponMeta,
        payment_url: ziniJson.payment_url,
        webhook_url: webhookUrl,
        redirect_url: redirectUrl,
      },
    });
    if (insErr) {
      console.error("plan_payments insert failed", insErr);
    }

    return jsonResponse({
      payment_url: ziniJson.payment_url,
      val_id: valId,
      invoice_id: zinipayInvoiceId,
      original_amount: baseBdt,
      discount_amount: discountBdt,
      final_amount: finalBdt,
      currency: "BDT",
      applied_coupon_code: appliedCouponCode,
    });
  } catch (e) {
    console.error("zinipay-create-invoice error", e);
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});