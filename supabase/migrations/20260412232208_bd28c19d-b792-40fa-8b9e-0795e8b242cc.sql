-- Add ad_account_id to ads_accounts if missing
ALTER TABLE public.ads_accounts ADD COLUMN IF NOT EXISTS ad_account_id text;

-- Create ads_metrics table
CREATE TABLE IF NOT EXISTS public.ads_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id text NOT NULL,
  user_id uuid NOT NULL,
  store_id uuid,
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  spend numeric NOT NULL DEFAULT 0,
  date_start date NOT NULL,
  date_stop date NOT NULL,
  fetched_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(ad_account_id, date_start, date_stop)
);

ALTER TABLE public.ads_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ads_metrics"
ON public.ads_metrics FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert ads_metrics"
ON public.ads_metrics FOR INSERT
WITH CHECK (true);

CREATE POLICY "Service role can update ads_metrics"
ON public.ads_metrics FOR UPDATE
USING (true);

-- Enable required extensions for cron
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;