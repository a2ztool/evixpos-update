-- Add task fields and mentions support to chat_group_messages
ALTER TABLE public.chat_group_messages
  ADD COLUMN IF NOT EXISTS task_title text,
  ADD COLUMN IF NOT EXISTS task_status text,
  ADD COLUMN IF NOT EXISTS mentions uuid[] DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.chat_group_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reactions jsonb DEFAULT '{}'::jsonb;

-- Index for task queries
CREATE INDEX IF NOT EXISTS idx_chat_group_messages_task_status
  ON public.chat_group_messages(group_id, task_status)
  WHERE task_status IS NOT NULL;

-- Update mirror trigger to fan out @mention notifications with stronger signal
CREATE OR REPLACE FUNCTION public.mirror_group_message_to_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_preview text;
  v_group_name text;
  member_record RECORD;
  v_mention uuid;
BEGIN
  IF NEW.sender_id IS NULL THEN RETURN NEW; END IF;

  v_preview := COALESCE(NULLIF(NEW.message, ''), '[attachment]');
  IF length(v_preview) > 120 THEN
    v_preview := substr(v_preview, 1, 117) || '...';
  END IF;

  SELECT name INTO v_group_name FROM public.chat_groups WHERE id = NEW.group_id;

  -- Notify all group members (excluding sender) with normal message
  FOR member_record IN
    SELECT user_id FROM public.chat_group_members
    WHERE group_id = NEW.group_id AND user_id <> NEW.sender_id
  LOOP
    -- If this user is mentioned, send a stronger mention notification
    IF NEW.mentions IS NOT NULL AND member_record.user_id = ANY(NEW.mentions) THEN
      INSERT INTO public.notifications (user_id, message, type, is_read)
      VALUES (
        member_record.user_id,
        '🔔 You were mentioned in ' || COALESCE(v_group_name, 'Group') || ': ' || v_preview,
        'message',
        false
      );
    ELSE
      INSERT INTO public.notifications (user_id, message, type, is_read)
      VALUES (
        member_record.user_id,
        '👥 ' || COALESCE(v_group_name, 'Group') || ': ' || v_preview,
        'message',
        false
      );
    END IF;
  END LOOP;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;