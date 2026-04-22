

# Plan: Comprehensive Input Validation (Phased)

## Goal
সব ফর্মে **proper inline field-level validation** যোগ করা — শুধু toast-এ এক লাইনের error নয়, প্রতিটি input-এর নিচে red helper text + red border show হবে। এর সাথে real-time validation (typing-এর সময় error clear হবে) এবং submit-এর আগে full validation।

বর্তমান অবস্থা: `validations.ts` (Zod schemas), `useFormValidation` hook, এবং `<FormField>` UI primitive আগে থেকেই আছে — কিন্তু বেশিরভাগ পেজ শুধু `validateWithToast` ব্যবহার করে toast দেখায়, inline error দেখায় না।

---

## Phase 1 — Auth Module (highest priority)

**Pages:** `Auth.tsx` (Login + Signup tabs), `ResetPassword.tsx`, `admin/AdminLogin.tsx`, `admin/AdminSettings.tsx`.

**Changes:**
- `useFormValidation(loginSchema)` / `signupSchema` / `resetPasswordSchema` use করে field-level errors track করা।
- প্রতিটি `<Input>`-এর নিচে error message + `aria-invalid` + red border (`border-destructive`)।
- Real-time clear: `onChange` হলে সেই field-এর error remove।
- Email format, password strength (≥6), name (no URLs/numeric-only), referral code (max 8 alphanumeric) — সব already schema-তে আছে, inline দেখানো হবে।
- Terms checkbox-এর জন্য আলাদা inline error (toast নয়)।
- Server errors (e.g. "email already registered") schema error structure-এ map করে field-এর নিচে দেখানো হবে।

## Phase 2 — User Dashboard Pages

**Targeted forms (input-heavy):**
- `Products.tsx` — name, SKU, price, cost, stock, image URL, description
- `Customers.tsx` — name, phone, email, address
- `Suppliers.tsx` — name, phone, email
- `Coupons.tsx` — code, value, min order, max uses
- `Purchases.tsx` / `OnlineSuppliersPurchases.tsx` — supplier, amount, payment
- `IncomeExpense.tsx` + `DueBook.tsx` — type, amount, category, note
- `Onboarding.tsx` — store name, full name
- `SettingsPage.tsx` — General/Business tab inputs (store name, phone, email, address)
- `Integrations.tsx` (WhatsApp / WooCommerce keys)
- `SupportPage.tsx` — subject, description, category, priority
- `Subscriptions.tsx` — customer name, phone, product, price, dates
- `LoyaltyPoints.tsx`, `CustomerCredits.tsx`, `OrderForms.tsx`, `AdCosts.tsx` — amounts, names

**Pattern applied to each:**
1. Replace `validateWithToast` with `useFormValidation(schema)`।
2. প্রতিটি input wrap করা `<FormField label error={getError('field')}>`-এ অথবা inline `<p className="text-xs text-destructive">{getError('field')}</p>` যোগ করা।
3. `onChange`-এ `clearField('field')` call।
4. Submit হলে `validateAll(formData)` — false হলে first invalid field-এ scroll/focus।
5. Numeric inputs (price, stock) — negative reject + paste sanitize।
6. Phone fields — international format check (`phoneField`)।

**New schemas to add in `validations.ts` for forms currently lacking one:**
- `subscriptionSchema`, `loyaltyAdjustSchema`, `creditAdjustSchema`, `orderFormSchema`, `adCostSchema`, `businessSettingsSchema`, `storeSettingsSchema`।

## Phase 3 — Staff Dashboard / Admin-side Forms

**Pages:**
- `StaffInbox.tsx` / `FloatingInbox.tsx` — message text (max length), task assign form (subscription name required, term, link order)।
- POS pages (`POS.tsx`, `CashRegister.tsx`) — quantity, discount, customer info inline।
- `admin/AdminUsers.tsx`, `AdminStores.tsx`, `AdminCoupons.tsx`, `AdminBroadcasts.tsx`, `AdminPlansPricing.tsx`, `AdminFeatureFlags.tsx`, `AdminPaymentGateways.tsx`, `AdminLandingEditor.tsx`, `AdminTemplates.tsx`, `AdminMaintenance.tsx` — সব admin CRUD forms।
- Staff member create/edit form (name, email, phone, role)।

**Same inline validation pattern as Phase 2 + admin-specific schemas (`broadcastSchema`, `planEditSchema`, `gatewayConfigSchema`, ইত্যাদি) যোগ করা।

---

## Shared infrastructure tasks (Phase 1-এর শুরুতেই)

1. `<Input>` (`components/ui/input.tsx`) এ optional `error?: boolean` prop যোগ — true হলে `border-destructive focus:ring-destructive`। (যাতে repeat না করতে হয় প্রতি জায়গায়)।
2. `useFormValidation` hook-এ একটা helper `register(field)` যোগ করা যেটা return করে `{ 'aria-invalid', onBlur: validate-single-field }` — ergonomics-এর জন্য।
3. Common `validateField(schema, field, value)` utility — single-field on-blur validation-এর জন্য।

---

## Out of scope (for now)
- Server-side validation rules (already enforced by Supabase RLS / DB constraints)।
- Admin landing-page rich-text editor validation।
- File upload size/type validation (separate concern)।

---

## Execution order

```text
Phase 1: Auth (Auth.tsx, ResetPassword, AdminLogin, AdminSettings) + shared Input/hook upgrade
   ↓ ship & verify
Phase 2: User dashboard forms (batch by domain — products/customers/suppliers first, then finance, then settings/integrations)
   ↓ ship & verify
Phase 3: Staff inbox + POS + admin CRUD pages
```

প্রতি phase শেষে আমি stop করব যাতে আপনি verify করতে পারেন, তারপর next phase শুরু হবে।

