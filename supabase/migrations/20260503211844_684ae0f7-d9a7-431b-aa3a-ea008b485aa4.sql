
CREATE OR REPLACE FUNCTION public.get_user_plan(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.admin_plan_overrides o
      WHERE o.user_id = _user_id
        AND o.manual_override = true
        AND (o.is_unlimited_store OR o.is_unlimited_customer OR o.is_unlimited_product)
    ) THEN 'business'
    ELSE COALESCE(
      (SELECT plan::text FROM public.subscriptions
       WHERE user_id = _user_id
         AND status = 'active'
         AND customer_id IS NULL
       ORDER BY start_date DESC LIMIT 1),
      'free'
    )
  END
$function$;
