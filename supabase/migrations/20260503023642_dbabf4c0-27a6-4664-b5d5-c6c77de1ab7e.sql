
-- 1. Customers: remove anon SELECT (PII exposure)
DROP POLICY IF EXISTS "Anyone can read customers for forms" ON public.customers;

-- 2. Business settings: remove anon SELECT (PII exposure). Public order form should
-- get business info via existing RPC or via a scoped function. Keep auth/staff policies.
DROP POLICY IF EXISTS "Anon can view business settings" ON public.business_settings;

-- Create a SECURITY DEFINER function for public order forms to fetch only safe public fields
CREATE OR REPLACE FUNCTION public.get_public_business_settings(_store_id uuid)
RETURNS TABLE (
  business_name text,
  logo_url text,
  default_currency text,
  store_slug text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT business_name, logo_url, default_currency, store_slug
  FROM public.business_settings
  WHERE store_id = _store_id
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_public_business_settings(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_business_settings(uuid) TO anon, authenticated;

-- 3. Chat sessions / chat messages: scope to visitor_id
DROP POLICY IF EXISTS "Visitors can view own sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Visitors can update own sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Anyone can view messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Visitors can update own messages" ON public.chat_messages;

CREATE POLICY "Visitors view own sessions by header"
ON public.chat_sessions FOR SELECT
TO anon, authenticated
USING (visitor_id = current_setting('request.headers', true)::json->>'x-visitor-id');

CREATE POLICY "Visitors update own sessions by header"
ON public.chat_sessions FOR UPDATE
TO anon, authenticated
USING (visitor_id = current_setting('request.headers', true)::json->>'x-visitor-id');

CREATE POLICY "Visitors view own session messages"
ON public.chat_messages FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.chat_sessions s
    WHERE s.id = chat_messages.session_id
      AND s.visitor_id = current_setting('request.headers', true)::json->>'x-visitor-id'
  )
);

CREATE POLICY "Visitors update own session messages"
ON public.chat_messages FOR UPDATE
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.chat_sessions s
    WHERE s.id = chat_messages.session_id
      AND s.visitor_id = current_setting('request.headers', true)::json->>'x-visitor-id'
  )
);

-- 4. ads_metrics: lock down INSERT/UPDATE (was permissive to public role)
DROP POLICY IF EXISTS "Service role can insert ads_metrics" ON public.ads_metrics;
DROP POLICY IF EXISTS "Service role can update ads_metrics" ON public.ads_metrics;

CREATE POLICY "Users insert own ads_metrics"
ON public.ads_metrics FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own ads_metrics"
ON public.ads_metrics FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 5. Storage: store-logos and staff-chat ownership scoping (path begins with store_id)
DROP POLICY IF EXISTS "Authenticated users can update store logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete store logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload store logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete staff chat files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload staff chat files" ON storage.objects;

CREATE POLICY "Store members upload store logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'store-logos'
  AND public.is_store_member(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Store members update store logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'store-logos'
  AND public.is_store_member(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Store members delete store logos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'store-logos'
  AND public.is_store_member(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Store members upload staff chat files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'staff-chat'
  AND public.is_store_member(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Store members delete staff chat files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'staff-chat'
  AND public.is_store_member(((storage.foldername(name))[1])::uuid)
);

-- 6. Fix function search_path warning
ALTER FUNCTION public.touch_updated_at() SET search_path = public;
