# UI learnings (shadcn/ui `base-nova` on Base UI)

### Base UI composes with `render`, not `asChild` (2026-11-07)
- **Do:** `<DropdownMenuTrigger render={<Button … />} />`. For links styled as buttons, put `buttonVariants()` on
  `<Link>`. The rendered component must forward ref and spread props (React 19 function components do).

### `cn` comes from the `cn` package (2026-11-07)
- shadcn 4.x installs `cn` (by shadcn, replaces clsx + tailwind-merge) and adds `shadcn` as a dependency (for
  `shadcn/tailwind.css`). Not a supply-chain issue.

### `Label`/`FieldLabel` is a plain `<label>` (2026-11-07)
- **Do:** no `render` prop on it. For a heading of a radio/checkbox group use `FieldTitle` (a div) +
  `aria-labelledby` on the group.

### Use `Menu.LinkItem` for links in dropdowns (2026-11-07)
- **Do:** `DropdownMenuLinkItem` (added by us to `src/components/ui/dropdown-menu.tsx`) with
  `render={<Link href=… />}`. For actions like sign-out call the server action from `onClick` in a transition.

### Base UI checkbox/radio submit like native inputs (2026-11-07)
- They render hidden `<input>`s: `name` + `value` → `FormData` (`getAll` for checkbox groups, unchecked = absent).
- Their hidden input updates **after** the click handler → re-validate on the next frame (`requestAnimationFrame`).

### iOS Safari zooms into inputs with font-size < 16px (2026-11-07)
- shadcn `Input`/`Textarea` already use `text-base md:text-sm`; `NativeSelect` used `text-sm` → patched to
  `text-base md:text-sm` and `h-10 md:h-8` (bigger touch target).

### Outline button border is barely visible (2026-11-07)
- Fixed in the design system: outline buttons use `border-input` in both themes (`border-transparent` lives in the
  non-outline variants so `buttonVariants()` on `Link` works). Same for hand-made controls: a bare `border` uses
  `--border` (a divider colour, ~1.2:1) — give pills/toggles `border-input` (the admin status filters do).

### Accessible name must contain the visible label (2026-11-09)
- **Symptom:** locale switcher showed "TR" but its `aria-label` was "Dil" — voice-control users saying "TR" miss it
  (WCAG 2.5.3 Label in Name, Lighthouse `label-content-name-mismatch`).
- **Do:** when a control has visible text, an `aria-label` must include it: `LocaleSwitcher.current` = "Dil: {code}".
  Icon-only controls (theme switch) just need a label.

### CSS `uppercase` on a `tr` page dots English i's (2026-11-09)
- **Symptom:** brand rendered as "RİDE & VİBE" in mockups with `text-transform: uppercase`.
- **Cause:** case mapping follows the element's `lang`; Turkish maps `i → İ` (correct for Turkish words like
  "BİRLİKTE", wrong for English).
- **Do:** never CSS-uppercase English/brand words on Turkish pages: use the wordmark asset, write the capitals in the
  source, or set `lang="en"` on the element.
- **Source:** found by rendering mockups (headless Chrome).

### Theme: dark SSR default + inline `<head>` script, no cookies (2026-11-09)
- **Symptom:** a client-side theme switch flashes the wrong theme, or reading a theme cookie in the root layout makes
  every route dynamic (Cache Components).
- **Do:** server always renders `class="dark"` + `suppressHydrationWarning` on `<html>`; `themeInitScript`
  (`src/lib/theme.ts`, stringified `initTheme`) runs in `<head>` and fixes the class and `meta[name=theme-color]`
  from `localStorage` before first paint (verified: class correct when `<body>` is parsed). `ThemeSwitcher` re-applies
  the stored preference in `useLayoutEffect` (dev Strict Mode remount resets `<html>` attributes). Routes stay
  prerendered.
- **Gotcha:** `initTheme` is embedded via `toString()`, so it must not reference module-level identifiers (inline
  constants); `src/lib/theme.test.ts` runs the generated string in `node:vm` to prove it.
- **Source:** `node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md`, found by testing.

### Inline `<script>` in the root layout: "Encountered a script tag" when React creates it on the client (2026-11-11)
- **Symptom:** dev console `Encountered a script tag while rendering React component…` after a language switch and
  on a direct load of an unknown path; afterwards `<head>` holds two theme scripts.
