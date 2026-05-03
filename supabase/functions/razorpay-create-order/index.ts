// Razorpay: Create Order edge function
// - Validates user auth
// - Recomputes amount from server-side plans_config (never trusts frontend)
// - Creates Razorpay order
// - Persists pending row in plan_payments with razorpay_order_id

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VOLUME_STEPS = [500, 1000, 5000, 10000, 20000, 50000, 100000];
const PRO_PRICES_INR: Record<number, number> = {
  500: 349, 1000: 449, 5000: 549, 10000: 849, 20000: 1449, 50000: 3449, 100000: 6449,
};
const BUSINESS_PRICES_INR: Record<number, number> = {
  500: 449, 1000: 549, 5000: 749, 10000: 949, 20000: 1849, 50000: 4449, 100000: 8449,
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
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Resolve Razorpay keys: prefer admin-configured payment_gateways, fallback to env
    let RZP_KEY_ID = "";
    let RZP_KEY_SECRET = "";
    try {
      const { data: gw } = await admin
        .from("payment_gateways")
        .select("api_config")
        .ilike("gateway_name", "%razorpay%")
        .eq("is_active", true)
        .maybeSingle();
      const cfg = (gw?.api_config || {}) as Record<string, string>;
      RZP_KEY_ID = String(cfg.key_id || cfg.RAZORPAY_KEY_ID || cfg.keyId || "").trim();
      RZP_KEY_SECRET = String(cfg.key_secret || cfg.RAZORPAY_KEY_SECRET || cfg.keySecret || cfg.secret || "").trim();
    } catch { /* ignore */ }
    if (!RZP_KEY_ID) RZP_KEY_ID = (Deno.env.get("RAZORPAY_KEY_ID") || "").trim();
    if (!RZP_KEY_SECRET) RZP_KEY_SECRET = (Deno.env.get("RAZORPAY_KEY_SECRET") || "").trim();
    if (!RZP_KEY_ID || !RZP_KEY_SECRET) {
      return jsonResponse({ error: "Razorpay keys not configured by admin" }, 500);
    }

    // Validate caller JWT
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return jsonResponse({ error: "Unauthorized" }, 401);
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) return jsonResponse({ error: "Unauthorized" }, 401);
    const user = userData.user;

    const body = await req.json().catch(() => ({}));
    const plan = String(body.plan_id ?? body.plan ?? "").toLowerCase();
    const volume = Number(body.volume ?? 500);
    const billingType = body.billing_type === "yearly" ? "yearly" : "monthly";
    const couponCodeRaw = typeof body.coupon_code === "string" ? body.coupon_code.trim().toUpperCase() : "";

    if (!["pro", "business"].includes(plan)) {
      return jsonResponse({ error: "Invalid plan" }, 400);
    }
    if (!VOLUME_STEPS.includes(volume)) {
      return jsonResponse({ error: "Invalid volume" }, 400);
    }

    // Server-side price lookup: prefer plans_config, fallback to hardcoded
    let priceInr = 0;
    const { data: cfg } = await admin
      .from("plans_config")
      .select("price_inr")
      .eq("plan_type", plan)
      .eq("volume", volume)
      .maybeSingle();
    if (cfg?.price_inr) {
      priceInr = Number(cfg.price_inr);
    } else {
      priceInr = plan === "pro" ? PRO_PRICES_INR[volume] : BUSINESS_PRICES_INR[volume];
    }
    if (!priceInr || priceInr <= 0) {
      return jsonResponse({ error: "Could not determine price" }, 400);
    }

    // Yearly = 12 months with 20% discount (matches UI: monthly * 12 * 0.8)
    // Round to whole rupees to avoid float drift between UI and server.
    const rawBaseInr = billingType === "yearly" ? priceInr * 12 * 0.8 : priceInr;
    const baseInr = Math.round(rawBaseInr);
    if (baseInr <= 0 || baseInr > 1_000_000) {
      // Defense in depth: never create an order for absurd amounts
      return jsonResponse({ error: "Computed amount out of range" }, 400);
    }

    // Server-side coupon validation
    let discountInr = 0;
    let appliedCouponCode: string | null = null;
    let couponMeta: any = null;
    if (couponCodeRaw) {
      const { data: coupon } = await admin
        .from("platform_coupons")
        .select("*")
        .eq("code", couponCodeRaw)
        .eq("is_active", true)
        .maybeSingle();
      if (!coupon) {
        return jsonResponse({ error: "Invalid or inactive coupon code" }, 400);
      }
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
        if (dv > 100) {
          return jsonResponse({ error: "Invalid coupon configuration" }, 400);
        }
        discountInr = Math.round(baseInr * (dv / 100));
      } else {
        discountInr = Math.round(dv);
      }
      discountInr = Math.max(0, Math.min(discountInr, baseInr));
      appliedCouponCode = coupon.code;
      couponMeta = { id: coupon.id, type: coupon.discount_type, value: Number(coupon.discount_value) };
    }

    const finalInr = Math.max(1, baseInr - discountInr); // Razorpay min ₹1
    const amountPaise = Math.round(finalInr * 100);
    // Final hard guard
    if (amountPaise < 100 || amountPaise > 100_000_000) {
      return jsonResponse({ error: "Final amount out of allowed range" }, 400);
    }
    console.log("[razorpay-create-order]", {
      user: user.id, plan, volume, billingType,
      priceInr, baseInr, discountInr, finalInr, amountPaise,
      coupon: appliedCouponCode,
    });
    const receipt = `evx_${user.id.slice(0, 8)}_${Date.now()}`;

    // Create Razorpay order
    const auth = btoa(`${RZP_KEY_ID}:${RZP_KEY_SECRET}`);
    const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt,
        notes: {
          user_id: user.id,
          plan,
          volume: String(volume),
          billing_type: billingType,
        },
      }),
    });
    const rzpJson = await rzpRes.json();
    if (!rzpRes.ok) {
      console.error("Razorpay order create failed", rzpJson);
      return jsonResponse({ error: "Razorpay error", details: rzpJson }, 502);
    }

    // Persist pending payment
    const { error: insErr } = await admin.from("plan_payments").insert({
      user_id: user.id,
      plan,
      amount: finalInr,
      original_amount: baseInr,
      discount_amount: discountInr,
      final_amount: finalInr,
      applied_coupon_code: appliedCouponCode,
      currency: "INR",
      gateway: "razorpay",
      status: "pending",
      razorpay_order_id: rzpJson.id,
      volume,
      billing_type: billingType,
      payment_data: { receipt, amount_paise: amountPaise, coupon: couponMeta },
    });
    if (insErr) {
      console.error("plan_payments insert failed", insErr);
      // Order created on Razorpay but DB failed; still return order so client can retry verification
    }

    return jsonResponse({
      order_id: rzpJson.id,
      amount: amountPaise,
      currency: "INR",
      key_id: RZP_KEY_ID,
      receipt,
      original_amount: Math.round(baseInr * 100) / 100,
      discount_amount: Math.round(discountInr * 100) / 100,
      final_amount: Math.round(finalInr * 100) / 100,
      applied_coupon_code: appliedCouponCode,
    });
  } catch (e) {
    console.error("create-order error", e);
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
