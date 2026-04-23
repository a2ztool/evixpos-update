-- ── Notify all admins when a new support ticket is created
CREATE OR REPLACE FUNCTION public.notify_admins_new_support_ticket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_record RECORD;
  v_email text;
  v_preview text;
BEGIN
  SELECT email INTO v_email FROM public.profiles WHERE id = NEW.user_id;
  v_preview := COALESCE(NULLIF(NEW.subject, ''), 'New support ticket');
  IF length(v_preview) > 100 THEN v_preview := substr(v_preview, 1, 97) || '...'; END IF;

  FOR admin_record IN
    SELECT user_id FROM public.user_roles
    WHERE role IN ('admin','super_admin','support_admin')
  LOOP
    INSERT INTO public.notifications (user_id, message, type, is_read)
    VALUES (
      admin_record.user_id,
      '🎫 New support ticket from ' || COALESCE(v_email, 'user') || ': ' || v_preview,
      'system',
      false
    );
  END LOOP;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_support_ticket_notify_admins ON public.support_tickets;
CREATE TRIGGER on_support_ticket_notify_admins
  AFTER INSERT ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admins_new_support_ticket();

-- ── Mirror support messages to notifications (both directions)
CREATE OR REPLACE FUNCTION public.mirror_support_message_to_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket RECORD;
  v_preview text;
  admin_record RECORD;
  v_email text;
BEGIN
  v_preview := COALESCE(NULLIF(NEW.message, ''), '[attachment]');
  IF length(v_preview) > 100 THEN v_preview := substr(v_preview, 1, 97) || '...'; END IF;

  SELECT id, user_id, subject INTO v_ticket FROM public.support_tickets WHERE id = NEW.ticket_id;
  IF v_ticket IS NULL THEN RETURN NEW; END IF;

  IF NEW.sender_type = 'admin' THEN
    -- Notify ticket owner (skip if admin replied to their own ticket)
    IF v_ticket.user_id IS NOT NULL AND v_ticket.user_id <> NEW.user_id THEN
      INSERT INTO public.notifications (user_id, message, type, is_read)
      VALUES (
        v_ticket.user_id,
        '💬 Support replied to your ticket: ' || v_preview,
        'system',
        false
      );
    END IF;
  ELSE
    -- User reply → notify all admins
    SELECT email INTO v_email FROM public.profiles WHERE id = NEW.user_id;
    FOR admin_record IN
      SELECT user_id FROM public.user_roles
      WHERE role IN ('admin','super_admin','support_admin')
    LOOP
      IF admin_record.user_id <> NEW.user_id THEN
        INSERT INTO public.notifications (user_id, message, type, is_read)
        VALUES (
          admin_record.user_id,
          '💬 New reply on ticket from ' || COALESCE(v_email, 'user') || ': ' || v_preview,
          'system',
          false
        );
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_support_message_mirror_to_notifications ON public.support_messages;
CREATE TRIGGER on_support_message_mirror_to_notifications
  AFTER INSERT ON public.support_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.mirror_support_message_to_notifications();