## Goal
Apply consistent pagination across every list/table in the EvixPOS dashboard. Default 10 per page with a user-selectable size (10/25/50/100). Hybrid strategy: server-side `.range()` queries on heavy modules, shared client-side hook on the rest. Preserve page/filters/scroll across edits, renews, WhatsApp reminders, etc.

## Shared infrastructure (built once, reused everywhere)
1. `src/hooks/usePagination.ts` — pure client-side hook
   - State: `page`, `pageSize`
   - Inputs: `total`, `storageKey` (per-store, per-page)
   - Persists `{page, pageSize}` in `sessionStorage`
   - Returns helpers: `setPage`, `setPageSize`, `pageStart`, `pageEnd`, `totalPages`, `safePage`
   - Auto-resets page to 1 only when filter signature changes (not on remount, not when external-action flag is active — reuses existing `pageState.ts`).

2. `src/hooks/useServerPagination.ts` — for Supabase `.range()` flows
   - Same surface as `usePagination` plus a `range` tuple `[from, to]` consumers pass to the query.
   - Caller is responsible for setting `total` from `count: 'exact'` head response.

3. `src/components/ui/data-pagination.tsx` — single `<DataPagination />`
   - Props: `page`, `pageSize`, `total`, `onPageChange`, `onPageSizeChange`, `loading?`
   - Renders Previous / numbered pages (with ellipses) / Next, a "Showing X–Y of Z" caption, and a page-size `<Select>` (10/25/50/100).
   - Mobile: collapses to "Prev · Page N of T · Next" + size selector.
   - Uses existing shadcn `Pagination` primitives for styling consistency.

## Rollout — Hybrid

### Server-side `.range()` (heavy / high-volume)
Rewrite the Supabase fetch to two calls when filters/search/sort change:
- `select('*', { count: 'exact', head: true })` → total
- `select('...').range(from, to).order(...)` → page rows
Realtime channels invalidate and refetch the current page silently.

- `Orders.tsx` — already client-paginated; convert to server-side.
- `Customers.tsx`
- `Transactions.tsx`
- `Subscriptions.tsx` — already client-paginated; convert.
- `DueBook.tsx` — already client-paginated; convert.
- `Products.tsx`
- `Inventory.tsx`
- `DueCustomers.tsx`

### Client-side hook (lower volume / heavily filtered in memory)
Keep current fetch, just slice with `usePagination` + render `<DataPagination />`.

- `Suppliers.tsx`
- `Purchases.tsx`
- `OnlineSuppliersPurchases.tsx`
- `Coupons.tsx`
- `StockAlerts.tsx`
- `LoyaltyPoints.tsx`
- `CustomerCredits.tsx`
- `AccountBook.tsx`
- `IncomeExpense.tsx`
- `PendingOrders.tsx`
- `OrderForms.tsx`
- `AdCosts.tsx`
- `Referral.tsx` (withdrawals/refs tables)
- `NotificationsPage.tsx` / `NotificationCenter.tsx`
- `Reports.tsx` (per-table sections)

### Skipped (intentionally)
- `Dashboard.tsx`, `POS.tsx`, `CashRegister.tsx` — not tabular list pages.
- `SalesProfit.tsx`, `DailySalesReport.tsx`, `StaffPerformance.tsx`, `OfflineProfitLoss.tsx` — aggregated/charted reports; paginating breaks totals. Will only paginate sub-tables that show raw rows.
- Settings, Onboarding, Auth, Landing, Public pages.

## State preservation
- `storageKey` pattern: `pg:<page-id>:<store-id>` for page number, `pg-size:<page-id>` for size (size shared across stores).
- Hook skips reset-to-page-1 when `isExternalActionActive()` is true (existing helper) — covers WhatsApp/edit/renew round-trips.
- Filter-change reset uses a stable signature string (`JSON.stringify({search, status, ...})`) compared against a ref so initial mount/hydration doesn't reset.
- Realtime callbacks refetch the **same** page silently (no `setLoading`), consistent with the existing pattern in `Subscriptions.tsx`.

## Page-size selector behaviour
- Default 10. Options 10/25/50/100.
- Changing size resets to page 1 and persists choice.
- Caption: "Showing 11–25 of 312 · Page 2 of 13".

## Out of scope for this pass
- Admin-panel tables (you selected user dashboard only).
- Server-side sorting changes — sort UI stays as-is, just passed into `.order()` on server-paginated pages.
- Export buttons keep exporting the full filtered dataset (separate query), not just the current page.

## Delivery order
1. Build shared hook + component (no UI change yet).
2. Convert Orders, Customers, Subscriptions, DueBook, Transactions, Products to server-side.
3. Wire client-side hook + `<DataPagination />` into all remaining pages from the list above.
4. Smoke-check: filter → page persists, WhatsApp round-trip → page restored, realtime insert → current page refreshes without jump.

Reply "go" to execute, or tell me anything to adjust (page-size options, modules to drop/add, etc.).
