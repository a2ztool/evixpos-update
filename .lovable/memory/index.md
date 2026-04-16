# Project Memory

## Core
EvixPOS SaaS — Online + Offline store management. Supabase backend, store-wise RLS isolation.
All queries must filter by store_id. Staff uses owner's user_id for inserts.
Landing page structure/animations preserved. Content via admin panel.
Pricing/limits controlled from admin via plans_config table, not hardcoded.

## Memories
- [POS Smart Store Mode](mem://features/pos/smart-store-mode) — Online: barcode hidden, WC categories. Offline: barcode, manual cats, hold/resume, split pay, shortcuts.
- [Subscription Volume Pricing](mem://features/subscription-volume-pricing) — Volume-based INR pricing (500→100K), centralized in planConfig.ts, Supabase subscriptions table.
- [Admin Plans Config System](mem://features/admin-plans-config) — plans_config table, PlansConfigContext, admin panel pricing/limits control, realtime sync everywhere.
