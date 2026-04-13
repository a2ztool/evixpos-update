
-- Add expires_at column to plan_payments
ALTER TABLE public.plan_payments 
ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone DEFAULT (now() + interval '1 hour');

-- Create a partial unique index to prevent duplicate transaction_ids for non-rejected payments
-- Only enforce uniqueness when transaction_id is not empty
CREATE UNIQUE INDEX IF NOT EXISTS idx_plan_payments_unique_txn 
ON public.plan_payments (transaction_id) 
WHERE transaction_id IS NOT NULL AND transaction_id != '' AND status IN ('pending', 'approved');

-- Function to auto-expire old pending payments
CREATE OR REPLACE FUNCTION public.auto_expire_pending_payments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Before inserting a new payment, expire any old pending payments for the same user+plan
  UPDATE public.plan_payments
  SET status = 'expired'
  WHERE user_id = NEW.user_id
    AND plan = NEW.plan
    AND status = 'pending'
    AND expires_at < now();
  RETURN NEW;
END;
$$;

-- Trigger to auto-expire before new insert
DROP TRIGGER IF EXISTS trg_auto_expire_payments ON public.plan_payments;
CREATE TRIGGER trg_auto_expire_payments
BEFORE INSERT ON public.plan_payments
FOR EACH ROW
EXECUTE FUNCTION public.auto_expire_pending_payments();

-- Function to notify all admins when a new payment is submitted
CREATE OR REPLACE FUNCTION public.notify_admins_new_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_record RECORD;
  user_email text;
BEGIN
  -- Get submitter email
  SELECT email INTO user_email FROM public.profiles WHERE id = NEW.user_id;
  
  -- Notify all admins
  FOR admin_record IN 
    SELECT user_id FROM public.user_roles WHERE role = 'admin'
  LOOP
    INSERT INTO public.notifications (user_id, type, message)
    VALUES (
      admin_record.user_id,
      'payment',
      '💰 New payment submitted by ' || COALESCE(user_email, 'Unknown') || ' for ' || UPPER(NEW.plan) || ' plan (' || NEW.currency || ' ' || NEW.amount || '). Review now!'
    );
  END LOOP;
  
  RETURN NEW;
END;
$$;

-- Trigger for admin notification on new payment
DROP TRIGGER IF EXISTS trg_notify_admins_payment ON public.plan_payments;
CREATE TRIGGER trg_notify_admins_payment
AFTER INSERT ON public.plan_payments
FOR EACH ROW
EXECUTE FUNCTION public.notify_admins_new_payment();
