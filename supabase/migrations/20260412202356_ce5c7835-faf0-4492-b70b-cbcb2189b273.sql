
-- Create storage bucket for staff chat files
INSERT INTO storage.buckets (id, name, public)
VALUES ('staff-chat', 'staff-chat', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to staff-chat bucket
CREATE POLICY "Authenticated users can upload staff chat files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'staff-chat');

-- Allow public read access
CREATE POLICY "Anyone can view staff chat files"
ON storage.objects FOR SELECT
USING (bucket_id = 'staff-chat');

-- Allow authenticated users to delete own uploads
CREATE POLICY "Authenticated users can delete staff chat files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'staff-chat');
