import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RenewalTarget {
  subscription_id: string;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  product_name: string;
  expiry_date: string;
  days_left: number;
  reminder_type: string;
}

async function processStore(
  supabase: any,
  store_id: string,
  user_id: string,
  mode: string,
  customer_ids?: string[],
  template_override?: any,
  template_id?: string
) {
  // Get email config for this store
  const { data: emailConfig } = await supabase
    .from("email_store_config")
    .select("*")
    .eq("store_id", store_id)
    .single();

  if (!emailConfig || !emailConfig.sender_email) {
    return { sent: 0, failed: 0, total: 0, message: "Email not configured for this store" };
  }

  // Get email branding for this user
  const { data: brandingData } = await supabase
    .from("email_branding")
    .select("*")
    .eq("user_id", user_id)
    .maybeSingle();

  // Get automation config
  const { data: autoConfig } = await supabase
    .from("renewal_automation_config")
    .select("*")
    .eq("store_id", store_id)
    .single();

  const reminderDays = autoConfig?.reminder_days || [7, 3, 1];

  // Get email templates
  const { data: templates } = await supabase
    .from("renewal_email_templates")
    .select("*")
    .eq("store_id", store_id)
    .eq("is_active", true);

  const templateMap: Record<string, { subject: string; body: string }> = {};
  if (templates) {
    for (const t of templates) {
      templateMap[t.template_type] = { subject: t.subject, body: t.body };
    }
  }

  // If a specific template_id was selected, fetch it and use as the override
  let resolvedOverride = template_override;
  if (!resolvedOverride && template_id) {
    const matched = templates?.find((t: any) => t.id === template_id);
    if (matched) {
      resolvedOverride = { subject: matched.subject, body: matched.body };
    } else {
      // Template might be from a different query; fetch it directly
      const { data: specificTpl } = await supabase
        .from("renewal_email_templates")
        .select("subject, body")
        .eq("id", template_id)
        .single();
      if (specificTpl) {
        resolvedOverride = { subject: specificTpl.subject, body: specificTpl.body };
      }
    }
  }

  // Default templates
  const defaults: Record<string, { subject: string; body: string }> = {
    first_reminder: {
      subject: "Subscription Expiring Soon - {{product_name}}",
      body: "Hi {{customer_name}},\n\nYour subscription for \"{{product_name}}\" will expire on {{expiry_date}}.\n\nPlease renew to continue enjoying our services.\n\nThank you!",
    },
    second_reminder: {
      subject: "Reminder: {{product_name}} Expiring Tomorrow",
      body: "Hi {{customer_name}},\n\nThis is a reminder that your subscription for \"{{product_name}}\" expires tomorrow ({{expiry_date}}).\n\nRenew now to avoid service interruption.\n\nThank you!",
    },
    final_reminder: {
      subject: "Final Notice: {{product_name}} Expires Today",
      body: "Hi {{customer_name}},\n\nYour subscription for \"{{product_name}}\" expires today ({{expiry_date}}).\n\nPlease renew immediately to continue your service.\n\nThank you!",
    },
    expired: {
      subject: "{{product_name}} Has Expired",
      body: "Hi {{customer_name}},\n\nYour subscription for \"{{product_name}}\" has expired on {{expiry_date}}.\n\nRenew now to restore your service.\n\nThank you!",
    },
    campaign: {
      subject: "Renew Your {{product_name}} Subscription",
      body: "Hi {{customer_name}},\n\nWe noticed your subscription for \"{{product_name}}\" needs renewal (expired/expiring on {{expiry_date}}).\n\nRenew today for uninterrupted service.\n\nThank you!",
    },
  };

  // Get active subscriptions with customers
  const { data: subscriptions } = await supabase
    .from("subscriptions")
    .select("id, customer_id, product_name, end_date, status, customers(id, name, email, phone)")
    .eq("store_id", store_id)
    .eq("status", "active")
    .not("end_date", "is", null);

  if (!subscriptions || subscriptions.length === 0) {
    return { sent: 0, failed: 0, total: 0, message: "No active subscriptions found" };
  }

  const now = new Date();
  const targets: RenewalTarget[] = [];

  for (const sub of subscriptions) {
    const customer = sub.customers as any;
    if (!customer?.email) continue;

    if (mode === "campaign" && (customer_ids?.length ?? 0) > 0 && !customer_ids!.includes(customer.id)) {
      continue;
    }

    const endDate = new Date(sub.end_date!);
    const diffMs = endDate.getTime() - now.getTime();
    const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    let reminderType = "";
    if (mode === "campaign") {
      reminderType = "campaign";
    } else {
      if (daysLeft <= 0) {
        reminderType = "expired";
      } else if (reminderDays.includes(daysLeft)) {
        const sortedDays = [...reminderDays].sort((a, b) => b - a);
        const idx = sortedDays.indexOf(daysLeft);
        if (idx === 0) reminderType = "first_reminder";
        else if (idx === 1) reminderType = "second_reminder";
        else reminderType = "final_reminder";
      }
    }

    if (!reminderType) continue;

    // Check duplicate for auto mode
    if (mode !== "campaign") {
      const todayStr = now.toISOString().split("T")[0];
      const { data: existing } = await supabase
        .from("renewal_reminders")
        .select("id")
        .eq("subscription_id", sub.id)
        .eq("reminder_type", reminderType === "expired" ? "expired" : `T-${daysLeft}`)
        .gte("created_at", todayStr)
        .limit(1);

      if (existing && existing.length > 0) continue;
    }

    targets.push({
      subscription_id: sub.id,
      customer_id: customer.id,
      customer_name: customer.name || "Customer",
      customer_email: customer.email,
      customer_phone: customer.phone || null,
      product_name: sub.product_name,
      expiry_date: sub.end_date!,
      days_left: daysLeft,
      reminder_type: reminderType,
    });
  }

  if (targets.length === 0) {
    return { sent: 0, failed: 0, total: 0, message: "No reminders to send" };
  }

  // Send emails with rate limiting
  const results = { sent: 0, failed: 0, total: targets.length, details: [] as any[] };
  const rateLimit = emailConfig.rate_limit_per_minute || 30;
  const delayMs = Math.ceil(60000 / rateLimit);

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    const tpl = resolvedOverride || templateMap[target.reminder_type] || defaults[target.reminder_type] || defaults.campaign;

    const subject = tpl.subject
      .replace(/\{\{customer_name\}\}/g, target.customer_name)
      .replace(/\{\{product_name\}\}/g, target.product_name)
      .replace(/\{\{expiry_date\}\}/g, target.expiry_date);

    let emailBody = tpl.body
      .replace(/\{\{customer_name\}\}/g, target.customer_name)
      .replace(/\{\{product_name\}\}/g, target.product_name)
      .replace(/\{\{expiry_date\}\}/g, target.expiry_date)
      .replace(/\[CTA:\{[^}]*"text"\s*:\s*"([^"]*)"[^}]*"url"\s*:\s*"([^"]*)"[^}]*"color"\s*:\s*"([^"]*)"[^}]*\}\]/g,
        '<a href="$2" style="display:inline-block;padding:12px 28px;background:$3;color:#ffffff;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;margin:12px 0;">$1</a>')
      .replace(/\[CTA:(.*?)\|(.*?)\|(.*?)\]/g,
        '<a href="$2" style="display:inline-block;padding:12px 28px;background:$3;color:#ffffff;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;margin:12px 0;">$1</a>')
      .replace(/\n/g, "<br>");

    // Apply branding wrapper if branding is configured
    let htmlBody = emailBody;
    if (brandingData) {
      const social = brandingData.social_links || {};
      const fontFamily = (social as any)?._font_family || "Arial, sans-serif";
      const borderRadius = (social as any)?._border_radius || "8px";
      const headerStyle = (social as any)?._header_style || "centered";
      const tagline = (social as any)?._tagline || "";
      const secondaryColor = (social as any)?._secondary_color || brandingData.brand_color;
      const brandColor = brandingData.brand_color || "#4f46e5";
      const companyName = brandingData.company_name || "";
      const logoUrl = brandingData.logo_url || "";
      const footerText = brandingData.footer_text || "";
      const websiteUrl = brandingData.website_url || "";

      // Build header based on style
      const logoHtml = logoUrl ? `<img src="${logoUrl}" alt="Logo" style="height:44px;margin-bottom:8px;" />` : "";
      const nameHtml = companyName ? `<h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:800;letter-spacing:-0.3px;">${companyName}</h1>` : "";
      const taglineHtml = tagline ? `<p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:13px;">${tagline}</p>` : "";

      let headerHtml = "";
      if (headerStyle === "gradient") {
        headerHtml = `<div style="background:linear-gradient(135deg, ${brandColor}, ${secondaryColor});padding:32px;text-align:center;">${logoHtml}${nameHtml}${taglineHtml}</div>`;
      } else if (headerStyle === "minimal") {
        headerHtml = `<div style="padding:28px 32px 20px;text-align:center;border-bottom:3px solid ${brandColor};">
          ${logoUrl ? `<img src="${logoUrl}" alt="Logo" style="height:36px;margin-bottom:8px;" />` : ""}
          ${companyName ? `<h1 style="color:${brandColor};margin:0;font-size:22px;font-weight:800;">${companyName}</h1>` : ""}
          ${tagline ? `<p style="color:#6b7280;margin:4px 0 0;font-size:13px;">${tagline}</p>` : ""}
        </div>`;
      } else if (headerStyle === "left-aligned") {
        headerHtml = `<div style="background:${brandColor};padding:28px 32px;">${logoHtml}<div style="text-align:left">${nameHtml}${taglineHtml}</div></div>`;
      } else {
        headerHtml = `<div style="background:${brandColor};padding:32px;text-align:center;">${logoHtml}${nameHtml}${taglineHtml}</div>`;
      }

      // Build social links
      const socialPlatforms = [
        { key: "facebook", svg: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#9ca3af"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>` },
        { key: "instagram", svg: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#9ca3af"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>` },
        { key: "twitter", svg: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#9ca3af"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>` },
        { key: "linkedin", svg: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#9ca3af"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>` },
        { key: "youtube", svg: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#9ca3af"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>` },
      ];

      const socialLinksHtml = socialPlatforms
        .filter((p) => (social as any)[p.key])
        .map((p) => `<a href="${(social as any)[p.key]}" style="display:inline-block;margin:0 6px;text-decoration:none;" target="_blank">${p.svg}</a>`)
        .join("");

      const socialSection = socialLinksHtml ? `<div style="margin:12px 0 4px;text-align:center;">${socialLinksHtml}</div>` : "";

      htmlBody = `
        <div style="font-family:${fontFamily};max-width:600px;margin:0 auto;background:#ffffff;border-radius:${borderRadius};overflow:hidden;border:1px solid #e5e7eb;">
          ${headerHtml}
          <div style="padding:32px;">
            ${emailBody}
          </div>
          <div style="background:#f9fafb;padding:24px 32px;border-top:1px solid #e5e7eb;text-align:center;">
            ${socialSection}
            <p style="color:#6b7280;font-size:12px;margin:8px 0 4px;">${footerText}</p>
            ${websiteUrl ? `<a href="${websiteUrl}" style="color:${brandColor};font-size:12px;text-decoration:none;font-weight:500;">${websiteUrl}</a>` : ""}
          </div>
        </div>`;
    }

    // Inject tracking pixel for open tracking
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const trackingBaseUrl = `${supabaseUrl}/functions/v1/email-tracking`;
    const trackingParams = `s=${encodeURIComponent(store_id)}&u=${encodeURIComponent(user_id)}&e=${encodeURIComponent(target.customer_email)}`;
    const openPixel = `<img src="${trackingBaseUrl}?t=open&${trackingParams}" width="1" height="1" style="display:none;" alt="" />`;
    htmlBody = htmlBody + openPixel;

    // Wrap links for click tracking (exclude CTA links already tracked)
    htmlBody = htmlBody.replace(
      /href="(https?:\/\/[^"]+)"/g,
      (match: string, url: string) => {
        if (url.includes("email-tracking")) return match; // skip tracking URLs
        const clickUrl = `${trackingBaseUrl}?t=click&${trackingParams}&l=${encodeURIComponent(url)}`;
        return `href="${clickUrl}"`;
      }
    );

    const dbReminderType = target.reminder_type === "expired" ? "expired" :
      target.reminder_type === "campaign" ? "campaign" :
      target.days_left <= 0 ? "T-0" :
      target.days_left <= 1 ? "T-1" : "T-2";

    const { data: reminder } = await supabase
      .from("renewal_reminders")
      .insert({
        store_id,
        user_id,
        subscription_id: target.subscription_id,
        customer_id: target.customer_id,
        reminder_type: dbReminderType,
        channel: "email",
        status: "sending",
        recipient_email: target.customer_email,
        recipient_name: target.customer_name,
        product_name: target.product_name,
        expiry_date: target.expiry_date,
      })
      .select("id")
      .single();

    try {
      let emailSent = false;

      if (emailConfig.provider_type === "sendgrid" && emailConfig.api_key) {
        const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${emailConfig.api_key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: target.customer_email }] }],
            from: { email: emailConfig.sender_email, name: emailConfig.sender_name },
            subject,
            content: [{ type: "text/html", value: htmlBody }],
          }),
        });
        emailSent = res.ok;
        if (!res.ok) throw new Error(`SendGrid: ${res.status} ${await res.text()}`);
      } else if (emailConfig.provider_type === "resend" && emailConfig.api_key) {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${emailConfig.api_key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: `${emailConfig.sender_name} <${emailConfig.sender_email}>`,
            to: [target.customer_email],
            subject,
            html: htmlBody,
          }),
        });
        emailSent = res.ok;
        if (!res.ok) throw new Error(`Resend: ${res.status} ${await res.text()}`);
      } else if (emailConfig.provider_type === "smtp" && emailConfig.smtp_host) {
        // Real SMTP sending
        const smtpPort = emailConfig.smtp_port || 465;
        const useTLS = smtpPort === 465;
        
        const client = new SMTPClient({
          connection: {
            hostname: emailConfig.smtp_host,
            port: smtpPort,
            tls: useTLS,
            auth: {
              username: emailConfig.smtp_user || emailConfig.sender_email,
              password: emailConfig.smtp_pass,
            },
          },
        });

        try {
          await client.send({
            from: `${emailConfig.sender_name} <${emailConfig.sender_email}>`,
            to: target.customer_email,
            subject,
            content: "auto",
            html: htmlBody,
          });
          emailSent = true;
          console.log(`[SMTP] Sent to ${target.customer_email}: ${subject}`);
        } finally {
          await client.close();
        }
      } else {
        throw new Error("No valid email provider configured");
      }

      if (reminder) {
        await supabase
          .from("renewal_reminders")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", reminder.id);
      }
      results.sent++;
      results.details.push({ email: target.customer_email, phone: target.customer_phone, status: "sent", product: target.product_name });
    } catch (err: any) {
      if (reminder) {
        await supabase
          .from("renewal_reminders")
          .update({ status: "failed", error_message: err.message?.substring(0, 500) })
          .eq("id", reminder.id);
      }
      results.failed++;
      results.details.push({ email: target.customer_email, phone: target.customer_phone, status: "failed", error: err.message, product: target.product_name });
    }

    if (i < targets.length - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  // Update email config connection status
  await supabase
    .from("email_store_config")
    .update({ connection_status: results.failed === results.total ? "failed" : "connected" })
    .eq("store_id", store_id);

  return results;
}

