-- 1. Add paid_amount column to transactions for partial payment tracking
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS paid_amount numeric NOT NULL DEFAULT 0;

-- 2. Create due_payments table for payment history
CREATE TABLE IF NOT EXISTS public.due_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  payment_date timestamptz NOT NULL DEFAULT now(),
  payment_method text NOT NULL DEFAULT 'cash',
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_due_payments_transaction ON public.due_payments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_due_payments_store ON public.due_payments(store_id);

ALTER TABLE public.due_payments ENABLE ROW LEVEL SECURITY;

-- RLS: store owners + active staff of the store
CREATE POLICY "Store members can view due payments"
  ON public.due_payments FOR SELECT
  USING (
    public.is_store_owner(auth.uid(), store_id)
    OR public.is_store_member(store_id)
  );

CREATE POLICY "Store members can insert due payments"
  ON public.due_payments FOR INSERT
  WITH CHECK (
    public.is_store_owner(auth.uid(), store_id)
    OR public.is_store_member(store_id)
  );

CREATE POLICY "Store members can update due payments"
  ON public.due_payments FOR UPDATE
  USING (
    public.is_store_owner(auth.uid(), store_id)
    OR public.is_store_member(store_id)
  );

CREATE POLICY "Store members can delete due payments"
  ON public.due_payments FOR DELETE
  USING (
    public.is_store_owner(auth.uid(), store_id)
    OR public.is_store_member(store_id)
  );

-- Enable realtime
ALTER TABLE public.due_payments REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.due_payments;