ALTER TABLE public.plan_payments
  ADD COLUMN IF NOT EXISTS applied_coupon_code text,
  ADD COLUMN IF NOT EXISTS original_amount numeric,
  ADD COLUMN IF NOT EXISTS discount_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_amount numeric;

CREATE INDEX IF NOT EXISTS idx_plan_payments_applied_coupon ON public.plan_payments(applied_coupon_code) WHERE applied_coupon_code IS NOT NULL;