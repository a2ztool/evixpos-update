-- 1) Add order_id column linking transactions to orders (CASCADE on order delete)
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_transactions_order_id ON public.transactions(order_id);

-- 2) Add order_id column linking subscriptions to orders (CASCADE on order delete)
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_subscriptions_order_id ON public.subscriptions(order_id);

-- 3) Backfill transactions.order_id from existing note pattern "POS ... Order #abc12345"
UPDATE public.transactions t
SET order_id = o.id
FROM public.orders o
WHERE t.order_id IS NULL
  AND t.note IS NOT NULL
  AND t.store_id = o.store_id
  AND position(upper(substring(o.id::text, 1, 8)) IN upper(t.note)) > 0;

-- 4) Backfill subscriptions.order_id from existing notes pattern "from order <uuid>" or "POS Order #abc12345"
UPDATE public.subscriptions s
SET order_id = o.id
FROM public.orders o
WHERE s.order_id IS NULL
  AND s.notes IS NOT NULL
  AND s.store_id = o.store_id
  AND (
    position(o.id::text IN s.notes) > 0
    OR position(upper(substring(o.id::text, 1, 8)) IN upper(s.notes)) > 0
  );