- **Cause:** changing the `[locale]` root param is a **client-side** navigation (same root layout file, Next docs
  `script.md`), but the `[locale]` subtree remounts, so React creates a new `<script>` on the client; unknown paths
  are served as a `<html id="__next_error__">` shell and rendered entirely on the client (prod too). React (dev) warns
  whenever it creates an executable script (client-created scripts never run); `isScriptDataBlock` (a non-JS `type`)
  silences it. A plain server-only `<script>` was fine on normal loads, which hid this.
- **Do:** every inline script goes through `InlineScript` (`src/components/inline-script.tsx`), a `"use client"`
  component rendering `type="text/javascript"` on the server and `type="text/plain"` on the client with
  `suppressHydrationWarning` (the docs' pattern; a server component can't do it, `window` is always undefined
  there). After a remount/client render the work must happen in client code (theme: `ThemeSwitcher`'s
  `useLayoutEffect`). Check: `scripts/e2e/header-e2e.mjs` against dev and prod.
- **Also:** on every client navigation Next appends a fresh `meta[name=theme-color]` with the `viewport` value (dark)
  after ours; browsers use the first matching one in tree order (still ours), so the bar colour stays right.
- **Source:** `preventing-flash-before-hydration.md` ("Extracting a reusable component"),
  `react-dom-client.development.js` (`isScriptDataBlock`), found by testing.

### Session-dependent skeleton in the static shell: shape from the auth cookie (2026-11-11)
- **Symptom:** signed in, the header showed a 74px "Giriş Yap"-shaped skeleton before the 32px avatar, pushing the
  language and theme buttons ~42px left: on every hard load, and when switching **back** to a language.
- **Cause:** the fallback is in the prerendered shell, which can't know the session. Switching back to a locale whose
  shell is already in the client cache shows that shell (fallback included) at once and streams the user menu again;
  the first switch to a new locale waits for the whole payload, so it didn't show.
- **Do:** `UserMenuSkeleton` takes its shape from whether a Supabase auth cookie exists (`hasSessionCookie`,
  `src/lib/auth/session-hint.ts`; `@supabase/ssr` cookies are `httpOnly: false`; only the name is checked): an inline
  script right after the skeleton sets `data-session` before first paint (server HTML), and client renders read the
  cookie with `useSyncExternalStore` (server snapshot `false`, `suppressHydrationWarning` for the attribute). The
  signed-out shape is the button box with the real, invisible label, so it matches in every locale and font state.
- **Then:** the right-sized grey circle still replaced the photo for ~1s on every language switch (production). The
  fallback now shows the avatar this tab last displayed (`rememberShownUser` in `src/components/auth/user-avatar.tsx`,
  module memory only, cleared on sign-out; nothing stored). Only a hard load still shows the grey circle.
