
## Product Image Upload — RLS Problem Fix

আপনার Supabase backend-এ `product-images` storage bucket এবং তার RLS policies set up নেই, এই কারণে upload-এর সময় "row-level security policy" error আসছে।

### সমাধান (আমি migration লিখে দেব)

একটি SQL migration তৈরি করব যা automatically নিচের কাজগুলো করবে:

**১. Storage bucket তৈরি**
- Bucket name: `product-images`
- Public read access (যাতে product image সবাই দেখতে পারে)
- File size limit: 5MB
- Allowed types: PNG, JPEG, WEBP, GIF

**২. RLS policies setup (storage.objects-এ)**

| Policy | Who | What |
|--------|-----|------|
| Public SELECT | সবাই | Image দেখতে পারবে |
| Authenticated INSERT | Store owner / staff member | শুধু নিজের store-এর folder-এ upload করতে পারবে |
| Authenticated UPDATE | Store owner / staff member | শুধু নিজের store-এর image edit করতে পারবে |
| Authenticated DELETE | Store owner / staff member | শুধু নিজের store-এর image delete করতে পারবে |

File path pattern: `{store_id}/{uuid}.{ext}` — এই path-এর প্রথম folder থেকে `store_id` extract করে `public.is_store_member(store_id, auth.uid())` helper দিয়ে check করা হবে। ফলে এক store-এর user অন্য store-এর image-এ touch করতে পারবে না।

### আপনাকে যা করতে হবে

আপনি Supabase use করছেন (Lovable Cloud না), তাই migration apply করার দু'টো অপশন:

**Option A — সবচেয়ে সহজ (recommended):**
আমাকে শুধু "OK" বলুন। আমি migration file তৈরি করে দেব, এটি automatically আপনার linked Supabase project (`vuuesqrdjuqnduhiihwz` — Pos Panel [ezyfy])-এ apply হয়ে যাবে। আপনাকে dashboard-এ গিয়ে কিছু করতে হবে না।

**Option B — Manual:**
যদি নিজে চালাতে চান, আমি SQL দেব, আপনি Supabase Dashboard → SQL Editor-এ paste করে Run করবেন।

### Verification

Migration apply হওয়ার পর:
1. Dashboard → Products → Add Product → Image upload করে দেখবেন
2. Pro/Business plan থাকতে হবে (Free plan-এ শুধু URL allow)
3. সফল হলে preview সাথে সাথে দেখাবে, error আর আসবে না

কোন option choose করছেন জানান (অথবা শুধু "OK" / "করো" বলুন — আমি Option A ধরে এগোবো)।
