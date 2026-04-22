-- Helper: any admin tier
CREATE OR REPLACE FUNCTION public.is_any_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin','super_admin','support_admin','finance_admin')
  )
$$;

-- Activity feed table
CREATE TABLE IF NOT EXISTS public.admin_activity_feed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  user_email text,
  event_type text NOT NULL,
  event_label text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_activity_feed_created_at
  ON public.admin_activity_feed (created_at DESC);

ALTER TABLE public.admin_activity_feed ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read activity" ON public.admin_activity_feed;
CREATE POLICY "Admins can read activity"
ON public.admin_activity_feed
FOR SELECT TO authenticated
USING (public.is_any_admin(auth.uid()));

-- Triggers to auto-log activity
CREATE OR REPLACE FUNCTION public.log_signup_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.admin_activity_feed (user_id, user_email, event_type, event_label)
  VALUES (NEW.id, NEW.email, 'signup', '👤 New user signed up');
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_signup ON public.profiles;
CREATE TRIGGER trg_log_signup
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.log_signup_activity();

CREATE OR REPLACE FUNCTION public.log_order_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_email text;
BEGIN
  SELECT email INTO v_email FROM public.profiles WHERE id = NEW.user_id;
  INSERT INTO public.admin_activity_feed (user_id, user_email, event_type, event_label, metadata)
  VALUES (NEW.user_id, v_email, 'order', '🛒 New order placed', jsonb_build_object('amount', NEW.total_amount, 'order_id', NEW.id));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_order ON public.orders;
CREATE TRIGGER trg_log_order
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.log_order_activity();

CREATE OR REPLACE FUNCTION public.log_payment_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_email text;
BEGIN
  SELECT email INTO v_email FROM public.profiles WHERE id = NEW.user_id;
  INSERT INTO public.admin_activity_feed (user_id, user_email, event_type, event_label, metadata)
  VALUES (NEW.user_id, v_email, 'payment', '💰 Plan payment submitted', jsonb_build_object('amount', NEW.amount, 'plan', NEW.plan, 'currency', NEW.currency));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_payment ON public.plan_payments;
CREATE TRIGGER trg_log_payment
AFTER INSERT ON public.plan_payments
FOR EACH ROW EXECUTE FUNCTION public.log_payment_activity();