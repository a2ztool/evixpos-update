-- Add Razorpay-specific columns to plan_payments for online gateway tracking
ALTER TABLE public.plan_payments
  ADD COLUMN IF NOT EXISTS razorpay_order_id text,
  ADD COLUMN IF NOT EXISTS razorpay_payment_id text,
  ADD COLUMN IF NOT EXISTS razorpay_signature text,
  ADD COLUMN IF NOT EXISTS gateway text,
  ADD COLUMN IF NOT EXISTS volume integer,
  ADD COLUMN IF NOT EXISTS billing_type text;

CREATE UNIQUE INDEX IF NOT EXISTS plan_payments_razorpay_order_id_uidx
  ON public.plan_payments(razorpay_order_id) WHERE razorpay_order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS plan_payments_razorpay_payment_id_uidx
  ON public.plan_payments(razorpay_payment_id) WHERE razorpay_payment_id IS NOT NULL;

-- Idempotency log for webhook events
CREATE TABLE IF NOT EXISTS public.razorpay_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text UNIQUE NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.razorpay_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view webhook events"
  ON public.razorpay_webhook_events
  FOR SELECT
  USING (public.is_any_admin(auth.uid()));