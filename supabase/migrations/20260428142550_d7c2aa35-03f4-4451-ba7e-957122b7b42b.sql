
-- Phase 1: ZiniPay BDT gateway schema

-- 1. Add BDT price column to plans_config
ALTER TABLE public.plans_config
  ADD COLUMN IF NOT EXISTS price_bdt numeric;

-- Backfill BDT price from INR price (1 INR ≈ 1.45 BDT) where missing
UPDATE public.plans_config
SET price_bdt = ROUND((COALESCE(price_inr, 0) * 1.45)::numeric, 0)
WHERE price_bdt IS NULL;

-- 2. Add ZiniPay tracking columns to plan_payments
ALTER TABLE public.plan_payments
  ADD COLUMN IF NOT EXISTS zinipay_invoice_id text,
  ADD COLUMN IF NOT EXISTS zinipay_val_id text,
  ADD COLUMN IF NOT EXISTS zinipay_transaction_id text,
  ADD COLUMN IF NOT EXISTS zinipay_payment_method text;

-- 3. Unique index on val_id (only when present) to prevent duplicate processing
CREATE UNIQUE INDEX IF NOT EXISTS plan_payments_zinipay_val_id_key
  ON public.plan_payments (zinipay_val_id)
  WHERE zinipay_val_id IS NOT NULL;

-- 4. Helpful index for webhook lookups
CREATE INDEX IF NOT EXISTS plan_payments_zinipay_invoice_id_idx
  ON public.plan_payments (zinipay_invoice_id)
  WHERE zinipay_invoice_id IS NOT NULL;
