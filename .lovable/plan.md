

## Goal
Make real PWA install prompt work properly on mobile dashboard AND add an install button to the landing page.

## Root cause of current behavior
- `beforeinstallprompt` event only fires **once per session** in Chrome. If the user dismissed it once (or browser didn't fire it yet due to engagement heuristics), `deferredPrompt` stays `null` → fallback manual instructions show.
- iOS Safari & Firefox **never** fire `beforeinstallprompt` — manual instructions are the only option there (this is a browser limitation, not fixable in code).
- Landing page currently has no install entry point.

## Plan

### 1. Improve PWA installability signals (`public/manifest.json` + `index.html`)
- Add `id: "/"` to manifest (helps Chrome track install state reliably).
- Change `start_url` from `/app` to `/dashboard` (post-login landing).
- Add `screenshots` array with at least one `form_factor: "narrow"` entry — Chrome requires this for the **richer install UI** on Android and shows the prompt more aggressively. Use existing landing page screenshots.
- Verify `display: "standalone"` and icon `purpose: "any maskable"` (already correct).

### 2. Persist `deferredPrompt` properly (`src/hooks/usePWAInstall.ts`)
- Currently the event is captured fine, but if the user opens the dropdown AFTER the event fired and was garbage-collected, it's lost. Store the prompt in a **module-level singleton** so it survives component remounts across the app (sidebar → dashboard → landing all share the same prompt instance).
- Also re-check `isStandalone` on every focus event so "Installed" state updates instantly after install.

### 3. Smarter install button behavior (`src/components/InstallAppButton.tsx`)
- On Chrome/Edge/Android Chrome → trigger native prompt directly (current behavior works when prompt is available).
- When prompt is unavailable on a browser that DOES support PWA (Chrome but event didn't fire yet) → show a small toast: "Use your browser menu → Install app" instead of the big modal.
- Keep the detailed modal only for iOS Safari and Firefox (where native install is genuinely impossible).
- Hide the button entirely when already in standalone mode.

### 4. Add Install button to Landing Page (`src/pages/LandingPage.tsx`)
- Add `<InstallAppButton />` in the sticky navbar (desktop: between language switcher and "Start Free"; mobile: inside the mobile menu).
- Also add a dedicated **"Install App"** CTA card in the hero section or footer area so first-time visitors see the option without logging in.
- Reuse the existing `InstallAppButton` component — no new component needed.

### 5. Add visibility refresh
- In `usePWAInstall`, listen to `appinstalled` event globally and update `isInstalled` immediately so the button switches to "✓ Installed" without a page refresh.

## Files to edit
- `public/manifest.json` — add `id`, fix `start_url`, add screenshots field
- `index.html` — no change needed (already correct)
- `src/hooks/usePWAInstall.ts` — module-level prompt cache + appinstalled listener
- `src/components/InstallAppButton.tsx` — smarter fallback (toast vs modal)
- `src/pages/LandingPage.tsx` — add install button to navbar + mobile menu
- `src/components/DashboardLayout.tsx` — no change (already has it in profile dropdown)

## Important caveats (browser limitations — not bugs)
- **iOS Safari**: cannot auto-install via JS. Manual "Share → Add to Home Screen" is the ONLY way. Modal will still show for iOS users.
- **Firefox desktop**: doesn't support PWA install at all.
- **Preview/iframe**: install prompt is disabled by design (already handled in `pwaUpdate.ts`). Test on the **published URL** (`newevix.lovable.app`) in a real Chrome window.

## After implementation — how to test
1. Open `https://newevix.lovable.app` in **Chrome on Android** (or desktop Chrome) → "Install App" button should fire native browser install dialog directly.
2. After install → button shows "✓ Installed" and is disabled.
3. On iOS Safari → modal with "Add to Home Screen" instructions (browser limitation).

