-- Track active sessions for single-session enforcement (owners only)
CREATE TABLE IF NOT EXISTS public.active_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id text NOT NULL,
  device_label text DEFAULT '',
  user_agent text DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  invalidated_reason text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_active_sessions_user ON public.active_sessions(user_id, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_sessions_session ON public.active_sessions(session_id);

ALTER TABLE public.active_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own sessions" ON public.active_sessions;
CREATE POLICY "Users can view own sessions"
ON public.active_sessions FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own sessions" ON public.active_sessions;
CREATE POLICY "Users can insert own sessions"
ON public.active_sessions FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own sessions" ON public.active_sessions;
CREATE POLICY "Users can update own sessions"
ON public.active_sessions FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own sessions" ON public.active_sessions;
CREATE POLICY "Users can delete own sessions"
ON public.active_sessions FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.active_sessions;
ALTER TABLE public.active_sessions REPLICA IDENTITY FULL;