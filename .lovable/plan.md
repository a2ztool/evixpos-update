

## Diagnosis

Looking at the actual code:

**`src/index.css` problems:**
1. Heavy `!important` overrides on `html`, `body`, `#root`, `.h-screen`, `.min-h-svh`, sidebar wrappers — fragile and hard to reason about.
2. Two stacked `@media (max-width: 767px)` and `@media (max-width: 736px)` blocks with overlapping rules.
3. `overscroll-behavior-y: contain` on `body` (not the real blocker but noisy).
4. Duplicate scrollbar-hiding rules.

**`src/components/DashboardLayout.tsx`:**
- Root: `<div className="flex min-h-[100dvh] w-full bg-background">` — fine, uses `min-h` (grows), not `h-screen` (locks).
- `<main className="flex-1 ... pb-24 sm:pb-4">` — already has `pb-24` for the bottom nav (~96px). Good.
- `MobileNav` is `fixed bottom-0 ... z-50` rendered as a sibling to the sidebar wrapper (outside the flex column). Correct — it stays pinned to viewport.

**Why scrolling broke previously:** The `!important` overrides forced `overflow: visible` on `html` AND `body` simultaneously, and at one point both were given `overflow-y: scroll`, creating a double-scroll-context conflict on iOS Safari. The fix is to designate **body** as the single scroll container and let everything else be `auto`/inherit naturally — no `!important` needed.

## Plan

### 1. Rewrite mobile section in `src/index.css` (clean, minimal, no `!important` except where neutralizing third-party utility classes)

Replace the two overlapping mobile blocks with a single, well-commented block:

```css
/* Mobile: single body-scroll model (≤767px) */
@media (max-width: 767px) {
  html, body, #root {
    height: auto;
    min-height: 100dvh;
    overflow-x: hidden;
  }
  body {
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: none; /* remove `contain` — was creating scroll boundary */
  }

  /* Neutralize Tailwind viewport-locked utilities so nested shells don't
     trap the scroll. Only !important here because Tailwind utilities are. */
  .h-screen, .min-h-screen, .h-svh, .min-h-svh {
    height: auto !important;
    min-height: 100dvh !important;
  }

  /* Sidebar shell + main must not create their own scroll container */
  .group\/sidebar-wrapper,
  [data-sidebar="content"],
  main.flex-1 {
    overflow: visible;
    max-height: none;
  }

  /* Hide native scrollbar (already global, repeated for safety) */
  body::-webkit-scrollbar { display: none; }
  body { scrollbar-width: none; }
}
```

Remove the duplicated `@media (max-width: 736px)` block entirely.

### 2. `src/components/DashboardLayout.tsx` — verify spacing only

The layout is already correct:
- Root flex container uses `min-h-[100dvh]` (grows, doesn't lock).
- `<main>` has `pb-24 sm:pb-4` to clear the ~88px bottom nav.
- `MobileNav` is `fixed bottom-0` with safe-area padding.

No code change needed. Will verify the `pb-24` is sufficient (96px ≥ nav height 72px + safe-area).

### 3. Keep desktop untouched

Desktop scroll progress bar (`ScrollProgress.tsx`) stays. Desktop uses normal document scroll with `body` as container — already working.

## What was wrong & why

| Problem | Cause | Fix |
|--------|-------|-----|
| Mobile scroll froze | `overflow: visible !important` on `body` + `overflow-y: scroll !important` on `html` created competing scroll contexts on iOS | Single rule: `body { overflow-y: auto }`, `html { overflow-x: hidden }` |
| Bottom nav drifted up | When earlier fixes set `position: fixed !important` globally or removed `min-h-[100dvh]` from root, the nav's containing block became something other than the viewport | Leave nav untouched (`fixed bottom-0` + safe-area), keep root as `min-h-[100dvh]` flex |
| Content under nav | `<main>` needs bottom padding ≥ nav height + safe-area | Already present: `pb-24` on mobile |
| Overscroll bounce trap | `overscroll-behavior-y: contain` on body | Change to `none` |

## Files

- `src/index.css` — replace the two mobile media blocks with one clean block
- `src/App.tsx` — no change
- `src/components/DashboardLayout.tsx` — no change

