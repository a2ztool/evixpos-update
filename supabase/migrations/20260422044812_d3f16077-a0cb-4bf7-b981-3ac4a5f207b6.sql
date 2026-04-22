
-- Feature Flags table
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key text NOT NULL UNIQUE,
  label text NOT NULL DEFAULT '',
  description text DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  allowed_plans jsonb NOT NULL DEFAULT '["free","pro","business"]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read feature flags"
  ON public.feature_flags FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Admins manage feature flags"
  ON public.feature_flags FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- System (platform) email/whatsapp templates editable by admin
CREATE TABLE IF NOT EXISTS public.system_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text NOT NULL UNIQUE,
  channel text NOT NULL DEFAULT 'email', -- email | whatsapp | in_app
  label text NOT NULL DEFAULT '',
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.system_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage system templates"
  ON public.system_templates FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Seed default feature flags (idempotent)
INSERT INTO public.feature_flags (flag_key, label, description, enabled, allowed_plans) VALUES
  ('pos', 'POS', 'Point of Sale module', true, '["free","pro","business"]'::jsonb),
  ('woocommerce', 'WooCommerce Sync', 'WooCommerce integration', true, '["pro","business"]'::jsonb),
  ('facebook_ads', 'Facebook Ads', 'Meta/Facebook ads dashboard', true, '["pro","business"]'::jsonb),
  ('bot_automation', 'Bot Automation', 'WhatsApp/Email bots', true, '["pro","business"]'::jsonb),
  ('google_sheets', 'Google Sheets Sync', 'Google Sheets order sync', true, '["pro","business"]'::jsonb),
  ('order_forms', 'Order Forms', 'Public order form builder', true, '["pro","business"]'::jsonb),
  ('coupons', 'Coupons', 'Discount coupons', true, '["pro","business"]'::jsonb),
  ('loyalty', 'Loyalty Points', 'Customer loyalty program', true, '["free","pro","business"]'::jsonb),
  ('referral', 'Referral Program', 'User referral system', true, '["free","pro","business"]'::jsonb)
ON CONFLICT (flag_key) DO NOTHING;

-- Seed default system templates
INSERT INTO public.system_templates (template_key, channel, label, subject, body, variables) VALUES
  ('welcome_email', 'email', 'Welcome Email', 'Welcome to {{app_name}}!', 'Hi {{name}},\n\nWelcome to {{app_name}}. We''re excited to have you on board!', '["name","app_name"]'::jsonb),
  ('password_reset', 'email', 'Password Reset', 'Reset your password', 'Hi {{name}},\n\nClick the link below to reset your password:\n{{reset_link}}', '["name","reset_link"]'::jsonb),
  ('payment_received', 'email', 'Payment Received', 'Payment received — {{plan}} plan activated', 'Hi {{name}},\n\nWe received your payment of {{amount}} {{currency}} for the {{plan}} plan. Your subscription is now active.', '["name","plan","amount","currency"]'::jsonb),
  ('payment_rejected', 'email', 'Payment Rejected', 'Payment could not be verified', 'Hi {{name}},\n\nUnfortunately we could not verify your recent payment of {{amount}} {{currency}}. Reason: {{reason}}', '["name","amount","currency","reason"]'::jsonb),
  ('renewal_reminder', 'email', 'Renewal Reminder', 'Your {{plan}} plan expires in {{days}} days', 'Hi {{name}},\n\nYour {{plan}} subscription expires on {{expiry_date}}. Renew now to avoid service interruption.', '["name","plan","days","expiry_date"]'::jsonb),
  ('plan_expired', 'email', 'Plan Expired', 'Your subscription has expired', 'Hi {{name}},\n\nYour {{plan}} plan has expired. Upgrade now to continue using premium features.', '["name","plan"]'::jsonb),
  ('account_suspended', 'email', 'Account Suspended', 'Your account has been suspended', 'Hi {{name}},\n\nYour account has been suspended. Reason: {{reason}}\n\nContact support for assistance.', '["name","reason"]'::jsonb),
  ('whatsapp_renewal', 'whatsapp', 'WhatsApp Renewal Reminder', '', 'Hi {{name}}, your {{plan}} plan expires in {{days}} days. Renew now: {{renew_link}}', '["name","plan","days","renew_link"]'::jsonb)
ON CONFLICT (template_key) DO NOTHING;

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_feature_flags_touch ON public.feature_flags;
CREATE TRIGGER trg_feature_flags_touch BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_system_templates_touch ON public.system_templates;
CREATE TRIGGER trg_system_templates_touch BEFORE UPDATE ON public.system_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
