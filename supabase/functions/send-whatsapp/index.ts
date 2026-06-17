import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

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
    if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 200);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 200);

    const { phone, message, store_id } = await req.json();

    if (!phone || !message) {
      return jsonResponse({ error: "Phone and message are required" }, 200);
    }

    // Get WhatsApp integration config. Prefer store-scoped lookup (works for
    // both owners and staff, since integrations belong to a store, not a user).
    let integration: { api_key: string | null; phone_number: string | null; status: string } | null = null;
    if (store_id) {
      const { data, error } = await supabase
        .from("integrations")
        .select("api_key, phone_number, status")
        .eq("store_id", store_id)
        .eq("type", "whatsapp")
        .eq("status", "active")
        .maybeSingle();
      if (error) console.error("integration lookup error (store):", error.message);
      integration = data ?? null;
    }
    if (!integration) {
      const { data, error } = await supabase
        .from("integrations")
        .select("api_key, phone_number, status")
        .eq("user_id", user.id)
        .eq("type", "whatsapp")
        .eq("status", "active")
        .maybeSingle();
      if (error) console.error("integration lookup error (user):", error.message);
      integration = data ?? null;
    }

    if (!integration) {
      return jsonResponse(
        { error: "WhatsApp integration not found or inactive for this store. Reconnect in Integrations → WhatsApp." },
        200,
      );
    }

    if (!integration.api_key || !integration.phone_number) {
      return jsonResponse({ error: "WhatsApp API credentials not configured (missing token or Phone Number ID)." }, 200);
    }

    // Normalize phone to E.164 digits-only for Meta ("to" expects no '+')
    const e164Digits = String(phone).replace(/[^\d]/g, "");
    if (e164Digits.length < 8 || e164Digits.length > 15) {
      return jsonResponse({ error: `Invalid phone number format: ${phone}. Use E.164 like +919593531427.` }, 200);
    }

    const endpoint = `https://graph.facebook.com/v19.0/${integration.phone_number}/messages`;
    const payload = {
      messaging_product: "whatsapp",
      to: e164Digits,
      type: "text",
      text: { body: message },
    };
    console.log("WhatsApp send →", endpoint, "to:", e164Digits);

    const waResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${integration.api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const rawText = await waResponse.text();
    let waData: any = {};
    try { waData = rawText ? JSON.parse(rawText) : {}; } catch { waData = { raw: rawText }; }

    if (!waResponse.ok) {
      const metaErr = waData?.error || {};
      const code = metaErr.code;
      const subcode = metaErr.error_subcode;
      const details = metaErr.error_data?.details;
      let errMsg = metaErr.message || `WhatsApp API error (HTTP ${waResponse.status})`;
      if (code === 190) {
        errMsg = "Access token invalid or expired. Update your token in Integrations → WhatsApp.";
      } else if (code === 131030) {
        errMsg = `Recipient phone not in allowed list (dev mode). Add ${e164Digits} as a recipient in Meta → WhatsApp → API Setup.`;
      } else if (code === 131026) {
        errMsg = `Message undeliverable — recipient ${e164Digits} not on WhatsApp or hasn't opened a 24h session. Use an approved template.`;
      } else if (code === 131056 || code === 131047) {
        errMsg = "24-hour customer service window expired. Send an approved template instead of free-form text.";
      } else if (code === 100) {
        errMsg = `${errMsg} — check Phone Number ID and recipient format (${e164Digits}).`;
      }
      if (details) errMsg += ` Details: ${details}`;
      console.error("WhatsApp API error:", waResponse.status, JSON.stringify(waData));
      return jsonResponse({ error: errMsg, code, subcode, http_status: waResponse.status, meta: waData?.error }, 200);
    }

    return jsonResponse({
      success: true,
      message_id: waData?.messages?.[0]?.id || null,
      contact: waData?.contacts?.[0] || null,
    });
  } catch (err: any) {
    console.error("send-whatsapp unexpected error:", err?.message, err?.stack);
    return jsonResponse({ error: err?.message || "Unexpected server error" }, 200);
  }
});
