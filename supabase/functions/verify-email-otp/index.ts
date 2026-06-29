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
    const body = await req.json();
    const email: string = (body?.email || "").trim().toLowerCase();
    const code: string = (body?.code || "").trim();
    const purpose: string = body?.purpose === "reset" ? "reset" : "signup";
    const password: string | undefined = body?.password;
    const name: string | undefined = body?.name;
    const referralCode: string | undefined = body?.referralCode;

    if (!email || !/^\d{6}$/.test(code)) {
      return json({ error: "Invalid email or code." }, 400);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const { data: row, error: rowErr } = await admin
      .from("email_otps")
      .select("id, code_hash, expires_at, attempts, consumed_at")
      .eq("email", email)
      .eq("purpose", purpose)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (rowErr || !row) {
      return json({ error: "No active code. Please request a new one." }, 400);
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await admin.from("email_otps").update({ consumed_at: new Date().toISOString() }).eq("id", row.id);
      return json({ error: "Code expired. Please request a new one." }, 400);
    }
    if (row.attempts >= 5) {
      await admin.from("email_otps").update({ consumed_at: new Date().toISOString() }).eq("id", row.id);
      return json({ error: "Too many attempts. Please request a new code." }, 400);
    }

    const expected = await sha256Hex(`${email}:${code}`);
    if (expected !== row.code_hash) {
      await admin.from("email_otps").update({ attempts: row.attempts + 1 }).eq("id", row.id);
      return json({ error: "Invalid code. Please try again." }, 400);
    }

    // Mark consumed
    await admin.from("email_otps").update({ consumed_at: new Date().toISOString() }).eq("id", row.id);

    if (purpose === "signup") {
      if (!password || password.length < 6) {
        return json({ error: "Password missing or too short." }, 400);
      }
      // Create the account, already email-confirmed.
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name: name || "", referral_code: referralCode || null },
      });
      if (createErr || !created.user) {
        // If the user somehow already exists (race), surface a friendly message.
        const msg = createErr?.message || "";
        if (/already/i.test(msg) || /registered/i.test(msg)) {
          return json({ error: "Email already registered. Please sign in." }, 409);
        }
        console.error("createUser failed", createErr);
        return json({ error: msg || "Could not create account." }, 500);
      }

      const newUserId = created.user.id;

      // Ensure profile name is set (trigger creates the row with empty name otherwise)
      if (name) {
        await admin.from("profiles").update({ name }).eq("id", newUserId);
      }

      // Handle referral
      if (referralCode) {
        const code = referralCode.trim().toUpperCase();
        const { data: refSettings } = await admin
          .from("referral_settings")
          .select("user_id, id, total_clicks")
          .eq("referral_code", code)
          .maybeSingle();
        if (refSettings) {
          await admin.from("referrals").insert({
            referrer_id: refSettings.user_id,
            referred_email: email,
            referred_user_id: newUserId,
            status: "pending",
            plan: "free",
            commission_amount: 0,
            is_paid: false,
          });
          await admin
            .from("referral_settings")
            .update({ total_clicks: ((refSettings as any).total_clicks ?? 0) + 1 })
            .eq("id", refSettings.id);
        }
      }

      return json({ success: true, mode: "signup" });
    }

    // reset purpose — confirm the user exists, then issue a short-lived reset token
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (!profile) {
      return json({ error: "No account found for this email." }, 404);
    }
    // Generate a random token, store its hash, return raw token to client
    const tokenBytes = new Uint8Array(32);
    crypto.getRandomValues(tokenBytes);
    const token = Array.from(tokenBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    const token_hash = await sha256Hex(`${email}:${token}`);
    await admin.from("email_otps").insert({
      email,
      code_hash: token_hash,
      purpose: "reset_token",
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    return json({ success: true, mode: "reset", resetToken: token });
  } catch (e) {
    console.error("verify-email-otp error", e);
    return json({ error: (e as Error).message || "Unexpected error." }, 500);
  }
});