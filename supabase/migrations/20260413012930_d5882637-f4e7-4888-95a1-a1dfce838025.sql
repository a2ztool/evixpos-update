
-- Add new columns to payment_gateways for hybrid mode
ALTER TABLE public.payment_gateways 
ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS api_config jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS icon_url text DEFAULT '';

-- Create auto_payment_logs table for tracking automatic payments
CREATE TABLE public.auto_payment_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  gateway_id uuid REFERENCES public.payment_gateways(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  plan text NOT NULL DEFAULT 'pro',
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'BDT',
  transaction_ref text DEFAULT '',
  status text NOT NULL DEFAULT 'initiated',
  gateway_response jsonb DEFAULT '{}'::jsonb,
  plan_activated boolean NOT NULL DEFAULT false,
  error_message text DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.auto_payment_logs ENABLE ROW LEVEL SECURITY;

-- Admins can manage all auto payment logs
CREATE POLICY "Admins can manage auto_payment_logs"
ON public.auto_payment_logs
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Users can view their own logs
CREATE POLICY "Users can view own auto_payment_logs"
ON public.auto_payment_logs
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can create logs (initiated from client)
CREATE POLICY "Users can create auto_payment_logs"
ON public.auto_payment_logs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Create index for performance
CREATE INDEX idx_auto_payment_logs_user ON public.auto_payment_logs(user_id);
CREATE INDEX idx_auto_payment_logs_gateway ON public.auto_payment_logs(gateway_id);
CREATE INDEX idx_auto_payment_logs_status ON public.auto_payment_logs(status);
