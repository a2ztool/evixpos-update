// Daily cron: send WhatsApp renewal reminders at 7/3/1 days before expiry.
// Triggered by pg_cron via http_post; can also be invoked manually (no JWT).
// Dedupe is in-memory per run + via existing notifications table (idempotent per day).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REMINDER_DAYS = [7, 3, 1];

function buildMessage(name: string, product: string, variation: string, daysLeft: number, endDateStr: string) {
  const greeting = name ? `Hi ${name},` : "Hi,";
  const dateLine = `(${endDateStr})`;
  if (daysLeft === 1) {
    return `${greeting}\n\n⏰ Reminder: Your subscription for "${product}" (${variation}) expires *tomorrow* ${dateLine}.\nPlease renew to avoid service interruption.\n\nThank you!`;
  }
  return `${greeting}\n\n🔔 Reminder: Your subscription for "${product}" (${variation}) will expire in *${daysLeft} days* ${dateLine}.\nPlease renew to continue your service.\n\nThank you!`;
}

function cleanPhone(phone: string) {
  return phone.replace(/[\s\-()]/g, "").replace(/^(?!\+)/, "+").replace("+", "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayStr = today.toISOString().slice(0, 10);

    const targets = REMINDER_DAYS.map((d) => {
      const dt = new Date(today);
      dt.setUTCDate(dt.getUTCDate() + d);
      return { days: d, dateStr: dt.toISOString().slice(0, 10) };
    });

    let processed = 0, sent = 0, skipped = 0, failed = 0;
    const errors: string[] = [];
    const integrationCache = new Map<string, any>();

    // Pull today's reminder notifications once for dedupe (per-day idempotency)
    const startOfDay = `${todayStr}T00:00:00Z`;
    const { data: todays } = await supabase
      .from("notifications")
      .select("message")
      .gte("created_at", startOfDay)
      .ilike("message", "%WhatsApp renewal reminder sent%");
    const sentKeys = new Set<string>((todays || []).map((n: any) => n.message));

    for (const t of targets) {
      const { data: subs, error: subErr } = await supabase
        .from("subscriptions")
        .select("id, user_id, store_id, customer_id, product_name, variation, end_date, status, customers(name, phone)")
        .eq("status", "active")
        .gte("end_date", `${t.dateStr}T00:00:00`)
        .lte("end_date", `${t.dateStr}T23:59:59`);

      if (subErr) { errors.push(`Fetch ${t.days}d: ${subErr.message}`); continue; }
      if (!subs || subs.length === 0) continue;

      for (const s of subs as any[]) {
        processed++;
        const phone = s.customers?.phone;
        const name = s.customers?.name || "";
        if (!phone) { skipped++; continue; }

        // Dedupe key matching the notification we'll insert
        const dedupeKey = `📲 WhatsApp renewal reminder sent to ${name || phone} for "${s.product_name}" (${t.days}d left).`;
        if (sentKeys.has(dedupeKey)) { skipped++; continue; }

        const cacheKey = `${s.user_id}::${s.store_id || ""}`;
        let integration = integrationCache.get(cacheKey);
        if (integration === undefined) {
          let q = supabase
            .from("integrations")
            .select("api_key, phone_number")
            .eq("user_id", s.user_id)
            .eq("type", "whatsapp")
            .eq("status", "active");
          if (s.store_id) q = q.eq("store_id", s.store_id);
          const { data } = await q.maybeSingle();
          integration = data || null;
          integrationCache.set(cacheKey, integration);
        }

        if (!integration?.api_key || !integration?.phone_number) { skipped++; continue; }

        const message = buildMessage(name, s.product_name, s.variation, t.days, s.end_date.slice(0, 10));

        try {
          const waResp = await fetch(
            `https://graph.facebook.com/v19.0/${integration.phone_number}/messages`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${integration.api_key}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                messaging_product: "whatsapp",
                to: cleanPhone(phone),
                type: "text",
                text: { body: message },
              }),
            }
          );
          const waData = await waResp.json();
          if (!waResp.ok) {
            failed++;
            errors.push(`Sub ${s.id}: ${waData?.error?.message || "WA error"}`);
            continue;
          }

          await supabase.from("notifications").insert({
            user_id: s.user_id,
            type: "info",
            message: dedupeKey,
          });
          sentKeys.add(dedupeKey);
          sent++;
        } catch (e: any) {
          failed++;
          errors.push(`Sub ${s.id}: ${e.message}`);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true, processed, sent, skipped, failed,
        errors: errors.slice(0, 20),
        ran_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("subscription-renewal-reminders error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
