# Landing page — isolated preview install

This drops the new marketing landing into your existing scanner repo as an **isolated route at `/landing-preview`**. It does not touch your scanner, API routes, library code, or `globals.css`.

## What you'll have when this is done

- `http://localhost:3000/` → your existing scanner (unchanged)
- `http://localhost:3000/landing-preview` → the new landing page
- All marketing styles live inside `app/landing-preview/marketing.css` and are scoped under `.marketing-root` so they cannot leak

## Files to add

Drop the entire `app/landing-preview/` folder (from this download) into your repo at:

```
seo-scanner/app/landing-preview/
├── page.tsx
├── marketing.css
└── _components/
    ├── LandingOracle.tsx
    ├── LandingDissection.tsx
    ├── MarketingChrome.tsx
    └── LandingPreviewClient.tsx
```

That's it. Six files in one new folder.

## What NOT to do

- ❌ Do not modify `app/page.tsx`
- ❌ Do not modify `app/layout.tsx`
- ❌ Do not modify `app/globals.css`
- ❌ Do not touch `lib/`, `app/api/`, `tailwind.config.ts`, `next.config.mjs`, or `package.json`
- ❌ Do not move or rename any existing files
- ❌ Do not add any dependencies

The marketing CSS is imported by `app/landing-preview/page.tsx` directly. It only mounts on the `/landing-preview` route. No global side-effects.

## Run it

```bash
npm run dev
```

Then visit `http://localhost:3000/landing-preview`. Your scanner at `/` is untouched.

## URL submit behavior in preview mode

When the user submits the URL on the hero, an alert fires showing where it WOULD navigate (`/?url=…`). This keeps you on the preview page during testing. To go live, see "Going live" below.

## Going live (later, when you're happy with the preview)

When you're ready to swap the landing in front of the scanner:

1. **Add URL-param auto-fire to your existing `app/page.tsx`** — at the top of the `Home` component, after all `useState` calls, paste:
   ```tsx
   useEffect(() => {
     if (typeof window === "undefined") return;
     const params = new URLSearchParams(window.location.search);
     const u = params.get("url");
     if (u) {
       setTimeout(() => handleScan(u), 50);
       window.history.replaceState({}, "", "/");
     }
     // eslint-disable-next-line react-hooks/exhaustive-deps
   }, []);
   ```
   Make sure `useEffect` is in your React import.

2. **Decide the routing strategy.** Two options:

   **Option A (recommended) — landing at `/`, scanner at `/scan`:**
   ```bash
   mkdir -p app/scan
   git mv app/page.tsx app/scan/page.tsx
   git mv app/landing-preview/page.tsx app/page.tsx
   git mv app/landing-preview/marketing.css app/marketing.css
   git mv app/landing-preview/_components app/_components
   # Then update imports in the moved page.tsx — change
   #   "./_components/..." stays the same (still relative)
   #   "./marketing.css" stays the same
   # And update LandingPreviewClient.tsx handleScan to:
   #   window.location.href = `/scan?url=${encodeURIComponent(url)}`;
   ```

   **Option B — keep both, just enable the real navigation:**
   - Edit `app/landing-preview/_components/LandingPreviewClient.tsx`
   - Replace the `alert(...)` in `handleScan` with:
     ```ts
     window.location.href = `/?url=${encodeURIComponent(url)}`;
     ```
   - Now `/landing-preview` funnels submissions to `/` (your scanner) which auto-fires.

## File sizes / what each does

| File | Purpose |
|---|---|
| `page.tsx` | Server component shell. Imports the marketing CSS, composes the page from sections. |
| `marketing.css` | All landing styles. Scoped under `.marketing-root`. ~14kb. |
| `_components/LandingOracle.tsx` | Hero with constellation animation + URL input form. |
| `_components/LandingDissection.tsx` | Scroll-triggered scan animation with wireframe + annotations. |
| `_components/MarketingChrome.tsx` | Nav, feature strip, CTA block, footer. |
| `_components/LandingPreviewClient.tsx` | Tiny client component that wires up the scan handler — the only place to edit when going live. |
