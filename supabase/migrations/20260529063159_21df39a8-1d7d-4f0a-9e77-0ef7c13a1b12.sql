-- 1) Custom transaction categories per store
CREATE TABLE IF NOT EXISTS public.transaction_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('income','expense')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, type, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transaction_categories TO authenticated;
GRANT ALL ON public.transaction_categories TO service_role;

ALTER TABLE public.transaction_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners and staff can read store categories"
  ON public.transaction_categories FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_store_member(store_id)
  );

CREATE POLICY "owners and staff can insert store categories"
  ON public.transaction_categories FOR INSERT TO authenticated
  WITH CHECK (
    store_id IS NOT NULL
    AND (
      (user_id = auth.uid() AND public.is_store_owner(auth.uid(), store_id))
      OR (public.is_store_member(store_id) AND user_id = public.get_staff_owner_id())
    )
  );

CREATE POLICY "owners and staff can update store categories"
  ON public.transaction_categories FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_store_member(store_id));

CREATE POLICY "owners and staff can delete store categories"
  ON public.transaction_categories FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_store_member(store_id));

-- 2) Group column to link the 2-3 legs of a fund transfer
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS transfer_id uuid;

CREATE INDEX IF NOT EXISTS transactions_transfer_id_idx
  ON public.transactions(transfer_id) WHERE transfer_id IS NOT NULL;