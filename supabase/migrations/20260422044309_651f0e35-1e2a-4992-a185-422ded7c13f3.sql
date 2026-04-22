-- Phase 1: Admin Control Features

-- 1. Audit Logs
CREATE TABLE public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  admin_email text DEFAULT '',
  action text NOT NULL,
  target_type text DEFAULT '',
  target_id text DEFAULT '',
  target_label text DEFAULT '',
  details jsonb DEFAULT '{}'::jsonb,
  ip_address text DEFAULT '',
  user_agent text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_admin_audit_logs_admin ON public.admin_audit_logs(admin_id, created_at DESC);
CREATE INDEX idx_admin_audit_logs_action ON public.admin_audit_logs(action, created_at DESC);
CREATE INDEX idx_admin_audit_logs_target ON public.admin_audit_logs(target_type, target_id);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit logs"
  ON public.admin_audit_logs FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert audit logs"
  ON public.admin_audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND admin_id = auth.uid());

-- 2. Broadcasts
CREATE TABLE public.broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  title text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  target_type text NOT NULL DEFAULT 'all', -- all|plan|user|suspended|active
  target_value text DEFAULT '', -- plan name or specific user id
  channel text NOT NULL DEFAULT 'in_app', -- in_app|email|both
  status text NOT NULL DEFAULT 'draft', -- draft|sent|scheduled
  scheduled_at timestamptz,
  sent_at timestamptz,
  recipients_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_broadcasts_admin ON public.broadcasts(admin_id, created_at DESC);
CREATE INDEX idx_broadcasts_status ON public.broadcasts(status);

ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage broadcasts"
  ON public.broadcasts FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 3. System Settings (Maintenance Mode + global flags)
CREATE TABLE public.system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text DEFAULT '',
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read system settings"
  ON public.system_settings FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Admins manage system settings"
  ON public.system_settings FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Seed maintenance mode setting
INSERT INTO public.system_settings (key, value, description) VALUES
  ('maintenance_mode', '{"enabled": false, "message": "We are performing scheduled maintenance. Please check back soon.", "allow_admin": true}'::jsonb, 'Site-wide maintenance mode toggle')
ON CONFLICT (key) DO NOTHING;

-- 4. Impersonation Sessions (audit + active session tracking)
CREATE TABLE public.impersonation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  target_email text DEFAULT '',
  reason text DEFAULT '',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  is_active boolean NOT NULL DEFAULT true
);
CREATE INDEX idx_impersonation_admin ON public.impersonation_sessions(admin_id, started_at DESC);
CREATE INDEX idx_impersonation_target ON public.impersonation_sessions(target_user_id);

ALTER TABLE public.impersonation_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage impersonation sessions"
  ON public.impersonation_sessions FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND admin_id = auth.uid());