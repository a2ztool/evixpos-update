ALTER TABLE public.business_settings DROP CONSTRAINT IF EXISTS business_settings_user_id_key;
ALTER TABLE public.business_settings ALTER COLUMN store_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS business_settings_user_store_uidx ON public.business_settings(user_id, store_id);