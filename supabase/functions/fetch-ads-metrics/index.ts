import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get all ads accounts with access tokens
    const { data: accounts, error: accountsErr } = await supabase
      .from("ads_accounts")
      .select("*")
      .not("access_token", "is", null)
      .not("ad_account_id", "is", null);

    if (accountsErr) {
      throw new Error("Failed to fetch accounts: " + accountsErr.message);
    }

    if (!accounts || accounts.length === 0) {
      return new Response(
        JSON.stringify({ message: "No ads accounts found", fetched: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let fetchedCount = 0;
    const errors: string[] = [];

    for (const account of accounts) {
      try {
        const adAccountId = account.ad_account_id.startsWith("act_")
          ? account.ad_account_id
          : `act_${account.ad_account_id}`;

        const insightsUrl = `https://graph.facebook.com/v19.0/${adAccountId}/insights?fields=impressions,clicks,spend&access_token=${account.access_token}`;

        const res = await fetch(insightsUrl);
        const data = await res.json();

        if (data.error) {
          errors.push(`Account ${account.ad_account_id}: ${data.error.message}`);
          continue;
        }

        if (data.data && data.data.length > 0) {
          for (const row of data.data) {
            const { error: upsertErr } = await supabase
              .from("ads_metrics")
              .upsert(
                {
                  ad_account_id: account.ad_account_id,
                  user_id: account.user_id,
                  store_id: account.store_id,
                  impressions: parseInt(row.impressions || "0"),
                  clicks: parseInt(row.clicks || "0"),
                  spend: parseFloat(row.spend || "0"),
                  date_start: row.date_start,
                  date_stop: row.date_stop,
                  fetched_at: new Date().toISOString(),
                },
                { onConflict: "ad_account_id,date_start,date_stop" }
              );

            if (upsertErr) {
              errors.push(`Upsert error for ${account.ad_account_id}: ${upsertErr.message}`);
            } else {
              fetchedCount++;
            }
          }
        }
      } catch (err) {
        errors.push(`Account ${account.ad_account_id}: ${(err as Error)?.message ?? String(err)}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        fetched: fetchedCount,
        accounts_processed: accounts.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error)?.message ?? String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
