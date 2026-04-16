import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const now = new Date().toISOString();

    // Find all active platform subscriptions (customer_id IS NULL) that have expired
    const { data: expiredSubs, error: fetchError } = await supabase
      .from("subscriptions")
      .select("id, user_id, plan, end_date")
      .eq("status", "active")
      .is("customer_id", null)
      .not("end_date", "is", null)
      .lte("end_date", now);

    if (fetchError) throw fetchError;

    if (!expiredSubs || expiredSubs.length === 0) {
      return new Response(JSON.stringify({ message: "No expired plans found", processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    const results: { user_id: string; old_plan: string; }[] = [];

    for (const sub of expiredSubs) {
      // Mark subscription as expired
      const { error: updateError } = await supabase
        .from("subscriptions")
        .update({ status: "expired" })
        .eq("id", sub.id);

      if (updateError) {
        console.error(`Failed to expire sub ${sub.id}:`, updateError);
        continue;
      }

      // Send notification to user
      await supabase.from("notifications").insert({
        user_id: sub.user_id,
        type: "warning",
        message: `⏰ Your ${sub.plan.charAt(0).toUpperCase() + sub.plan.slice(1)} plan has expired. You've been downgraded to the Free plan. Upgrade to restore your features.`,
      });

      results.push({ user_id: sub.user_id, old_plan: sub.plan });
      processed++;
    }

    return new Response(JSON.stringify({ 
      message: `Processed ${processed} expired subscriptions`, 
      processed,
      details: results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Plan expiry check error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
