DROP POLICY IF EXISTS "Group members can view group messages" ON public.chat_group_messages;

CREATE POLICY "Group members can view group messages"
ON public.chat_group_messages
FOR SELECT
TO authenticated
USING (
  sender_id = auth.uid()
  OR is_chat_group_member(auth.uid(), group_id)
  OR EXISTS (
    SELECT 1
    FROM public.chat_groups g
    WHERE g.id = chat_group_messages.group_id
      AND is_store_owner(auth.uid(), g.store_id)
  )
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chat_groups'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_groups;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chat_group_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_group_members;
  END IF;
END $$;