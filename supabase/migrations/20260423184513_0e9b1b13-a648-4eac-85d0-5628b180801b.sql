-- Notify user when their plan is upgraded (manual admin upgrade or self-upgrade)
CREATE OR REPLACE FUNCTION public.notify_user_plan_upgraded()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_level int := 0;
  v_new_level int := 0;
  v_plan text;
  v_should_notify boolean := false;
BEGIN
  -- Only consider real user (account-level) subscriptions
  IF NEW.customer_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  IF COALESCE(NEW.status, '') <> 'active' THEN RETURN NEW; END IF;

  v_plan := lower(NEW.plan::text);

  IF TG_OP = 'INSERT' THEN
    -- New active subscription on a paid tier counts as upgrade
    IF v_plan IN ('pro','business') THEN v_should_notify := true; END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old_level := CASE lower(COALESCE(OLD.plan::text,'free'))
                     WHEN 'business' THEN 2 WHEN 'pro' THEN 1 ELSE 0 END;
    v_new_level := CASE v_plan
                     WHEN 'business' THEN 2 WHEN 'pro' THEN 1 ELSE 0 END;
    IF v_new_level > v_old_level THEN v_should_notify := true; END IF;
  END IF;

  IF v_should_notify THEN
    INSERT INTO public.notifications (user_id, message, type, is_read)
    VALUES (
      NEW.user_id,
      '🎉 Your plan has been upgraded by admin to ' || initcap(v_plan),
      'system',
      false
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_subscription_notify_plan_upgrade ON public.subscriptions;
CREATE TRIGGER on_subscription_notify_plan_upgrade
  AFTER INSERT OR UPDATE OF plan, status ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_user_plan_upgraded();