ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS account_id text;
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON public.transactions(account_id);