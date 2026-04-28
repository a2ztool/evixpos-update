
# ZiniPay BDT Payment Gateway — Full Production Build

ZiniPay redirect-based payment gateway-এর সম্পূর্ণ automation। ৬টি phase-এ বিভক্ত, প্রতিটি phase-এর শেষে testable state।

API key: `21fd2796c86d674450752276fd6bad23db207482858e20d6` — `ZINIPAY_API_KEY` secret হিসেবে save হবে (codebase-এ hardcode করা হবে না)।

---

## Phase 1 — Database Schema & Secret

**Migration (schema only):**
- `plans_config` table-এ `price_bdt numeric` column add (already-stored INR থেকে আলাদা, admin-controlled BDT price)
- `plan_payments` table-এ ৪টি column add:
  - `zinipay_invoice_id text`
  - `zinipay_val_id text` (unique index)
  - `zinipay_transaction_id text`
  - `zinipay_payment_method text` (bkash/nagad/etc)

**Secret:**
- `ZINIPAY_API_KEY` add (Supabase Edge Functions secret)

**Backfill:** existing INR price থেকে initial BDT price approximate (1 INR ≈ 1.45 BDT) — admin পরে adjust করতে পারবে।

---

## Phase 2 — Edge Function: zinipay-create-invoice

**File:** `supabase/functions/zinipay-create-invoice/index.ts` (verify_jwt = true)

Flow:
1. JWT validate করে user identify
2. Body থেকে `plan` (pro/business), `volume`, `billing_type`, `coupon_code` নেয়
3. **Server-side BDT price calculate** — `plans_config.price_bdt` থেকে; coupon থাকলে `coupons` table থেকে validate ও apply
4. Generate `val_id = "EVX-{user_id_short}-{timestamp}"` (unique reference)
5. Old pending payments (same user+plan) auto-expire
6. `POST https://api.zinipay.com/v1/payment/create` call:
   ```json
   {
     "cus_name": "<user name>",
     "cus_email": "<user email>",
     "amount": <final_bdt_amount>,
     "metadata": { "plan": "pro", "volume": 1000, "billing": "monthly", "user_id": "..." },
     "redirect_url": "https://evixpos.com/payment/zinipay/success?val_id=...",
     "cancel_url": "https://evixpos.com/payment/zinipay/cancel?val_id=...",
     "val_id": "EVX-...",
     "webhook_url": "https://<project>.supabase.co/functions/v1/zinipay-webhook"
   }
   ```
7. `plan_payments`-এ pending row insert (status=pending, gateway='zinipay', `zinipay_invoice_id`, `zinipay_val_id`, prices)
8. Return `{ payment_url, val_id }` to frontend

---

## Phase 3 — Edge Function: zinipay-webhook + zinipay-verify-payment

### `zinipay-webhook/index.ts` (verify_jwt = false)
ZiniPay public ভাবে call করবে। Signature না থাকায় security এর জন্য double-verify:

1. `invoice_id`, `val_id`, `status` extract করে (JSON body বা query param থেকে)
2. **Always re-verify** — `POST /v1/payment/verify { invoice_id }` API call করে authoritative status নেয়
3. ZiniPay response-এর status অনুযায়ী:
   - `COMPLETED` → `plan_payments` update (status=approved, transaction_id, payment_method) + subscription activate (existing pattern from razorpay-webhook follow)
   - `FAILED` → `plan_payments` update (status=rejected)
   - `PENDING` → ignore (wait)
4. Idempotent — already-approved row হলে skip

### `zinipay-verify-payment/index.ts` (verify_jwt = true)
User browser redirect হয়ে success page-এ আসলে call হবে — webhook fail করলেও safety net:

1. JWT validate, user `val_id` দেয়
2. `plan_payments` থেকে row fetch (user_id match check)
3. ZiniPay `/v1/payment/verify` call
4. COMPLETED হলে webhook এর মতই same approval logic run করে (idempotent)
5. Return current status to frontend

**`supabase/config.toml` update:**
- `[functions.zinipay-create-invoice] verify_jwt = true`
- `[functions.zinipay-webhook] verify_jwt = false`
- `[functions.zinipay-verify-payment] verify_jwt = true`

---

## Phase 4 — Frontend: BDT Payment Modal & Pages

