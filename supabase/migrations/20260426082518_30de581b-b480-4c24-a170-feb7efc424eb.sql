-- Ensure group message updates are available through Supabase Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chat_group_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_group_messages;
  END IF;
END $$;

-- Include previous row values in realtime UPDATE payloads and triggers
ALTER TABLE public.chat_group_messages REPLICA IDENTITY FULL;

-- Let group members update task status/reactions/pin metadata for groups they belong to
DROP POLICY IF EXISTS "Group members can update group messages" ON public.chat_group_messages;
CREATE POLICY "Group members can update group messages"
ON public.chat_group_messages
FOR UPDATE
TO authenticated
USING (
  is_chat_group_member(auth.uid(), group_id)
  OR EXISTS (
    SELECT 1
    FROM public.chat_groups g
    WHERE g.id = chat_group_messages.group_id
      AND is_store_owner(auth.uid(), g.store_id)
  )
)
WITH CHECK (
  is_chat_group_member(auth.uid(), group_id)
  OR EXISTS (
    SELECT 1
    FROM public.chat_groups g
    WHERE g.id = chat_group_messages.group_id
      AND is_store_owner(auth.uid(), g.store_id)
  )
);

-- Mirror task status updates into global notifications as a separate event
CREATE OR REPLACE FUNCTION public.notify_group_task_status_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id uuid;
  status_label text;
  task_label text;
BEGIN
  IF COALESCE(NEW.type, '') <> 'task' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(OLD.task_status, '') = COALESCE(NEW.task_status, '') THEN
    RETURN NEW;
  END IF;

  actor_id := auth.uid();
  status_label := COALESCE(NULLIF(NEW.task_status, ''), 'pending');
  task_label := COALESCE(NULLIF(NEW.task_title, ''), 'Task');

  INSERT INTO public.notifications (user_id, message, type, is_read)
  SELECT DISTINCT gm.user_id,
    '📋 Task "' || task_label || '" updated to ' || status_label,
    'task_status_updated',
    false
  FROM public.chat_group_members gm
  WHERE gm.group_id = NEW.group_id
    AND gm.user_id <> COALESCE(actor_id, NEW.sender_id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.notifications n
      WHERE n.user_id = gm.user_id
        AND n.type = 'task_status_updated'
        AND n.message = '📋 Task "' || task_label || '" updated to ' || status_label
        AND n.created_at > now() - interval '3 seconds'
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_group_task_status_update_notify ON public.chat_group_messages;
CREATE TRIGGER on_group_task_status_update_notify
AFTER UPDATE OF task_status ON public.chat_group_messages
FOR EACH ROW
EXECUTE FUNCTION public.notify_group_task_status_update();