
The user wants two scroll UX improvements applied globally:

**Mobile (≤767px):** already mostly done in `src/index.css` (scrollbar-width: none + ::-webkit-scrollbar display:none on body). Need to extend to all scroll containers and html.

**Desktop (≥768px):**
1. Hide native vertical scrollbar (html/body) — keep scroll functional
2. Add a fixed top progress bar (2px) that fills based on `window.scrollY / (scrollHeight - clientHeight)` using `--primary` (brand teal)
3. Must work on every page including admin/staff routes

Best approach: a small global React component `ScrollProgress` mounted once in `App.tsx` (so it covers user, admin, staff dashboards — all share the same root). It listens to `scroll` on window with rAF throttling and sets a width on a fixed `div`. Hidden on mobile via Tailwind `hidden md:block`.

CSS changes in `src/index.css`:
- Add `scroll-behavior: smooth` to html (already present)
- Hide scrollbar globally (mobile + desktop) via `scrollbar-width: none` and `::-webkit-scrollbar { display:none }` on `html, body`
- Keep existing mobile overflow logic intact

## Plan

### 1. Create `src/components/ScrollProgress.tsx`
- Fixed `div` at top: `fixed top-0 left-0 h-[2px] bg-primary z-[100] transition-[width] duration-75 ease-out hidden md:block`
- `useEffect` adds scroll listener on window, computes `scrollTop / (scrollHeight - clientHeight) * 100`, updates width via ref + rAF throttle
- Listens on both `window` scroll and the actual scroll container (sidebar wrapper on desktop) — will detect by checking which one scrolls

### 2. Mount globally in `src/App.tsx`
- Add `<ScrollProgress />` once inside the app root so it appears on all routes (landing, dashboard, admin, staff).

### 3. Update `src/index.css`
- Hide native scrollbars on `html, body` (both mobile + desktop):
  ```css
  html, body { scrollbar-width: none; }
  html::-webkit-scrollbar, body::-webkit-scrollbar { display: none; width: 0; height: 0; }
  ```
- Ensure `html { scroll-behavior: smooth; }` (already present)
- Keep existing mobile rules unchanged (they already work per last screenshot)

### 4. Edge cases
- On desktop, the dashboard layout uses sidebar wrapper which may scroll internally. The ScrollProgress hook will check `document.documentElement.scrollHeight > clientHeight`; if not, fall back to listening on `main` or `[data-sidebar="content"]`. Implementation: listen on `window` AND on the closest scrolling ancestor detected at mount.
- z-index `100` keeps it above sticky headers but below modals (which use z-50+ overlays — acceptable, progress bar at very top edge).
- No layout shift: bar is `position: fixed`, doesn't take flow space.

### Files to change
- `src/components/ScrollProgress.tsx` (new)
- `src/App.tsx` (mount component)
- `src/index.css` (hide native scrollbars desktop, keep smooth scroll)

Result: mobile = clean app feel, desktop = thin teal progress bar at top instead of side scrollbar, works on every page.
