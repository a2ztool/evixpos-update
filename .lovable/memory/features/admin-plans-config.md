---
name: Admin-controlled dynamic plan system
description: plans_config টেবিল থেকে সব pricing/limits আসে, admin panel থেকে এডিট হয়, realtime sync সব জায়গায়
type: feature
---

## Dynamic Plans Config System

### Source of Truth
- `plans_config` Supabase table — all pricing, limits per plan×volume
- `plan_history` table — audit trail for all plan changes

### Context/Hook
- `PlansConfigContext` (`src/contexts/PlansConfigContext.tsx`) — fetches plans_config with realtime
- `usePlansConfig()` hook — provides `getPriceINR()` and `getPlanLimits()` dynamically
- Falls back to hardcoded `planConfig.ts` if table not available

### Consumers (use usePlansConfig)
- LandingPage.tsx
- MyPlan.tsx
- Dashboard.tsx
- useSubscription.ts
- useUsageLimits.ts

### Admin Actions (via admin-data edge function)
- `update_plans_config` — bulk update pricing/limits
- `get_plan_stats` — plan distribution analytics
- `get_plan_history` — audit trail
- `admin_change_user_plan` — change user plan with history logging
- `admin_extend_plan` — extend user plan expiry

### Admin Page
- `/admin/plans-pricing` — edit all pricing, limits, view stats & history

### Migration SQL
- File at `/mnt/documents/plans_config_migration.sql` — must run in Supabase SQL Editor