- **Also:** colour transitions (`transition-all` on buttons etc.) fade for ~150ms when the theme class flips while the
  page snaps; `applyResolvedTheme` disables transitions during a flip (next-themes' `disableTransitionOnChange`).
- **Source:** found by testing (`scripts/e2e/header-e2e.mjs` logs the skeleton box per animation frame).

### Brand assets: tracing the wordmark and building the R&V icon (2026-11-09)
- **Wordmark SVG:** potrace (pure-JS `potrace` npm) on the **half-resolution** alpha bitmap (1794×572, `turdSize` 10,
  `optTolerance` 0.4, threshold 128), then round coordinates to 1 decimal and drop the whitespace → 39.7 KB, single
  evenodd path, brush texture kept (full-res trace was 93 KB because of 3-decimal coordinates). Used as a CSS mask.
- **`monogram-cream-master.png` is unusable as is:** the R's leg is cut by a vertical edge, the V by the image border,
  and the & overlaps the V. The letters in `wordmark-cream-master.png` are separate connected components, so the
  monogram is rebuilt from them (R, &, V pulled out by flood fill and re-spaced ~70 px apart, no underline).
- **Icons:** render SVG → PNG with headless Chrome (`--default-background-color=00000000` keeps transparency);
  maskable icon keeps the monogram inside ~56 % of the width (corners well inside the 80 % safe circle).

### `opengraph-image.png` in `[locale]` is served from `/-/opengraph-image.png` (2026-11-09)
- **Symptom:** `og:image` content is `…/-/opengraph-image.png?<hash>` (HTML of `/` and `/en`); `/opengraph-image.png` is 404.
- **Cause:** the dynamic segment is replaced by `-` in the metadata route; it works (200, image/png).
- **Do:** nothing. `og:image` is absolute, built from `metadataBase`, which we deliberately leave unset (see
  `nextjs.md`).

### `next/image` `priority` is deprecated in Next 16: use `preload` (2026-11-09)
- **Do:** `<Image preload />` for above-the-fold images (`ClubBadge` takes `preload`); `placeholder="empty"` is the default, omit it.

### Headless Chrome screenshots of `/` show English unless `Accept-Language` is set (2026-11-09)
- **Symptom:** TR screenshots rendered English copy (next-intl negotiates locale from the header on `/`).
- **Do:** `page.setExtraHTTPHeaders({"Accept-Language": "tr"})` per locale; set `localStorage.theme` via `evaluateOnNewDocument` for dark/light.

### `buttonVariants()` on a `Link` is not tailwind-merged: base + variant classes can conflict (2026-11-09)
- **Symptom:** light-theme outline buttons rendered as `<Link>` had no border while `<Button>` did (same classes).
- **Cause:** `Button` runs the cva output through `cn` (merge drops `border-transparent`), but `buttonVariants()` returns both `border-transparent` (base) and `border-input` (variant); the stylesheet order picks transparent.
- **Do:** keep colour utilities that variants override out of the cva base (`border-transparent` now lives in the non-outline variants).

### Active nav text uses `text-accent-text`, not `text-primary` (2026-11-09)
- Orange `--primary` on cream is ~2.2:1; `--accent-text` passes AA. On light, `bg-muted` under it is only ~4.05:1, so the desktop active pill is `bg-card`.

### Next adds a second `theme-color` meta after hydration; tinted text needs blended-contrast checks (2026-11-09)
- **Symptom:** after hydration `<head>` has two `meta[name="theme-color"]` (ours + Next's, recreated on navigation); updating only the first left the browser bar on the old colour.
- **Do:** `applyResolvedTheme`/`initTheme` use `querySelectorAll` and set every tag (fake docs in `theme.test.ts` carry two).
- **Also:** `text-destructive` on `bg-destructive/10…20` (or `bg-input/30`) over card/popover is lower contrast than on the plain background. `globals-contrast.test.ts` blends the tint (`blend()`); keep its alpha constants in sync with `button.tsx`/`badge.tsx`. Orange as *text* (`link` variants) is `text-accent-text`, and light `--ring` must be ≥ 3:1 on cream (`#B4560C`).
- **Also:** CSS-mask elements (wordmark) vanish in Windows forced-colours mode unless `forced-color-adjust: none`.

### shadcn `dialog` (base-nova): hard-coded English "Close", and `add` prompts to overwrite `button.tsx` (2026-11-09)
- **Symptom:** `pnpm dlx shadcn@latest add dialog` stops at "button.tsx already exists. Overwrite?" (non-interactive
  runs abort without writing anything); the generated `DialogContent`/`DialogFooter` render an sr-only/visible
  "Close" that isn't translated.
- **Do:** `yes n | pnpm dlx shadcn@latest add dialog` keeps our patched `button.tsx`. Use
  `<DialogContent showCloseButton={false}>` and put a translated close/cancel button in the footer.
- **Source:** found while adding the "Link to account" dialog (Task 7).

### Pending-link dim must be an animation, not a transition (2026-11-10)
- **Symptom:** links with `transition-colors` (bottom tabs) or `transition-all` (`buttonVariants`) dimmed instantly.
- **Cause:** utility classes (layer `utilities`) override the `a { transition: opacity }` in `@layer base`.
- **Do:** `a:has(> [data-link-pending]) { animation: link-pending-dim 150ms forwards }` — animations are not affected by
  `transition-property`, so the colour transitions stay intact. Verified: opacity 0.70-0.77 mid-fade, 0.6 at the end.
- **Source:** found by testing.

### Skeleton of a Card that wraps one child (a form) must wrap its children too (2026-11-10)
- **Symptom:** a role-editor skeleton built from `Card > CardHeader + CardContent + CardFooter` was 27px taller than the
  real card.
- **Cause:** `Card` is `flex flex-col gap-(--card-spacing)`. The real `RoleEditor` has a single child (`<form>`), so no
  gap between header, content and footer; the skeleton had three children and got two extra 16px gaps.
- **Do:** mirror the child structure, not just the card: put the parts in one `<div>` like the form. Copy-dependent
  heights (permission descriptions wrap to two lines on a phone, one on desktop; one of five stays one line) need
  responsive classes (`h-10.5 sm:h-5.25`); tailwind 4 accepts `h-5.25`/`h-8.5` etc., no pixel literals needed.
