
DROP POLICY IF EXISTS "Staff can insert store orders" ON public.orders;

CREATE POLICY "Staff can insert store orders"
ON public.orders FOR INSERT
TO authenticated
WITH CHECK (
  store_id IS NOT NULL
  AND public.is_store_member(store_id)
  AND user_id = (
    SELECT sm.user_id
    FROM public.staff_members sm
    WHERE sm.auth_user_id = auth.uid()
      AND sm.is_active = true
      AND (
        sm.store_id = orders.store_id
        OR orders.store_id = ANY(COALESCE(sm.store_ids, ARRAY[]::uuid[]))
      )
    LIMIT 1
  )
);
