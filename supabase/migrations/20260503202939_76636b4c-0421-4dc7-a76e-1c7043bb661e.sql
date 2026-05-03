
-- 1. Override table
CREATE TABLE IF NOT EXISTS public.admin_plan_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  manual_override boolean NOT NULL DEFAULT false,
  is_unlimited_store boolean NOT NULL DEFAULT false,
  is_unlimited_customer boolean NOT NULL DEFAULT false,
  is_unlimited_product boolean NOT NULL DEFAULT false,
  override_volume integer,
  override_max_stores integer,
  override_max_products integer,
  override_max_customers integer,
  notes text,
  applied_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_plan_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage overrides" ON public.admin_plan_overrides;
CREATE POLICY "Admins manage overrides"
ON public.admin_plan_overrides
FOR ALL
USING (public.is_any_admin(auth.uid()))
WITH CHECK (public.is_any_admin(auth.uid()));

DROP POLICY IF EXISTS "User reads own override" ON public.admin_plan_overrides;
CREATE POLICY "User reads own override"
ON public.admin_plan_overrides
FOR SELECT
USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS touch_admin_plan_overrides ON public.admin_plan_overrides;
CREATE TRIGGER touch_admin_plan_overrides
BEFORE UPDATE ON public.admin_plan_overrides
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Realtime
ALTER TABLE public.admin_plan_overrides REPLICA IDENTITY FULL;
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables
   WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='admin_plan_overrides';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_plan_overrides';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 2. Helper
CREATE OR REPLACE FUNCTION public.get_user_override(_user_id uuid)
RETURNS public.admin_plan_overrides
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.admin_plan_overrides WHERE user_id = _user_id LIMIT 1
$$;

-- 3. Updated limit triggers (override-aware)
CREATE OR REPLACE FUNCTION public.check_store_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  current_plan text;
  store_count integer;
  max_stores integer;
  ov public.admin_plan_overrides;
BEGIN
  SELECT * INTO ov FROM public.admin_plan_overrides WHERE user_id = NEW.user_id;
  IF ov.manual_override AND ov.is_unlimited_store THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO store_count FROM public.stores WHERE user_id = NEW.user_id;

  IF ov.manual_override AND ov.override_max_stores IS NOT NULL THEN
    max_stores := ov.override_max_stores;
  ELSE
    current_plan := get_user_plan(NEW.user_id);
    max_stores := CASE current_plan
      WHEN 'free' THEN 1 WHEN 'pro' THEN 3 WHEN 'business' THEN 10 ELSE 1 END;
  END IF;

  IF store_count >= max_stores THEN
    RAISE EXCEPTION 'Store limit reached (%/%). Please upgrade your plan.', store_count, max_stores;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_user_product_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  current_plan text;
  product_count integer;
  max_products integer;
  ov public.admin_plan_overrides;
BEGIN
  SELECT * INTO ov FROM public.admin_plan_overrides WHERE user_id = NEW.user_id;
  IF ov.manual_override AND ov.is_unlimited_product THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO product_count FROM public.products WHERE user_id = NEW.user_id;

  IF ov.manual_override AND ov.override_max_products IS NOT NULL THEN
    max_products := ov.override_max_products;
  ELSE
    current_plan := get_user_plan(NEW.user_id);
    max_products := CASE current_plan
      WHEN 'free' THEN 25 WHEN 'pro' THEN 100 WHEN 'business' THEN 500 ELSE 25 END;
  END IF;

  IF product_count >= max_products THEN
    RAISE EXCEPTION 'Product limit reached (%/%). Please upgrade your plan.', product_count, max_products;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_user_customer_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  current_plan text;
  current_volume integer;
  customer_count integer;
  max_customers integer;
  ov public.admin_plan_overrides;
BEGIN
  SELECT * INTO ov FROM public.admin_plan_overrides WHERE user_id = NEW.user_id;
  IF ov.manual_override AND ov.is_unlimited_customer THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO customer_count FROM public.customers WHERE user_id = NEW.user_id;

  IF ov.manual_override AND ov.override_max_customers IS NOT NULL THEN
    max_customers := ov.override_max_customers;
  ELSIF ov.manual_override AND ov.override_volume IS NOT NULL THEN
    max_customers := ov.override_volume;
  ELSE
    current_plan := get_user_plan(NEW.user_id);
    SELECT volume INTO current_volume FROM public.subscriptions
      WHERE user_id = NEW.user_id AND status = 'active' AND customer_id IS NULL
      ORDER BY start_date DESC LIMIT 1;
    max_customers := CASE current_plan
      WHEN 'free' THEN 50
      WHEN 'pro' THEN COALESCE(current_volume, 1000)
      WHEN 'business' THEN COALESCE(current_volume, 5000)
      ELSE 50 END;
  END IF;

  IF customer_count >= max_customers THEN
    RAISE EXCEPTION 'Customer limit reached (%/%). Please upgrade your plan.', customer_count, max_customers;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_staff_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  current_plan text;
  staff_count integer;
  max_staff integer;
  ov public.admin_plan_overrides;
BEGIN
  SELECT * INTO ov FROM public.admin_plan_overrides WHERE user_id = NEW.user_id;
  IF ov.manual_override AND ov.is_unlimited_store THEN
    -- treat unlimited stores as also lifting staff cap
    RETURN NEW;
  END IF;

  current_plan := get_user_plan(NEW.user_id);
  SELECT COUNT(*) INTO staff_count FROM public.staff_members
    WHERE user_id = NEW.user_id AND is_active = true;
  max_staff := get_staff_limit(current_plan);

  IF staff_count >= max_staff THEN
    RAISE EXCEPTION 'Staff limit reached. Your % plan allows up to % staff member(s).', current_plan, max_staff;
  END IF;
  RETURN NEW;
END;
$$;
