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

function buildEmail(code: string, brand: string, isReset: boolean) {
  const teal = "#016a5e";
  const tealDark = "#014b43";
  const title = isReset ? "Reset your password" : "Verify your email";
  const intro = isReset
    ? "Use the 6-digit code below to reset your password. The code expires in 10 minutes."
    : "Use the 6-digit code below to verify your email and finish setting up your account. The code expires in 10 minutes.";
  const subjectLine = isReset
    ? `Your ${brand} password reset code: ${code}`
    : `Your ${brand} verification code: ${code}`;
  return {
    subject: subjectLine,
    text: `Your ${brand} ${isReset ? "password reset" : "verification"} code is ${code}. It expires in 10 minutes. If you didn't request this, you can ignore this email.`,
    html: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${title} — your ${brand} 6-digit code is ${code}.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 12px 40px rgba(1,74,67,0.08);border:1px solid #e2e8f0">
        <tr><td style="background:linear-gradient(135deg,${teal} 0%,${tealDark} 100%);padding:28px 32px;text-align:left">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:middle">
              <div style="display:inline-block;width:40px;height:40px;border-radius:10px;background:rgba(255,255,255,0.18);text-align:center;line-height:40px;color:#ffffff;font-weight:800;font-size:18px;letter-spacing:-0.5px">E</div>
            </td>
            <td style="vertical-align:middle;padding-left:12px">
              <div style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.2px">${brand}</div>
              <div style="color:rgba(255,255,255,0.75);font-size:12px;margin-top:2px">Smart POS for modern stores</div>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:36px 32px 8px">
          <h1 style="margin:0;font-size:22px;line-height:1.3;color:#0f172a;font-weight:700;letter-spacing:-0.3px">${title}</h1>
          <p style="margin:10px 0 0;color:#475569;font-size:14px;line-height:1.6">${intro}</p>
        </td></tr>
        <tr><td align="center" style="padding:24px 32px 8px">
          <div style="display:inline-block;font-size:34px;letter-spacing:14px;font-weight:800;background:#f0fdfa;border:1px solid #99f6e4;border-radius:14px;padding:18px 26px;color:${tealDark};font-family:'SFMono-Regular',Menlo,Consolas,monospace">${code}</div>
          <div style="margin-top:10px;color:#94a3b8;font-size:12px">Expires in 10 minutes</div>
        </td></tr>
        <tr><td style="padding:18px 32px 28px">
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;color:#475569;font-size:12px;line-height:1.6">
            🔒 For your security, never share this code with anyone. ${brand} staff will never ask for it.
          </div>
        </td></tr>
        <tr><td style="padding:0 32px 28px;color:#94a3b8;font-size:12px;line-height:1.6">
          Didn't request this? You can safely ignore this email — no changes will be made to your account.
        </td></tr>
        <tr><td style="background:#f8fafc;padding:18px 32px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px">
          &copy; ${new Date().getFullYear()} ${brand}. All rights reserved.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
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