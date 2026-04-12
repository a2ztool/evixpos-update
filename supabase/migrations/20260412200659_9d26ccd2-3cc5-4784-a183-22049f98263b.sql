
-- Add reply, reactions, and delete columns to staff_messages
ALTER TABLE public.staff_messages
  ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES public.staff_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS deleted_for UUID[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_deleted_for_everyone BOOLEAN DEFAULT false;

-- Index for reply lookups
CREATE INDEX IF NOT EXISTS idx_staff_messages_reply_to ON public.staff_messages(reply_to_id);
