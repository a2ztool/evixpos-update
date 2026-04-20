
## Diagnosis

The mobile dashboard is still feeling “stuck” because the page has more than one thing competing for touch scroll:

1. `src/components/DashboardAnalytics.tsx` mounts Recharts charts directly on the dashboard. On phones, chart surfaces often capture vertical touch gestures, which makes the page feel like it won’t scroll.
2. `src/index.css` still has multiple mobile-wide overrides stacked together. The core body-scroll fix is there, but extra mobile polish rules are broad enough that they can still interfere with the intended single-scroll model.
3. The dashboard shell (`src/components/DashboardLayout.tsx` + `src/components/ui/sidebar.tsx`) is mostly corrected now, so the remaining issue is likely not the bottom nav itself but touch handling inside dashboard content.

## What to build

Apply a very targeted mobile-only fix so the dashboard page scrolls naturally on phones, while keeping:
- desktop/tablet behavior unchanged
- bottom nav fixed at the bottom
- existing layout and styling otherwise unchanged

## Implementation plan

### 1. Keep `body` as the only mobile page scroller
In `src/index.css`:
- keep the existing mobile rule where `body` uses `overflow-y: auto` and `-webkit-overflow-scrolling: touch`
- remove or tighten any extra mobile rules that broadly affect nested layout containers if they are not needed for scrolling
- add one small safety rule so the dashboard app shell does not create its own vertical scroll context on mobile

Goal:
- mobile document scroll happens on `body`
- nested wrappers stay `overflow: visible` on mobile unless they truly need inner scrolling

### 2. Stop charts from hijacking touch scroll on mobile
In `src/components/DashboardAnalytics.tsx`:
- wrap the two chart areas in a mobile-safe container
- on mobile, disable touch/pointer interaction on the Recharts surfaces so vertical swipe always scrolls the page
- keep chart rendering visible; only turn off gesture capture on small screens

This is the most likely fix for “scroll feels stuck on dashboard specifically,” because the dashboard is the main page with large interactive chart surfaces.

### 3. Preserve bottom nav exactly as-is
In `src/components/DashboardLayout.tsx`:
- keep `MobileNav` fixed
- keep mobile bottom padding on `<main>` (`pb-24` or equivalent safe value)
- only increase bottom spacing if needed to fully clear the nav on smaller phones with safe-area insets

No nav positioning changes unless absolutely necessary.

### 4. Verify shell components do not reintroduce a scroll trap
In `src/components/ui/sidebar.tsx`:
- keep desktop-only flex/height behavior under `md:...`
- ensure mobile sidebar wrapper/content stay non-scrolling unless the sheet itself is open
- do not change desktop sidebar behavior

### 5. Leave admin/staff untouched unless the same pattern exists there
This fix will target the dashboard path first. If the same “stuck” feeling exists on admin/staff pages after the dashboard fix, apply the same mobile touch-scroll rule only to their interactive chart/scroll-heavy areas.

## Files to change

- `src/index.css`
- `src/components/DashboardAnalytics.tsx`
- `src/components/DashboardLayout.tsx` (only if spacing needs a tiny mobile adjustment)
- `src/components/ui/sidebar.tsx` (only if a leftover mobile overflow rule needs tightening)

## Expected result

- On mobile phones, dashboard scroll works with normal finger swipe
- Charts no longer block vertical scrolling
- Bottom nav remains fixed at the bottom
- Content does not go under the bottom nav
- Desktop and tablet behavior remain unchanged

## Technical details

Recommended mobile-only chart rule:
- apply `pointer-events: none` / `touch-action: pan-y` to chart interaction layers on small screens only

Recommended scroll model:
```text
mobile:
html/body/#root -> grow naturally
body -> single vertical scroller
dashboard wrappers -> overflow visible
fixed bottom nav -> stays viewport-fixed
interactive charts -> do not intercept vertical swipe
```
