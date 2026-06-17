# Inventory Module — Advanced Features & UI Polish

## 1. UI spacing fixes (Inventory.tsx)
- Tighten outer page padding/margin (`space-y` rhythm, consistent `p-4 md:p-6`).
- Suppliers card: remove forced min-height — collapse empty bottom space.
- Fix selected-supplier highlight border being clipped (add ring offset / overflow-visible).
- Align KPI strip, search row, and section cards to same horizontal padding.
- Mobile-first compact gaps.

## 2. New DB tables (single migration)
**`stock_movements`** — every in/out/adjustment entry  
fields: store_id, user_id, product_id, product_name, type (`in`/`out`/`adjust`/`return`), quantity, unit_cost, reference_type (`purchase`/`return`/`manual`/`sale`), reference_id, notes  
RLS: store-isolated, owner + staff of same store.

**`purchase_returns`** — returns to suppliers  
fields: store_id, user_id, supplier_id, purchase_id (nullable), total_amount, refund_amount, payment_method, notes, items (jsonb: name, qty, unit_cost)  
RLS: store-isolated.

Both with `GRANT` for `authenticated` + `service_role`, RLS policies, `updated_at` trigger.

## 3. Features

### A. Stock Movement Tracking
- Auto-log a `stock_movements` row on every purchase create (type `in`).
- New "Stock Movements" tab inside Inventory page — table with date, product, type badge, qty, value, reference.
- Filter by product + type + date range; CSV export.

### B. Purchase Return / Refund to Supplier
- "Return" action on each purchase row → dialog (pick items + qty + refund amount + method).
- On submit: insert `purchase_returns` row, log `stock_movements` (type `out`), reduce supplier balance, decrement product stock.
- Show return badge in purchase history.

### C. Bulk Import (CSV)
- New "Import" split button (Suppliers CSV / Purchases CSV).
- Client-side CSV parse, preview table, validate, batch insert.
- Templates downloadable. Schema:
  - Suppliers: `name, phone, email, address, notes`
  - Purchases: `supplier_name, date, total_amount, paid_amount, payment_method, product_name, quantity, unit_cost, notes`

### D. Low / Out-of-stock Reorder Suggestions
- New "Reorder Suggestions" collapsible panel above Top Suppliers.
- Algorithm: for each low/out product, compute 30-day sales velocity from `order_items`, suggest `qty = max(min_stock*2, ceil(velocity*14)) - current_stock`.
- Show product, current stock, suggested qty, last supplier (from most recent purchase), one-click "Create Purchase" prefilling dialog.

## 4. Files touched
- New: `supabase/migrations/<timestamp>_inventory_advanced.sql`
- Edited: `src/pages/Inventory.tsx` (UI + tabs + dialogs + logic)
- New small components inside Inventory page (kept colocated to avoid sprawl).

## 5. Notes
- All queries store-scoped (`store_id`), staff uses owner `user_id` per project core rule.
- No business logic changes to existing suppliers/purchases data.
- Reorder suggestions are read-only computed — no new persisted table needed.
