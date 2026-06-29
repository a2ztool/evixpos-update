import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function sha256Hex(input: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { email, token, password } = await req.json();
    const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!cleanEmail || !token || typeof token !== "string") {
      return json({ error: "Invalid request." }, 400);
    }
    if (!password || typeof password !== "string" || password.length < 6) {
      return json({ error: "Password must be at least 6 characters." }, 400);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const expectedHash = await sha256Hex(`${cleanEmail}:${token}`);
    const { data: row } = await admin
      .from("email_otps")
      .select("id, expires_at, consumed_at")
      .eq("email", cleanEmail)
      .eq("purpose", "reset_token")
      .eq("code_hash", expectedHash)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!row) return json({ error: "Invalid or expired reset token." }, 400);
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await admin.from("email_otps").update({ consumed_at: new Date().toISOString() }).eq("id", row.id);
      return json({ error: "Reset token expired. Please start again." }, 400);
    }

    // Find the user
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("email", cleanEmail)
      .maybeSingle();
    if (!profile) return json({ error: "No account found for this email." }, 404);

    const { error: updErr } = await admin.auth.admin.updateUserById(profile.id, { password });
    if (updErr) {
      console.error("updateUserById failed", updErr);
      return json({ error: updErr.message || "Failed to update password." }, 500);
    }

    await admin.from("email_otps").update({ consumed_at: new Date().toISOString() }).eq("id", row.id);

    return json({ success: true });
  } catch (e) {
    console.error("set-new-password error", e);
    return json({ error: (e as Error).message || "Unexpected error." }, 500);
  }
});