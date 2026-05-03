-- Allow staff to read their owner's admin_plan_overrides row,
-- so realtime sync (override changes) works on staff side as well.
CREATE POLICY "Staff can read owner override"
ON public.admin_plan_overrides
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.staff_members sm
    WHERE sm.auth_user_id = auth.uid()
      AND sm.user_id = admin_plan_overrides.user_id
      AND sm.is_active = true
  )
);

-- Ensure full row is sent on UPDATE (REPLICA IDENTITY FULL)
ALTER TABLE public.admin_plan_overrides REPLICA IDENTITY FULL;
ALTER TABLE public.subscriptions REPLICA IDENTITY FULL;