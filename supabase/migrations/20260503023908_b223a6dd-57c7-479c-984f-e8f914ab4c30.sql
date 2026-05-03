
DROP FUNCTION IF EXISTS public.get_public_business_settings(uuid);
CREATE OR REPLACE FUNCTION public.get_public_business_settings(_store_id uuid)
RETURNS TABLE (
  business_name text,
  logo_url text,
  default_currency text,
  store_slug text,
  payment_methods jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT business_name, logo_url, default_currency, store_slug, payment_methods
  FROM public.business_settings
  WHERE store_id = _store_id
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_public_business_settings(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_business_settings(uuid) TO anon, authenticated;
