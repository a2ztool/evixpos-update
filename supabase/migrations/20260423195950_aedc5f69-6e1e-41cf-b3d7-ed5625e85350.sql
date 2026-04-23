
-- Add customer_name and phone_number columns to transactions for Due Book linkage
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS phone_number text;

-- Backfill existing POS-linked dues by matching note pattern "POS...Order #<prefix>" against orders → customers
UPDATE public.transactions t
SET
  customer_name = COALESCE(NULLIF(t.customer_name, ''), c.name),
  phone_number = COALESCE(NULLIF(t.phone_number, ''), c.phone)
FROM public.orders o
LEFT JOIN public.customers c ON c.id = o.customer_id
WHERE t.note ~* 'POS.*Order #([a-f0-9]+)'
  AND t.store_id = o.store_id
  AND substring(o.id::text from 1 for 8) = substring(substring(t.note from 'POS.*Order #([a-f0-9]+)') from 1 for 8)
  AND (t.customer_name IS NULL OR t.phone_number IS NULL);

-- Index for faster Due Book lookups
CREATE INDEX IF NOT EXISTS idx_transactions_phone ON public.transactions(phone_number) WHERE phone_number IS NOT NULL;
