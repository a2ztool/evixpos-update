
CREATE TABLE public.meta_ad_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
  access_token TEXT NOT NULL,
  ad_account_id TEXT,
  account_name TEXT,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.meta_ad_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own meta ad accounts"
  ON public.meta_ad_accounts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own meta ad accounts"
  ON public.meta_ad_accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own meta ad accounts"
  ON public.meta_ad_accounts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own meta ad accounts"
  ON public.meta_ad_accounts FOR DELETE
  USING (auth.uid() = user_id);

CREATE UNIQUE INDEX idx_meta_ad_accounts_store ON public.meta_ad_accounts(user_id, store_id);
