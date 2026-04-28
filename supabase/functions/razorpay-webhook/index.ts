// Razorpay webhook handler
// - Verifies HMAC SHA256 signature using RAZORPAY_WEBHOOK_SECRET
// - Idempotent: logs each event in razorpay_webhook_events; skips duplicates
// - On payment.captured: marks plan_payments paid + activates subscription

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-razorpay-signature, x-razorpay-event-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const WEBHOOK_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
  if (!WEBHOOK_SECRET) {
    console.error("Missing RAZORPAY_WEBHOOK_SECRET");
    return new Response("Misconfigured", { status: 500, headers: corsHeaders });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature") || "";
  const expected = await hmacSha256Hex(WEBHOOK_SECRET, rawBody);
  if (!timingSafeEqual(signature, expected)) {
    console.warn("Invalid Razorpay signature");
    return new Response("Invalid signature", { status: 400, headers: corsHeaders });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
  }

  const eventType: string = event?.event ?? "";
  // Razorpay webhooks include header `x-razorpay-event-id`; fall back to deterministic ID
  const headerEventId = req.headers.get("x-razorpay-event-id");
  const paymentEntity = event?.payload?.payment?.entity;
  const orderEntity = event?.payload?.order?.entity;
  const eventId =
    headerEventId ||
    `${eventType}:${paymentEntity?.id ?? orderEntity?.id ?? crypto.randomUUID()}`;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Idempotency: insert event log; if duplicate, skip processing
  const { error: logErr } = await admin
    .from("razorpay_webhook_events")
    .insert({ event_id: eventId, event_type: eventType, payload: event });
  if (logErr) {
    if ((logErr as any).code === "23505") {
      // duplicate, already processed
      return new Response(JSON.stringify({ ok: true, duplicate: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("Failed to log webhook event", logErr);
  }

  try {
    if (eventType === "payment.captured" && paymentEntity) {
      const orderId: string = paymentEntity.order_id;
      const paymentId: string = paymentEntity.id;

      // Find pending payment
      const { data: payment, error: pErr } = await admin
        .from("plan_payments")
        .select("id, user_id, plan, volume, billing_type, amount, final_amount, applied_coupon_code, status, payment_data")
        .eq("razorpay_order_id", orderId)
        .maybeSingle();
      if (pErr) console.error("plan_payments lookup error", pErr);

      if (!payment) {
        console.warn("[webhook] no plan_payments row for order", orderId);
      } else if (payment.status === "paid") {
        console.log("[webhook] order already paid, skipping", orderId);
      } else {
        // Amount cross-check: Razorpay paymentEntity.amount is in paise
        const expectedPaise = Number((payment as any).payment_data?.amount_paise);
        const receivedPaise = Number(paymentEntity.amount);
        if (Number.isFinite(expectedPaise) && Math.abs(expectedPaise - receivedPaise) > 1) {
          console.error("[webhook] amount mismatch — refusing to activate", {
            orderId, expectedPaise, receivedPaise,
          });
          return new Response(JSON.stringify({ ok: true, mismatch: true }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        await admin
          .from("plan_payments")
          .update({
            status: "paid",
            razorpay_payment_id: paymentId,
            reviewed_at: new Date().toISOString(),
          })
          .eq("id", payment.id);

        // Activate subscription
        const newPlan = payment.plan;
        const billingType = payment.billing_type === "yearly" ? "yearly" : "monthly";
        const durationDays = billingType === "yearly" ? 365 : 30;
        const endDate = new Date(Date.now() + durationDays * 86400000).toISOString();

        // Deactivate existing active subs for this user (account-level only)
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
    }
  } catch (e) {
    console.error("Webhook processing error", e);
    // Return 200 anyway so Razorpay doesn't keep retrying after we logged the event
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
