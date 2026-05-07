
UPDATE storage.buckets SET public = false WHERE id = 'staff-chat';

DROP POLICY IF EXISTS "Anyone can view staff chat files" ON storage.objects;

CREATE POLICY "Store members view staff chat files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'staff-chat'
    AND is_store_member(((storage.foldername(name))[1])::uuid)
  );
