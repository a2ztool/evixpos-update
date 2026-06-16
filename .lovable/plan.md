## Unassigned Account Card — Remove from Income & Expense Page

### Goal
Hide the "Unassigned" account card from the Account Balances section on the Income & Expense page.

### Background
The Unassigned card (currently showing 46 txns / ৳43,575) displays a catch-all bucket for legacy transactions whose `account_id` is `NULL`. The user wants it removed from the UI entirely.

### Change
- **File:** `src/pages/IncomeExpense.tsx`
- Remove the conditional rendering block for `accountBalances["__unassigned__"]` (lines ~838–854 in the current file). This is a pure UI removal — no data or logic changes.

### Impact
- The unassigned balance is no longer visible on the Income & Expense page.
- The underlying `__unassigned__` aggregation logic in `accountBalances` useMemo can remain since it does not affect the page when not rendered; it can optionally be cleaned up later for tidiness.
- No database or API changes required.