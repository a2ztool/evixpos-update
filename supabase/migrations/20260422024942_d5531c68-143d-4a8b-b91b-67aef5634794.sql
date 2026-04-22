-- Allow staff members to view their owner's user-level plan subscription
-- so the staff dashboard inherits the owner's plan (free/pro/business).
CREATE POLICY "Staff can view owner plan subscription"
ON public.subscriptions
FOR SELECT
USING (
  customer_id IS NULL
  AND user_id = public.get_staff_owner_id()
);