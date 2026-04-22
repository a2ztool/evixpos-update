
CREATE OR REPLACE FUNCTION public.get_staff_limit(_plan text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE _plan
    WHEN 'business' THEN 10
    WHEN 'pro' THEN 3
    ELSE 1
  END
$$;
