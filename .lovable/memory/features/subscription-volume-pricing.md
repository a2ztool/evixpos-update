---
name: Volume-based subscription pricing
description: Plan pricing uses INR volume steps (500-100K), centralized in planConfig.ts. Subscriptions table needs volume/billing_type/price columns.
type: feature
---

## Volume-Based Pricing System

Plans: Free, Pro, Business, Custom (contact sales)

### Volume Steps (discrete, no manual input)
500 → 1K → 5K → 10K → 20K → 50K → 100K

### INR Pricing
PRO: 349, 449, 549, 849, 1449, 3449, 6449
BUSINESS: 449, 549, 749, 949, 1849, 4449, 8449

### Plan Limits
- Free: 1 store, 25 products, 50 customers
- Pro: 3 stores, 100 products, volume-based customers
- Business: 10 stores, 500 products, volume-based customers

### Source of Truth
- `src/lib/planConfig.ts` — all constants, pricing, volume steps
- Plan MUST come from Supabase `subscriptions` table only
- No default "free" fallback in state (init as null)

### DB Schema (subscriptions table additions)
- `volume` (integer) — selected volume step
- `billing_type` (text) — monthly/yearly
- `price` (numeric) — INR price at subscription time

### Migration Required
```sql
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS volume integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS billing_type text DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS price numeric DEFAULT NULL;
```
