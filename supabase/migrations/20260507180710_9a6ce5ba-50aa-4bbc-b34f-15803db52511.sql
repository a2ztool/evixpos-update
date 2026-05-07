
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users read realtime messages" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated users write realtime messages" ON realtime.messages;

CREATE POLICY "Authenticated users read realtime messages"
  ON realtime.messages FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users write realtime messages"
  ON realtime.messages FOR INSERT TO authenticated
  WITH CHECK (true);
