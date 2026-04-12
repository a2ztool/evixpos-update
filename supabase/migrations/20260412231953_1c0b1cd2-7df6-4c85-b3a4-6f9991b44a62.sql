CREATE TABLE IF NOT EXISTS public.ads_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  store_id uuid,
  access_token text,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.ads_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ads_accounts"
ON public.ads_accounts FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ads_accounts"
ON public.ads_accounts FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ads_accounts"
ON public.ads_accounts FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own ads_accounts"
ON public.ads_accounts FOR DELETE
USING (auth.uid() = user_id);