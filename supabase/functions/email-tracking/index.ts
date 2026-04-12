import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const TRANSPARENT_PIXEL = Uint8Array.from(atob(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
), c => c.charCodeAt(0));

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const type = url.searchParams.get("t") || "open"; // 'open' or 'click'
  const storeId = url.searchParams.get("s");
  const userId = url.searchParams.get("u");
  const email = url.searchParams.get("e");
  const reminderId = url.searchParams.get("r");
  const linkUrl = url.searchParams.get("l");

  if (!storeId || !userId || !email) {
    if (type === "open") {
      return new Response(TRANSPARENT_PIXEL, {
        headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, no-cache" },
      });
    }
    return new Response("Missing params", { status: 400 });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    await supabase.from("email_campaign_tracking").insert({
      store_id: storeId,
      user_id: userId,
      reminder_id: reminderId || null,
      recipient_email: decodeURIComponent(email),
      tracking_type: type,
      link_url: linkUrl ? decodeURIComponent(linkUrl) : null,
      ip_address: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || null,
      user_agent: req.headers.get("user-agent") || null,
    });
  } catch (e) {
    console.error("Tracking error:", e);
  }

  // For open tracking, return transparent pixel
  if (type === "open") {
    return new Response(TRANSPARENT_PIXEL, {
      headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, no-cache" },
    });
  }

  // For click tracking, redirect to the target URL
  if (type === "click" && linkUrl) {
    return new Response(null, {
      status: 302,
      headers: { Location: decodeURIComponent(linkUrl) },
    });
  }

  return new Response("OK", { status: 200 });
});
