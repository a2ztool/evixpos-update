
CREATE TABLE IF NOT EXISTS public.chat_task_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_message_id UUID NOT NULL REFERENCES public.chat_group_messages(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES public.chat_task_comments(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_task_comments_task ON public.chat_task_comments(task_message_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_task_comments_group ON public.chat_task_comments(group_id);

ALTER TABLE public.chat_task_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View task comments" ON public.chat_task_comments;
CREATE POLICY "View task comments"
ON public.chat_task_comments
FOR SELECT
TO authenticated
USING (
  sender_id = auth.uid()
  OR is_chat_group_member(auth.uid(), group_id)
  OR EXISTS (
    SELECT 1 FROM public.chat_groups g
    WHERE g.id = chat_task_comments.group_id
      AND is_store_owner(auth.uid(), g.store_id)
  )
);

DROP POLICY IF EXISTS "Insert task comments" ON public.chat_task_comments;
CREATE POLICY "Insert task comments"
ON public.chat_task_comments
FOR INSERT
TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND (
    is_chat_group_member(auth.uid(), group_id)
    OR EXISTS (
      SELECT 1 FROM public.chat_groups g
      WHERE g.id = chat_task_comments.group_id
        AND is_store_owner(auth.uid(), g.store_id)
    )
  )
);

DROP POLICY IF EXISTS "Update own task comments" ON public.chat_task_comments;
CREATE POLICY "Update own task comments"
ON public.chat_task_comments
FOR UPDATE
TO authenticated
USING (sender_id = auth.uid())
WITH CHECK (sender_id = auth.uid());

DROP POLICY IF EXISTS "Delete own task comments" ON public.chat_task_comments;
CREATE POLICY "Delete own task comments"
ON public.chat_task_comments
FOR DELETE
TO authenticated
USING (
  sender_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.chat_groups g
    WHERE g.id = chat_task_comments.group_id
      AND is_store_owner(auth.uid(), g.store_id)
  )
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chat_task_comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_task_comments;
  END IF;
END $$;