### New component: `src/components/ZinipayUpgradeModal.tsx`
Existing `RazorpayUpgradeModal` এর design clone (same Plan Summary → Coupon → Pricing → CTA structure)। শুধু:
- "Pay with ZiniPay (bKash, Nagad, Card)" branding
- Click করলে `zinipay-create-invoice` call → response এর `payment_url`-এ `window.location.href` redirect
- `val_id` `localStorage`-এ save করে (success page check করার জন্য)

### `src/pages/MyPlan.tsx` update:
- BDT currency selected থাকলে → ZinipayUpgradeModal render
- INR → existing RazorpayUpgradeModal
- USD → existing PaymentModal (manual)

### New pages:
- `src/pages/payment/ZinipaySuccess.tsx` — `/payment/zinipay/success`
  - Mount-এ `zinipay-verify-payment` call
  - Status অনুযায়ী success/pending/failed UI
  - "Go to My Plan" button (auto-redirect 5s পর)
- `src/pages/payment/ZinipayCancel.tsx` — `/payment/zinipay/cancel`
  - Cancel message + retry button

### `src/App.tsx` routes add:
- `/payment/zinipay/success` (protected)
- `/payment/zinipay/cancel` (protected)

---

## Phase 5 — Admin Panel: BDT Pricing & Gateway Toggle

### `src/pages/admin/AdminPlansPricing.tsx`:
- প্রতিটি plan/volume row-এ `price_bdt` input field add (existing `price_inr` এর পাশে)
- Save button update করে BDT price persist করে

### `src/pages/admin/AdminPaymentGateways.tsx`:
- ZiniPay gateway entry seed (currency=BDT, gateway_type='zinipay', is_active default true)
- Admin enable/disable toggle support করবে
- Frontend modal এই flag check করে BDT অপশন দেখাবে/hide করবে

### `src/pages/admin/AdminPayments.tsx`:
- ZiniPay transactions filter view + transaction_id, payment_method column display

---

## Phase 6 — QA & Production Checklist

Implement-এর শেষে verify:
1. Sandbox API key দিয়ে end-to-end test (create → redirect → webhook → activate)
2. Webhook double-verify কাজ করছে (manually webhook fire করে দেখা)
3. Browser redirect path (success page) verify call করছে
4. Coupon discount BDT-তে সঠিক apply হচ্ছে
5. Old pending payments auto-expire হচ্ছে
6. Admin toggle BDT option hide/show করছে
7. ZiniPay dashboard-এ `evixpos.com` redirect domain register করার reminder user-কে দেওয়া হবে
8. Production-এ যাওয়ার আগে sandbox থেকে live API key swap করার instruction

---

## Technical Details

**Files to create (8):**
- `supabase/functions/zinipay-create-invoice/index.ts`
- `supabase/functions/zinipay-webhook/index.ts`
- `supabase/functions/zinipay-verify-payment/index.ts`
- `src/components/ZinipayUpgradeModal.tsx`
- `src/pages/payment/ZinipaySuccess.tsx`
- `src/pages/payment/ZinipayCancel.tsx`
- `src/lib/zinipayCheckout.ts` (helper for invoke + redirect)
- Migration file (schema)

**Files to modify (5):**
- `supabase/config.toml` — 3 new function entries
- `src/pages/MyPlan.tsx` — BDT branch → ZinipayUpgradeModal
- `src/App.tsx` — new routes
- `src/pages/admin/AdminPlansPricing.tsx` — BDT field
- `src/pages/admin/AdminPaymentGateways.tsx` — ZiniPay row
- `src/contexts/PlansConfigContext.tsx` — include `price_bdt` in select & types

**Security guarantees:**
- API key only in Supabase secret, never frontend
- Server-side price calculation (no client trust)
- Webhook always double-verifies via `/v1/payment/verify`
- Idempotent approval (safe if webhook + redirect both fire)
- `val_id` uniqueness prevents duplicate processing
- RLS preserved on `plan_payments`

**No external npm packages** — pure `fetch` to ZiniPay REST API।

---

## যা আপনার manually করতে হবে (একবার)

1. **ZiniPay dashboard → Brands** এ গিয়ে redirect domain `evixpos.com` (এবং preview domain) register করুন
2. **AdminPlansPricing** এ গিয়ে প্রতিটা plan-এর BDT price set করুন (default backfill হবে, কিন্তু আপনি adjust করতে পারবেন)
3. Sandbox test pass হলে **production API key** আমাকে দিন, secret update করব

---

Approve করলে Phase 1 থেকে শুরু করব, প্রতিটা phase-এর শেষে testable হবে।
