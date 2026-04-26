
ALTER TABLE public.staff_messages ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;
ALTER TABLE public.staff_messages ADD COLUMN IF NOT EXISTS pinned_at timestamptz;
ALTER TABLE public.staff_messages ADD COLUMN IF NOT EXISTS pinned_by uuid;

ALTER TABLE public.chat_group_messages ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;
ALTER TABLE public.chat_group_messages ADD COLUMN IF NOT EXISTS pinned_at timestamptz;
ALTER TABLE public.chat_group_messages ADD COLUMN IF NOT EXISTS pinned_by uuid;

CREATE INDEX IF NOT EXISTS idx_staff_messages_pinned ON public.staff_messages(store_id, is_pinned) WHERE is_pinned = true;
CREATE INDEX IF NOT EXISTS idx_chat_group_messages_pinned ON public.chat_group_messages(group_id, is_pinned) WHERE is_pinned = true;
