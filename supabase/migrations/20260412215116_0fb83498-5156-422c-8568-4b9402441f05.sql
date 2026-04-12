-- Add meta jsonb column to orders for WooCommerce extra data
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS meta jsonb DEFAULT '{}'::jsonb;