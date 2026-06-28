import { createClient } from "npm:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

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

function genCode() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return n.toString().padStart(6, "0");
}

function otpEmail(code: string, brand: string) {
  return {
    subject: `Your ${brand} verification code: ${code}`,
    text: `Your ${brand} verification code is ${code}. It expires in 10 minutes. If you didn't request this, you can ignore this email.`,
    html: `<!doctype html><html><body style="margin:0;padding:0;background:#f6f8fb;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a">
      <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
        <table width="100%" style="max-width:480px;background:#ffffff;border:1px solid #e6eaf0;border-radius:16px;overflow:hidden">
          <tr><td style="padding:28px 28px 8px"><div style="font-size:13px;font-weight:600;color:#0d9488;letter-spacing:.06em;text-transform:uppercase">${brand}</div>
            <h1 style="margin:8px 0 0;font-size:22px;line-height:1.3">Verify your email</h1>
            <p style="margin:8px 0 0;color:#475569;font-size:14px">Use the 6-digit code below to verify your email address. The code expires in 10 minutes.</p></td></tr>
          <tr><td align="center" style="padding:18px 28px 8px"><div style="display:inline-block;font-size:32px;letter-spacing:14px;font-weight:700;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:12px;padding:14px 22px;color:#0f172a">${code}</div></td></tr>
          <tr><td style="padding:8px 28px 28px;color:#64748b;font-size:12px">If you didn't request this code, you can safely ignore this email.</td></tr>
        </table>
        <div style="color:#94a3b8;font-size:11px;margin-top:12px">&copy; ${new Date().getFullYear()} ${brand}</div>
      </td></tr></table></body></html>`,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { email, purpose = "signup", payload } = await req.json();
    const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return json({ error: "Invalid email address." }, 400);
    }
    if (!["signup", "reset"].includes(purpose)) {
      return json({ error: "Invalid purpose." }, 400);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // For signup, refuse if email already in use.
    if (purpose === "signup") {
      const { data: existing } = await admin
        .from("profiles")
        .select("id")
        .eq("email", cleanEmail)
        .maybeSingle();
      if (existing) {
        return json({ error: "Email already registered. Please sign in." }, 409);
      }
    }

    // Throttle: max 1 send per 45s, 5 per hour
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recent } = await admin
      .from("email_otps")
      .select("created_at")
      .eq("email", cleanEmail)
      .eq("purpose", purpose)
      .gte("created_at", since)
      .order("created_at", { ascending: false });
    if (recent && recent.length >= 5) {
      return json({ error: "Too many requests. Try again in an hour." }, 429);
    }
    if (recent && recent[0] && Date.now() - new Date(recent[0].created_at).getTime() < 45_000) {
      return json({ error: "Please wait a moment before requesting a new code." }, 429);
    }

    // Invalidate previous unconsumed codes for this email+purpose
    await admin
      .from("email_otps")
      .update({ consumed_at: new Date().toISOString() })
      .eq("email", cleanEmail)
      .eq("purpose", purpose)
      .is("consumed_at", null);

    const code = genCode();
    const code_hash = await sha256Hex(`${cleanEmail}:${code}`);
    const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: insErr } = await admin.from("email_otps").insert({
      email: cleanEmail,
      code_hash,
      purpose,
      expires_at,
      payload: payload ?? null,
    });
    if (insErr) {
      console.error("OTP insert error", insErr);
      return json({ error: "Failed to issue code." }, 500);
    }

    // Load SMTP config (first available row)
    const { data: cfg, error: cfgErr } = await admin
      .from("email_config")
      .select("smtp_host, smtp_port, smtp_secure, smtp_username, smtp_password, sender_email, sender_name")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (cfgErr || !cfg || !cfg.smtp_host) {
      console.error("No SMTP config", cfgErr);
      return json({ error: "Email service not configured. Contact support." }, 500);
    }

    const brand = cfg.sender_name || "EvixPos";
    const mail = otpEmail(code, brand);

    const port = cfg.smtp_port || 465;
    const useTLS = port === 465 || !!cfg.smtp_secure;
    const client = new SMTPClient({
      connection: {
        hostname: cfg.smtp_host,
        port,
        tls: useTLS,
        auth: {
          username: cfg.smtp_username || cfg.sender_email,
          password: cfg.smtp_password,
        },
      },
    });

    try {
      await client.send({
        from: `${cfg.sender_name || "EvixPos"} <${cfg.sender_email}>`,
        to: cleanEmail,
        subject: mail.subject,
        content: mail.text,
        html: mail.html,
      });
    } catch (sendErr) {
      console.error("SMTP send failed", sendErr);
      try { await client.close(); } catch {}
      return json({ error: "Failed to send code email. Please try again." }, 500);
    }
    try { await client.close(); } catch {}

    return json({ success: true, expires_at });
  } catch (e) {
    console.error("send-email-otp error", e);
    return json({ error: (e as Error).message || "Unexpected error." }, 500);
  }
});