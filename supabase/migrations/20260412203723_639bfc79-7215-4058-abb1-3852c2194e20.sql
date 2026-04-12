-- Drop the restrictive staff update policy
DROP POLICY IF EXISTS "Staff can update own messages" ON public.staff_messages;

-- Recreate: staff can update messages they sent OR received (for delete, reactions, read status, task status)
CREATE POLICY "Staff can update own messages"
ON public.staff_messages FOR UPDATE TO authenticated
USING (
  (sender_id = auth.uid() OR receiver_id = auth.uid())
  AND is_store_member(store_id)
);