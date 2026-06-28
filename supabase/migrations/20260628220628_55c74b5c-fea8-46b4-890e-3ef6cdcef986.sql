
CREATE TABLE IF NOT EXISTS public.email_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  code_hash text NOT NULL,
  purpose text NOT NULL DEFAULT 'signup',
  payload jsonb,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_otps_email_purpose ON public.email_otps (lower(email), purpose, created_at DESC);

GRANT ALL ON public.email_otps TO service_role;

ALTER TABLE public.email_otps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON public.email_otps FOR ALL TO service_role USING (true) WITH CHECK (true);
