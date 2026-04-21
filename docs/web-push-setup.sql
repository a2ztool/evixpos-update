-- ════════════════════════════════════════════════════════════════
-- Web Push Notifications: subscriptions table + auto-fanout triggers
-- Run this ONCE in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ════════════════════════════════════════════════════════════════

-- 1. push_subscriptions: one row per device subscription
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own_push_subs" ON public.push_subscriptions;
CREATE POLICY "users_select_own_push_subs"
  ON public.push_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_insert_own_push_subs" ON public.push_subscriptions;
CREATE POLICY "users_insert_own_push_subs"
  ON public.push_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_delete_own_push_subs" ON public.push_subscriptions;
CREATE POLICY "users_delete_own_push_subs"
  ON public.push_subscriptions FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_update_own_push_subs" ON public.push_subscriptions;
CREATE POLICY "users_update_own_push_subs"
  ON public.push_subscriptions FOR UPDATE
  USING (auth.uid() = user_id);

-- 2. Trigger: when a notifications row is INSERTed → call send-push edge function
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.trigger_send_push_on_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://vuuesqrdjuqnduhiihwz.supabase.co/functions/v1/send-push',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object(
      'user_id', NEW.user_id,
      'type', NEW.type,
      'message', NEW.message,
      'notification_id', NEW.id
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_notification_insert_send_push ON public.notifications;
CREATE TRIGGER on_notification_insert_send_push
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_send_push_on_notification();

-- 3. Trigger: mirror staff_messages INSERT → notifications (so chat triggers push too)
CREATE OR REPLACE FUNCTION public.mirror_message_to_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_preview text;
BEGIN
  IF NEW.sender_id IS NULL OR NEW.receiver_id IS NULL OR NEW.sender_id = NEW.receiver_id THEN
    RETURN NEW;
  END IF;

  v_preview := COALESCE(NULLIF(NEW.message, ''), '[attachment]');
  IF length(v_preview) > 120 THEN
    v_preview := substr(v_preview, 1, 117) || '...';
  END IF;

  INSERT INTO public.notifications (user_id, message, type, is_read)
  VALUES (NEW.receiver_id, '💬 ' || v_preview, 'message', false);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_message_mirror_to_notification ON public.staff_messages;
CREATE TRIGGER on_message_mirror_to_notification
  AFTER INSERT ON public.staff_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.mirror_message_to_notification();
