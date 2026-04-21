-- ════════════════════════════════════════════════════════════════
-- Notification preferences sync + push device tracking
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ════════════════════════════════════════════════════════════════

-- Add notification_prefs jsonb column on business_settings (per-user)
ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb DEFAULT '{}'::jsonb;

-- Optional: friendly device label
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS device_label text;
