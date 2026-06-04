import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");

    const { store_id } = await req.json().catch(() => ({}));

    const q = supabase
      .from("integrations")
      .select("api_key, phone_number")
      .eq("user_id", user.id)
      .eq("type", "whatsapp");
    if (store_id) q.eq("store_id", store_id);
    const { data: integration } = await q.maybeSingle();

    if (!integration?.api_key || !integration?.phone_number) {
      return new Response(
        JSON.stringify({ valid: false, error: "WhatsApp integration not configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Ping phone number endpoint — confirms token works for sending
    const phoneRes = await fetch(
      `https://graph.facebook.com/v19.0/${integration.phone_number}?fields=display_phone_number,verified_name,quality_rating`,
      { headers: { Authorization: `Bearer ${integration.api_key}` } }
    );
    const phoneData = await phoneRes.json();

    if (!phoneRes.ok) {
      const code = phoneData?.error?.code;
      const msg = phoneData?.error?.message || "Token validation failed";
      const friendly = code === 190
        ? "Access token invalid or expired. Please regenerate from Meta Business Suite."
        : msg;
      return new Response(
        JSON.stringify({ valid: false, error: friendly, code }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Try debug_token for expiry info (needs app token)
    let expires_at: number | null = null;
    let expires_in_days: number | null = null;
    let token_type: string | null = null;
    let scopes: string[] | null = null;

    const appId = Deno.env.get("META_APP_ID");
    const appSecret = Deno.env.get("META_APP_SECRET");
    if (appId && appSecret) {
      try {
        const debugRes = await fetch(
          `https://graph.facebook.com/v19.0/debug_token?input_token=${encodeURIComponent(integration.api_key)}&access_token=${appId}|${appSecret}`
        );
        const debugData = await debugRes.json();
        const d = debugData?.data;
        if (d) {
          token_type = d.type || null;
          scopes = d.scopes || null;
          if (d.expires_at && d.expires_at > 0) {
            expires_at = d.expires_at;
            const secondsLeft = d.expires_at - Math.floor(Date.now() / 1000);
            expires_in_days = Math.max(0, Math.floor(secondsLeft / 86400));
          } else if (d.expires_at === 0) {
            // 0 means never expires (permanent system user token)
            expires_in_days = null;
          }
        }
      } catch (_) {
        // debug_token failed but token still works — continue
      }
    }

    return new Response(
      JSON.stringify({
        valid: true,
        phone_display: phoneData.display_phone_number,
        verified_name: phoneData.verified_name,
        quality_rating: phoneData.quality_rating,
        expires_at,
        expires_in_days,
        is_permanent: expires_at === null && token_type !== null,
        token_type,
        scopes,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ valid: false, error: err.message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});