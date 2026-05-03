// Razorpay: Verify payment (client-side fallback to webhook)
// - Verifies HMAC signature: HMAC_SHA256(order_id + "|" + payment_id, KEY_SECRET)
// - Marks plan_payments as paid and activates subscription
// - Idempotent: safe to call even if webhook already processed it

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

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
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
    let RZP_KEY_SECRET = "";
    try {
      const { data: rows } = await admin
        .from("payment_gateways")
        .select("api_config, is_active, gateway_name")
        .or("gateway_name.ilike.%razorpay%,gateway_name.ilike.%razor%");
      const candidates = (rows || []).filter((r: any) => r.is_active !== false);
      for (const row of candidates) {
        const cfg = (row.api_config || {}) as Record<string, unknown>;
        const sec = cfg.key_secret ?? cfg.RAZORPAY_KEY_SECRET ?? cfg.keySecret ?? cfg.razorpay_key_secret ?? cfg.secret;
        if (typeof sec === "string" && sec.trim()) { RZP_KEY_SECRET = sec.trim(); break; }
      }
    } catch { /* ignore */ }
    if (!RZP_KEY_SECRET) RZP_KEY_SECRET = (Deno.env.get("RAZORPAY_KEY_SECRET") || "").trim();
    if (!RZP_KEY_SECRET) return jsonResponse({ error: "Razorpay not configured by admin" }, 500);

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return jsonResponse({ error: "Unauthorized" }, 401);
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) return jsonResponse({ error: "Unauthorized" }, 401);
    const user = userData.user;

    const body = await req.json().catch(() => ({}));
    const orderId = String(body.razorpay_order_id || "").trim();
    const paymentId = String(body.razorpay_payment_id || "").trim();
    const signature = String(body.razorpay_signature || "").trim();
    if (!orderId || !paymentId || !signature) {
      return jsonResponse({ error: "Missing fields" }, 400);
    }

    // Verify HMAC signature
    const expected = await hmacSha256Hex(RZP_KEY_SECRET, `${orderId}|${paymentId}`);
    if (!timingSafeEqual(signature, expected)) {
      console.warn("[verify] Invalid signature", { orderId, user: user.id });
      return jsonResponse({ error: "Invalid signature" }, 400);
    }

    // Lookup pending payment
    const { data: payment, error: pErr } = await admin
      .from("plan_payments")
      .select("id, user_id, plan, volume, billing_type, amount, applied_coupon_code, status")
      .eq("razorpay_order_id", orderId)
      .maybeSingle();
    if (pErr || !payment) {
      console.error("[verify] payment not found", { orderId, pErr });
      return jsonResponse({ error: "Payment record not found" }, 404);
    }
    if (payment.user_id !== user.id) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }
    if (payment.status === "paid") {
      return jsonResponse({ ok: true, already: true });
    }

    // Mark paid
    await admin
      .from("plan_payments")
      .update({
        status: "paid",
        razorpay_payment_id: paymentId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", payment.id);

    // Activate subscription
    const billingType = payment.billing_type === "yearly" ? "yearly" : "monthly";
    const durationDays = billingType === "yearly" ? 365 : 30;
    const endDate = new Date(Date.now() + durationDays * 86400000).toISOString();

    await admin
      .from("subscriptions")
      .update({ status: "inactive" })
      .eq("user_id", payment.user_id)
      .eq("status", "active")
      .is("customer_id", null)
      .in("plan", ["free", "pro", "business"]);

    const { error: subErr } = await admin.from("subscriptions").insert({
      user_id: payment.user_id,
      plan: payment.plan,
      status: "active",
      end_date: endDate,
      volume: payment.volume,
      price: payment.amount,
      billing_type: billingType,
    });
    if (subErr) {
      console.error("[verify] subscription insert failed", subErr);
      return jsonResponse({ error: "Activation failed" }, 500);
    }

    // Best-effort coupon increment
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

    console.log("[verify] activated", { user: user.id, plan: payment.plan });
    return jsonResponse({ ok: true, plan: payment.plan, end_date: endDate });
  } catch (e) {
    console.error("verify error", e);
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});