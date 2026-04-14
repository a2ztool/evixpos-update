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

    // Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");

    const { phone, message, store_id } = await req.json();

    if (!phone || !message) {
      throw new Error("Phone and message are required");
    }

    // Get WhatsApp integration config for this user
    const query = supabase
      .from("integrations")
      .select("api_key, phone_number, status")
      .eq("user_id", user.id)
      .eq("type", "whatsapp")
      .eq("status", "active");

    if (store_id) {
      query.eq("store_id", store_id);
    }

    const { data: integration, error: intError } = await query.maybeSingle();

    if (intError || !integration) {
      throw new Error("WhatsApp integration not found or inactive");
    }

    if (!integration.api_key || !integration.phone_number) {
      throw new Error("WhatsApp API credentials not configured");
    }

    // Clean phone number — remove spaces, ensure + prefix
    const cleanPhone = phone.replace(/[\s\-()]/g, "").replace(/^(?!\+)/, "+");

    // Call WhatsApp Business Cloud API
    const waResponse = await fetch(
      `https://graph.facebook.com/v19.0/${integration.phone_number}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${integration.api_key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: cleanPhone.replace("+", ""),
          type: "text",
          text: { body: message },
        }),
      }
    );

    const waData = await waResponse.json();

    if (!waResponse.ok) {
      const errMsg = waData?.error?.message || "WhatsApp API error";
      console.error("WhatsApp API error:", JSON.stringify(waData));
      throw new Error(errMsg);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message_id: waData?.messages?.[0]?.id || null,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("send-whatsapp error:", err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
