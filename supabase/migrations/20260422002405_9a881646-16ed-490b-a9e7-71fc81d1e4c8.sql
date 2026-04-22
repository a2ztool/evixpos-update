
-- Plan-based staff limit enforcement
CREATE OR REPLACE FUNCTION public.get_staff_limit(_plan text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _plan
    WHEN 'business' THEN 10
    WHEN 'pro' THEN 3
    ELSE 1
  END
$$;

CREATE OR REPLACE FUNCTION public.check_staff_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_plan text;
  staff_count integer;
  max_staff integer;
BEGIN
  current_plan := get_user_plan(NEW.user_id);
  SELECT COUNT(*) INTO staff_count
    FROM public.staff_members
    WHERE user_id = NEW.user_id AND is_active = true;
  max_staff := get_staff_limit(current_plan);

  IF staff_count >= max_staff THEN
    RAISE EXCEPTION 'Staff limit reached. Your % plan allows up to % staff member(s). Please upgrade to add more.', current_plan, max_staff;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_staff_limit ON public.staff_members;
CREATE TRIGGER enforce_staff_limit
BEFORE INSERT ON public.staff_members
FOR EACH ROW EXECUTE FUNCTION public.check_staff_limit();
