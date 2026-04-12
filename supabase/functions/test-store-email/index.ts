import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

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

    const { store_id, test_email, subject: customSubject, body: customBody } = await req.json();

    if (!store_id || !test_email) {
      return new Response(JSON.stringify({ error: "store_id and test_email required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: config } = await supabase
      .from("email_store_config")
      .select("*")
      .eq("store_id", store_id)
      .single();

    if (!config) {
      return new Response(JSON.stringify({ success: false, error: "No email config found" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse CTA tags in body
    const parseCta = (text: string) =>
      text
        .replace(/\[CTA:\{[^}]*"text"\s*:\s*"([^"]*)"[^}]*"url"\s*:\s*"([^"]*)"[^}]*"color"\s*:\s*"([^"]*)"[^}]*\}\]/g,
          '<a href="$2" style="display:inline-block;padding:12px 28px;background:$3;color:#ffffff;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;margin:12px 0;">$1</a>')
        .replace(/\[CTA:(.*?)\|(.*?)\|(.*?)\]/g,
          '<a href="$2" style="display:inline-block;padding:12px 28px;background:$3;color:#ffffff;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;margin:12px 0;">$1</a>');

    const emailSubject = customSubject || "Test Email - Connection Verified ✅";
    const emailHtml = customBody
      ? parseCta(customBody).replace(/\n/g, "<br>")
      : "<h2>Email Connection Test</h2><p>Your email configuration is working correctly!</p>";

    let success = false;
    let errorMsg = "";

    try {
      if (config.provider_type === "sendgrid" && config.api_key) {
        const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.api_key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: test_email }] }],
            from: { email: config.sender_email, name: config.sender_name || "Test" },
            subject: emailSubject,
            content: [{ type: "text/html", value: emailHtml }],
          }),
        });
        success = res.ok;
        if (!res.ok) errorMsg = `SendGrid error: ${res.status}`;
      } else if (config.provider_type === "resend" && config.api_key) {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.api_key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: `${config.sender_name || "Test"} <${config.sender_email}>`,
            to: [test_email],
            subject: emailSubject,
            html: emailHtml,
          }),
        });
        success = res.ok;
        if (!res.ok) errorMsg = `Resend error: ${res.status} ${await res.text()}`;
      } else if (config.provider_type === "smtp" && config.smtp_host) {
        const smtpPort = config.smtp_port || 465;
        const useTLS = smtpPort === 465;
        
        const client = new SMTPClient({
          connection: {
            hostname: config.smtp_host,
            port: smtpPort,
            tls: useTLS,
            auth: {
              username: config.smtp_user || config.sender_email,
              password: config.smtp_pass,
            },
          },
        });

        try {
          await client.send({
            from: `${config.sender_name || "Test"} <${config.sender_email}>`,
            to: test_email,
            subject: emailSubject,
            content: "auto",
            html: emailHtml,
          });
          success = true;
        } catch (smtpErr: any) {
          errorMsg = `SMTP error: ${smtpErr.message}`;
        } finally {
          await client.close();
        }
      } else {
        errorMsg = "No valid email provider configured";
      }
    } catch (e: any) {
      errorMsg = e.message;
    }

    // Update config status
    await supabase
      .from("email_store_config")
      .update({
        connection_status: success ? "connected" : "failed",
        last_tested_at: new Date().toISOString(),
      })
      .eq("store_id", store_id);

    return new Response(JSON.stringify({ success, error: errorMsg || undefined }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
