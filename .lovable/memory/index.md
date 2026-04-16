# Project Memory

## Core
EvixPOS SaaS — Online + Offline store management. Supabase backend, store-wise RLS isolation.
All queries must filter by store_id. Staff uses owner's user_id for inserts.
Landing page structure/animations preserved. Content via admin panel.
Plan pricing: INR volume-based (planConfig.ts). Plan state from Supabase only, init as null.

## Memories
- [POS Smart Store Mode](mem://features/pos/smart-store-mode) — Online: barcode hidden, WC categories. Offline: barcode, manual cats, hold/resume, split pay, shortcuts.
- [Subscription Volume Pricing](mem://features/subscription-volume-pricing) — INR volume steps 500-100K, Pro/Business pricing, DB schema with volume/billing_type/price columns.
