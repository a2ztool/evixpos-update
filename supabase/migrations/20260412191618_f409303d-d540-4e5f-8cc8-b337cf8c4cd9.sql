
-- Create staff_messages table for internal owner-staff communication
CREATE TABLE public.staff_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  receiver_id UUID NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  message_type TEXT NOT NULL DEFAULT 'text',
  file_url TEXT,
  file_name TEXT,
  task_title TEXT,
  task_status TEXT DEFAULT 'pending',
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.staff_messages ENABLE ROW LEVEL SECURITY;

-- Index for fast queries
CREATE INDEX idx_staff_messages_store ON public.staff_messages(store_id);
CREATE INDEX idx_staff_messages_participants ON public.staff_messages(sender_id, receiver_id);
CREATE INDEX idx_staff_messages_created ON public.staff_messages(created_at DESC);

-- Policy: Store owner can see all messages in their store
CREATE POLICY "Owner can view store messages"
  ON public.staff_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.stores
      WHERE stores.id = staff_messages.store_id
        AND stores.user_id = auth.uid()
    )
  );

-- Policy: Store owner can send messages in their store
CREATE POLICY "Owner can send store messages"
  ON public.staff_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.stores
      WHERE stores.id = staff_messages.store_id
        AND stores.user_id = auth.uid()
    )
  );

-- Policy: Staff can view messages where they are sender or receiver in their assigned store
CREATE POLICY "Staff can view own messages"
  ON public.staff_messages FOR SELECT
  USING (
    (sender_id = auth.uid() OR receiver_id = auth.uid())
    AND is_store_member(store_id)
  );

-- Policy: Staff can send messages in their assigned store
CREATE POLICY "Staff can send messages"
  ON public.staff_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND is_store_member(store_id)
  );

-- Policy: Owner can update messages (mark read etc)
CREATE POLICY "Owner can update store messages"
  ON public.staff_messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.stores
      WHERE stores.id = staff_messages.store_id
        AND stores.user_id = auth.uid()
    )
  );

-- Policy: Staff can update messages they received (mark read)
CREATE POLICY "Staff can update own messages"
  ON public.staff_messages FOR UPDATE
  USING (
    receiver_id = auth.uid()
    AND is_store_member(store_id)
  );

-- Policy: Owner can delete messages in their store
CREATE POLICY "Owner can delete store messages"
  ON public.staff_messages FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.stores
      WHERE stores.id = staff_messages.store_id
        AND stores.user_id = auth.uid()
    )
  );

-- Enable realtime for staff_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_messages;
