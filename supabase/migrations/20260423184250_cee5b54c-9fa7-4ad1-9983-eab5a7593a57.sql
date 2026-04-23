-- Verification probe: simulate user creating a ticket and a user replying.
-- This will cause our triggers to fire and write rows into public.notifications.
DO $$
DECLARE
  v_user uuid := '69b155df-1be9-4eb3-bb1a-fa237d8de05c';
  v_ticket uuid;
  v_admin_count int;
  v_notif_count_ticket int;
  v_notif_count_msg int;
BEGIN
  -- Count expected admins
  SELECT count(*) INTO v_admin_count FROM public.user_roles
  WHERE role IN ('admin','super_admin','support_admin');
  RAISE NOTICE 'Expected admin recipients: %', v_admin_count;

  -- 1) USER creates a ticket
  INSERT INTO public.support_tickets (user_id, subject, description, category, priority, status)
  VALUES (v_user, 'VERIFY: end-to-end notif probe', 'probe', 'general', 'low', 'open')
  RETURNING id INTO v_ticket;

  SELECT count(*) INTO v_notif_count_ticket FROM public.notifications
  WHERE message LIKE '🎫 New support ticket%' AND created_at > now() - interval '30 seconds';
  RAISE NOTICE 'Notifications created on ticket INSERT: % (should equal admin count %)', v_notif_count_ticket, v_admin_count;

  -- 2) USER replies on the ticket
  INSERT INTO public.support_messages (ticket_id, user_id, message, sender_type)
  VALUES (v_ticket, v_user, 'verify reply from user', 'user');

  SELECT count(*) INTO v_notif_count_msg FROM public.notifications
  WHERE message LIKE '💬 New reply on ticket%' AND created_at > now() - interval '30 seconds';
  RAISE NOTICE 'Notifications created on USER reply: % (should equal admin count %)', v_notif_count_msg, v_admin_count;

  -- 3) ADMIN replies — should notify ticket owner exactly once
  INSERT INTO public.support_messages (ticket_id, user_id, message, sender_type)
  VALUES (v_ticket, '05272182-b2f2-4b4d-8e34-cfae8a1e0e9d', 'verify reply from admin', 'admin');

  -- Cleanup probe rows so they don't pollute UI
  DELETE FROM public.notifications
   WHERE created_at > now() - interval '30 seconds'
     AND (message LIKE '🎫 New support ticket%VERIFY%' OR message LIKE '%verify reply%' OR message LIKE '💬%');
  DELETE FROM public.support_messages WHERE ticket_id = v_ticket;
  DELETE FROM public.support_tickets WHERE id = v_ticket;
END $$;