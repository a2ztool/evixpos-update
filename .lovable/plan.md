## Goal

Replace UUID-style order references shown to users with a readable, business-friendly **Order Code** in the format `NNNNNAAA` — 5 sequential digits + 3 uppercase letters (e.g. `10001ABC`). Keep `orders.id` (UUID) intact for all foreign keys to avoid breaking historical data.

## Database

1. **Add column** `orders.order_code text` (nullable initially).
2. **Add unique index** `unique (store_id, order_code)` — guarantees no collisions inside a store; different stores can reuse the same code safely (store-isolated).
3. **Generation function** `public.generate_order_code(_store_id uuid)` — `SECURITY DEFINER`:
   - Numeric part: `max(numeric prefix) + 1` per store, starting at `10001`.
   - Letter suffix: 3 random uppercase A–Z letters.
   - Retry loop (max 10) on rare collision.
4. **Trigger** `set_order_code` BEFORE INSERT on `orders`: if `order_code` is null and `store_id` is not null, assign one. Keeps existing `assign_order_number` trigger intact.
5. **Backfill** every historical order with a deterministic code based on its current `order_number` (or a fresh sequential value when `order_number` is null), so old invoices/reports keep working and become searchable by code.

Existing `orders.id` (UUID) and all FK relationships (`order_items`, `transactions`, `refunds`, `subscriptions`, `due_payments`, etc.) are **unchanged** — only the display/search identifier changes.

## Frontend

1. **Helper** `src/lib/orderCode.ts` → `getOrderCode(order)` returns `order.order_code || order.order_number || short-id-fallback`. Single source of truth used everywhere.
2. **Display update** wherever an order is shown to users: Orders, POS recent transactions, Customer order history, Subscriptions, Due Book, Account Book, Refunds, Invoices (Public + Modal + Thermal receipt), Reports, Dashboard activity, Notifications. The code is shown in full (never truncated with `...`) and clickable to copy.
3. **Copy-to-clipboard** icon next to the Order Code in tables/details.
4. **Search**: order search inputs on Orders, Customers, Due Book, Account Book, Refunds, Subscriptions match against `order_code` (case-insensitive) in addition to the existing fields, scoped by `store_id` (already enforced by RLS).
5. **Exports** (CSV/PDF/Invoice): include `Order Code` column / field.

## Edge Functions / Webhooks

- WooCommerce sync, public invoice RPC, renewal reminders, WhatsApp send — switch their display payloads to use `order_code` (still look up by `id` internally).

## Migration Safety

- Old orders keep their UUID `id` and `order_number`; they additionally get a backfilled `order_code`. Nothing about FKs, RLS, or store isolation changes.
- The unique index is `(store_id, order_code)` so each store has its own sequence and codes never leak across tenants.

## Rollout Order

1. Migration (column + index + function + trigger + backfill).
2. Wait for Supabase types regeneration.
3. Add `getOrderCode` helper.
4. Update display + search + export sites in batches.
5. Update edge functions that surface order identifiers.

Approve to proceed with the migration first.