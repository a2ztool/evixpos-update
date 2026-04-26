-- Ensure realtime broadcasts notification inserts for global sound handling
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- Robust group task status notification trigger for both owner and staff actors
CREATE OR REPLACE FUNCTION public.notify_group_task_status_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  actor_id uuid;
  normalized_status text;
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
  normalized_status := replace(lower(COALESCE(NULLIF(NEW.task_status, ''), 'pending')), '_', '-');
  status_label := CASE normalized_status
    WHEN 'in-progress' THEN 'In Progress'
    WHEN 'completed' THEN 'Completed'
    ELSE 'Pending'
  END;
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