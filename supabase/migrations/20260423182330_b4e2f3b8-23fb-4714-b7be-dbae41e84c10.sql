
CREATE OR REPLACE FUNCTION public.mirror_group_message_to_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_preview text;
  v_group_name text;
  member_record RECORD;
BEGIN
  IF NEW.sender_id IS NULL THEN RETURN NEW; END IF;

  v_preview := COALESCE(NULLIF(NEW.message, ''), '[attachment]');
  IF length(v_preview) > 120 THEN
    v_preview := substr(v_preview, 1, 117) || '...';
  END IF;

  SELECT name INTO v_group_name FROM public.chat_groups WHERE id = NEW.group_id;

  FOR member_record IN
    SELECT user_id FROM public.chat_group_members
    WHERE group_id = NEW.group_id AND user_id <> NEW.sender_id
  LOOP
    INSERT INTO public.notifications (user_id, message, type, is_read)
    VALUES (
      member_record.user_id,
      '👥 ' || COALESCE(v_group_name, 'Group') || ': ' || v_preview,
      'message',
      false
    );
  END LOOP;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_group_message_mirror_to_notifications ON public.chat_group_messages;
CREATE TRIGGER on_group_message_mirror_to_notifications
  AFTER INSERT ON public.chat_group_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.mirror_group_message_to_notifications();
