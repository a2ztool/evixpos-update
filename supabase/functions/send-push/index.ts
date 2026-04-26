// Edge Function: send-push
// Fanout web push notifications to all subscribed devices for a given user_id.
// Triggered by DB trigger on `notifications` INSERT.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import webpush from "https://esm.sh/web-push@3.6.7?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VAPID_PUBLIC = "BONe3ra8bucP44-DXlrEFqnMsoNZeptZ-PDshM4CoTn2XsUdbwLfLJri-MhVY7iafsBy8QJS4Ae5DLXtvNbmfBI";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";

if (VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Type → friendly title for the OS notification
const TYPE_TITLE: Record<string, string> = {
  order: "🛒 New Order",
  order_completed: "✅ Order Completed",
  order_pending: "⏳ Pending Order",
  refund: "💰 Refund",
  payment: "💳 Payment Received",
  payment_failed: "❌ Payment Failed",
  subscription: "📋 Subscription Update",
  subscription_expired: "⚠️ Subscription Expired",
  customer: "👤 Customer Update",
  customer_due: "📌 Customer Due",
  pos_sale: "🏪 POS Sale",
  pos_register: "💵 Cash Register",
  system: "⚙️ System",
  plan_upgrade: "🚀 Plan Upgraded",
  integration: "🔗 Integration",
  referral: "🤝 Referral",
  referral_commission: "💎 Commission Earned",
  referral_withdraw: "📤 Withdrawal",
  support: "🎫 Support Ticket",
  support_reply: "💬 Support Reply",
  alert: "🔔 Alert",
  low_stock: "📦 Low Stock",
  message: "💬 New Message",
  success: "🟢 Success",
  error: "🔴 Error",
  warning: "🟡 Warning",
  info: "🔵 Notification",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!VAPID_PRIVATE) {
      return new Response(JSON.stringify({ error: "VAPID_PRIVATE_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { user_id, type = "info", message = "", notification_id } = body;

    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Fetch all device subscriptions for this user
    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", user_id);

    if (error) throw error;
    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ delivered: 0, reason: "no subscriptions" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const title = TYPE_TITLE[type] || "🔔 Notification";
    const payload = JSON.stringify({
      title,
      body: message || "You have a new update",
      type,
      notification_id,
      url: "/dashboard",
      timestamp: Date.now(),
    });

    let delivered = 0;
    let failed = 0;
    const expiredIds: string[] = [];

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload,
            { TTL: 60 * 60 * 24 } // 24h
          );
          delivered++;
        } catch (err: any) {
          failed++;
          // 404/410 = subscription expired, prune it
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            expiredIds.push(sub.id);
          }
        }
      })
    );

    if (expiredIds.length > 0) {
      await supabase.from("push_subscriptions").delete().in("id", expiredIds);
    }

    return new Response(
      JSON.stringify({ delivered, failed, pruned: expiredIds.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-push error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