async function processMarketingCampaign(
  supabase: any,
  store_id: string,
  user_id: string,
  customer_ids: string[],
  subject: string,
  body: string,
) {
  // Get email config
  const { data: emailConfig } = await supabase
    .from("email_store_config")
    .select("*")
    .eq("store_id", store_id)
    .single();

  if (!emailConfig || !emailConfig.sender_email) {
    return { sent: 0, failed: 0, total: 0, message: "Email not configured for this store" };
  }

  // Get branding
  const { data: brandingData } = await supabase
    .from("email_branding")
    .select("*")
    .eq("user_id", user_id)
    .maybeSingle();

  // Fetch selected customers
  const { data: customerList } = await supabase
    .from("customers")
    .select("id, name, email, phone")
    .eq("store_id", store_id)
    .in("id", customer_ids);

  const targets = (customerList || []).filter((c: any) => c.email);
  if (targets.length === 0) {
    return { sent: 0, failed: 0, total: 0, message: "No customers with email found" };
  }

  // Get store name
  const { data: storeData } = await supabase
    .from("stores")
    .select("name")
    .eq("id", store_id)
    .single();
  const storeName = storeData?.name || "Our Store";

  const rateLimit = emailConfig.rate_limit_per_minute || 30;
  const delayMs = Math.ceil(60000 / rateLimit);
  const results = { sent: 0, failed: 0, total: targets.length, details: [] as any[] };
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const trackingBaseUrl = `${supabaseUrl}/functions/v1/email-tracking`;

  for (let i = 0; i < targets.length; i++) {
    const customer = targets[i];
    const personalizedSubject = subject
      .replace(/\{\{customer_name\}\}/g, customer.name || "Customer")
      .replace(/\{\{store_name\}\}/g, storeName);

    let emailBody = body
      .replace(/\{\{customer_name\}\}/g, customer.name || "Customer")
      .replace(/\{\{store_name\}\}/g, storeName)
      .replace(/\[CTA:\{[^}]*"text"\s*:\s*"([^"]*)"[^}]*"url"\s*:\s*"([^"]*)"[^}]*"color"\s*:\s*"([^"]*)"[^}]*\}\]/g,
        '<a href="$2" style="display:inline-block;padding:12px 28px;background:$3;color:#ffffff;border-radius:6px;text-decoration:none;font-weight:600;">$1</a>')
      .replace(/\n/g, "<br>");

    // Apply branding
    let htmlBody = emailBody;
    if (brandingData) {
      const social = brandingData.social_links || {};
      const fontFamily = (social as any)?._font_family || "Arial, sans-serif";
      const borderRadius = (social as any)?._border_radius || "8px";
      const headerStyle = (social as any)?._header_style || "centered";
      const tagline = (social as any)?._tagline || "";
      const secondaryColor = (social as any)?._secondary_color || brandingData.brand_color;
      const brandColor = brandingData.brand_color || "#4f46e5";
      const companyName = brandingData.company_name || "";
      const logoUrl = brandingData.logo_url || "";
      const footerText = brandingData.footer_text || "";
      const websiteUrl = brandingData.website_url || "";

      const logoHtml = logoUrl ? `<img src="${logoUrl}" alt="Logo" style="height:44px;margin-bottom:8px;" />` : "";
      const nameHtml = companyName ? `<h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:800;">${companyName}</h1>` : "";
      const taglineHtml = tagline ? `<p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:13px;">${tagline}</p>` : "";

      let headerHtml = "";
      if (headerStyle === "gradient") {
        headerHtml = `<div style="background:linear-gradient(135deg, ${brandColor}, ${secondaryColor});padding:32px;text-align:center;">${logoHtml}${nameHtml}${taglineHtml}</div>`;
      } else if (headerStyle === "minimal") {
        headerHtml = `<div style="padding:28px 32px 20px;text-align:center;border-bottom:3px solid ${brandColor};">
          ${logoUrl ? `<img src="${logoUrl}" alt="Logo" style="height:36px;margin-bottom:8px;" />` : ""}
          ${companyName ? `<h1 style="color:${brandColor};margin:0;font-size:22px;font-weight:800;">${companyName}</h1>` : ""}
          ${tagline ? `<p style="color:#6b7280;margin:4px 0 0;font-size:13px;">${tagline}</p>` : ""}
        </div>`;
      } else if (headerStyle === "left-aligned") {
        headerHtml = `<div style="background:${brandColor};padding:28px 32px;">${logoHtml}<div style="text-align:left">${nameHtml}${taglineHtml}</div></div>`;
      } else {
        headerHtml = `<div style="background:${brandColor};padding:32px;text-align:center;">${logoHtml}${nameHtml}${taglineHtml}</div>`;
      }

      const socialPlatforms = [
        { key: "facebook", svg: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#9ca3af"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>` },
        { key: "instagram", svg: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#9ca3af"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>` },
        { key: "twitter", svg: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#9ca3af"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>` },
        { key: "linkedin", svg: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#9ca3af"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>` },
        { key: "youtube", svg: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#9ca3af"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>` },
      ];
      const socialLinksHtml = socialPlatforms
        .filter((p) => (social as any)[p.key])
        .map((p) => `<a href="${(social as any)[p.key]}" style="display:inline-block;margin:0 6px;" target="_blank">${p.svg}</a>`)
        .join("");
      const socialSection = socialLinksHtml ? `<div style="margin:12px 0 4px;text-align:center;">${socialLinksHtml}</div>` : "";

      htmlBody = `
        <div style="font-family:${fontFamily};max-width:600px;margin:0 auto;background:#ffffff;border-radius:${borderRadius};overflow:hidden;border:1px solid #e5e7eb;">
          ${headerHtml}
          <div style="padding:32px;">${emailBody}</div>
          <div style="background:#f9fafb;padding:24px 32px;border-top:1px solid #e5e7eb;text-align:center;">
            ${socialSection}
            <p style="color:#6b7280;font-size:12px;margin:8px 0 4px;">${footerText}</p>
            ${websiteUrl ? `<a href="${websiteUrl}" style="color:${brandColor};font-size:12px;">${websiteUrl}</a>` : ""}
          </div>
        </div>`;
    }

    // Tracking pixel
    const trackingParams = `s=${encodeURIComponent(store_id)}&u=${encodeURIComponent(user_id)}&e=${encodeURIComponent(customer.email)}`;
    htmlBody += `<img src="${trackingBaseUrl}?t=open&${trackingParams}" width="1" height="1" style="display:none;" alt="" />`;

    // Wrap links for click tracking
    htmlBody = htmlBody.replace(
      /href="(https?:\/\/[^"]+)"/g,
      (match: string, url: string) => {
        if (url.includes("email-tracking")) return match;
        return `href="${trackingBaseUrl}?t=click&${trackingParams}&l=${encodeURIComponent(url)}"`;
      }
    );

    // Log to notification_logs
    const { data: logEntry } = await supabase
      .from("notification_logs")
      .insert({
        user_id,
        channel: "email",
        recipient: customer.email,
        subject: personalizedSubject,
        message: `Marketing campaign to ${customer.name}`,
        status: "sending",
      })
      .select("id")
      .single();

    try {
      if (emailConfig.provider_type === "sendgrid" && emailConfig.api_key) {
        const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
          method: "POST",
          headers: { Authorization: `Bearer ${emailConfig.api_key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: customer.email }] }],
            from: { email: emailConfig.sender_email, name: emailConfig.sender_name },
            subject: personalizedSubject,
            content: [{ type: "text/html", value: htmlBody }],
          }),
        });
        if (!res.ok) throw new Error(`SendGrid: ${res.status} ${await res.text()}`);
      } else if (emailConfig.provider_type === "resend" && emailConfig.api_key) {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${emailConfig.api_key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: `${emailConfig.sender_name} <${emailConfig.sender_email}>`,
            to: [customer.email],
            subject: personalizedSubject,
            html: htmlBody,
          }),
        });
        if (!res.ok) throw new Error(`Resend: ${res.status} ${await res.text()}`);
      } else if (emailConfig.provider_type === "smtp" && emailConfig.smtp_host) {
        const smtpPort = emailConfig.smtp_port || 465;
        const client = new SMTPClient({
          connection: {
            hostname: emailConfig.smtp_host,
            port: smtpPort,
            tls: smtpPort === 465,
            auth: { username: emailConfig.smtp_user || emailConfig.sender_email, password: emailConfig.smtp_pass },
          },
        });
        try {
          await client.send({
            from: `${emailConfig.sender_name} <${emailConfig.sender_email}>`,
            to: customer.email,
            subject: personalizedSubject,
            content: "auto",
            html: htmlBody,
          });
        } finally {
          await client.close();
        }
      } else {
        throw new Error("No valid email provider configured");
      }

      if (logEntry) await supabase.from("notification_logs").update({ status: "sent" }).eq("id", logEntry.id);
      results.sent++;
      results.details.push({ email: customer.email, status: "sent" });
      console.log(`[Marketing] Sent to ${customer.email}`);
    } catch (err: any) {
      if (logEntry) await supabase.from("notification_logs").update({ status: "failed", error_message: err.message?.substring(0, 500) }).eq("id", logEntry.id);
      results.failed++;
      results.details.push({ email: customer.email, status: "failed", error: err.message });
      console.error(`[Marketing] Failed ${customer.email}: ${err.message}`);
    }

    if (i < targets.length - 1) await new Promise((r) => setTimeout(r, delayMs));
  }

  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const { store_id, user_id, mode, customer_ids, template_override, template_id, scheduled,
            campaign_type, custom_subject, custom_body } = body;

    // Marketing campaign mode — sends directly to customers, no subscriptions needed
    if (mode === "campaign" && campaign_type === "marketing") {
      if (!store_id || !user_id || !customer_ids?.length) {
        return new Response(JSON.stringify({ error: "store_id, user_id, and customer_ids required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Resolve subject/body from template or custom content
      let emailSubject = custom_subject || "";
      let emailBodyContent = custom_body || "";

      if (!emailSubject && template_id) {
        const { data: tpl } = await supabase
          .from("renewal_email_templates")
          .select("subject, body")
          .eq("id", template_id)
          .single();
        if (tpl) {
          emailSubject = tpl.subject;
          emailBodyContent = tpl.body;
        }
      }

      if (!emailSubject) {
        return new Response(JSON.stringify({ error: "No subject — select a template or provide custom content" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const results = await processMarketingCampaign(supabase, store_id, user_id, customer_ids, emailSubject, emailBodyContent);
      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Scheduled mode: process ALL stores with auto mode enabled
    if (scheduled === true || (!store_id && !user_id)) {
      console.log("[Scheduled] Processing all auto-mode stores...");
      const { data: autoConfigs } = await supabase
        .from("renewal_automation_config")
        .select("store_id, user_id")
        .eq("is_auto_mode", true)
        .eq("is_active", true);

      if (!autoConfigs || autoConfigs.length === 0) {
        return new Response(JSON.stringify({ message: "No stores with auto mode enabled" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const allResults = [];
      for (const config of autoConfigs) {
        console.log(`[Scheduled] Processing store: ${config.store_id}`);
        const result = await processStore(supabase, config.store_id, config.user_id, "auto");
        allResults.push({ store_id: config.store_id, ...result });
      }

      return new Response(JSON.stringify({ scheduled: true, stores: allResults }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Manual/campaign mode: require store_id and user_id
    if (!store_id || !user_id) {
      return new Response(JSON.stringify({ error: "store_id and user_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = await processStore(supabase, store_id, user_id, mode || "auto", customer_ids, template_override, template_id);

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Renewal reminder error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
