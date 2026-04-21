
## Product image upload RLS fix — Manual SQL (Option B)

আপনি manual route choose করেছেন। নিচের SQL Supabase Dashboard → SQL Editor → **New query** তে paste করে **Run** করুন। এটা idempotent (একাধিকবার চালানো safe) এবং আপনার project-এর actual helper signature `public.is_store_member(_store_id uuid)` use করে।

### Steps

1. খুলুন: https://supabase.com/dashboard/project/vuuesqrdjuqnduhiihwz/sql/new
2. নিচের পুরো SQL paste করুন
3. **Run** চাপুন → "Success. No rows returned" দেখলে সফল
4. Dashboard → Products → Add Product → image upload test করুন

### SQL to run

```sql
-- 1. Create or update product-images bucket (public, 5MB, image-only)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  5242880,
  ARRAY['image/png','image/jpeg','image/webp','image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Drop existing policies (safe re-run)
DROP POLICY IF EXISTS "Public read product images" ON storage.objects;
DROP POLICY IF EXISTS "Store members can upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Store members can update product images" ON storage.objects;
DROP POLICY IF EXISTS "Store members can delete product images" ON storage.objects;

-- 3. Public SELECT — সবাই product image দেখতে পারবে
CREATE POLICY "Public read product images"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

-- 4. INSERT — শুধু store member তার নিজের store folder-এ upload করতে পারবে
CREATE POLICY "Store members can upload product images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND public.is_store_member(((storage.foldername(name))[1])::uuid)
);

-- 5. UPDATE
CREATE POLICY "Store members can update product images"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'product-images'
  AND public.is_store_member(((storage.foldername(name))[1])::uuid)
);

-- 6. DELETE
CREATE POLICY "Store members can delete product images"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'product-images'
  AND public.is_store_member(((storage.foldername(name))[1])::uuid)
);
```

### Verification checklist

- ✅ "Success. No rows returned" message
- ✅ Storage → Buckets-এ `product-images` bucket দেখা যাচ্ছে
- ✅ Pro/Business plan-এ Products → Add Product → image upload কাজ করছে, RLS error নেই
- ✅ Image preview render হচ্ছে public URL সহ
- ✅ Free plan-এ আগের মতোই URL-only behavior

### যদি error আসে

Error-এর screenshot পাঠাবেন। Common cases:
- `function is_store_member does not exist` → helper migration আগে run হয়নি
- `policy already exists` → SQL re-run করুন (DROP statements handle করে দেবে)

### Frontend-এ কোনো change লাগবে না

`src/components/ProductImageField.tsx` already correct path pattern `{storeId}/{uuid}.{ext}` use করছে, যা policy-র সাথে সরাসরি match করে। Migration apply হওয়া মাত্রই upload কাজ করবে।
