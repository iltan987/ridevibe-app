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
- **JSON-LD is the exception:** `<script type="application/ld+json">` (home page, `src/lib/seo/json-ld.ts`) is a data
  block (`isScriptDataBlock`), so React never warns when it creates it on the client: keep a plain `<script>`, no
  `InlineScript`.
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
- **Whole fallbacks by session (2026-11-24):** `SessionHintSwitch` (`src/components/auth/session-hint-switch.tsx`)
  renders both skeletons (server components passed as props) in a wrapper whose first child is
  `sessionHintParentScript`; the children toggle with `hidden in-data-session:block` / `in-data-session:hidden`
  (Tailwind 4's `in-*` matches any marked ancestor). Used by `/events` (members' list vs public teaser).
- **Source:** found by testing (`scripts/e2e/header-e2e.mjs` logs the skeleton box per animation frame).

### A guessing fallback inside a pathname `<Suspense>` appears several times in the HTML (2026-11-11)
- **Symptom (risk):** the "Başvur" nav guess (`applyHintScript`, marking the element that holds it) could miss copies of the
  nav: the server HTML of `/` holds the guessing `DesktopNav`/`BottomNav` twice each (the pathname boundary's fallback
  and its content), plus the streamed final nav.
- **Cause:** the outer session boundary (`DesktopNavForUser`/`BottomNavForUser`) falls back to the nav, which has its
  own pathname `<Suspense>`; both of its sides render the same `*NavLinks`. Content streamed later sits in a hidden
  `<div>` and is moved in by `$RC`; its inline script still runs while parsing, so the attribute is set before the move.
- **Do:** render the `<nav>` with its `InlineScript` as first child inside the shared `*NavLinks` (every copy carries
  its own script; see the next entry for why first child),
  never once outside the inner boundary. Check by sampling the visible tab count every animation frame on a hard load
  (member: 4 in every frame, visitor: 5, stale `"0"` as member: 5 → 4).
- **Source:** `curl` of the production build HTML (local `pnpm start`; one script per `<nav>` copy), puppeteer frame
  sampling.

### A hint script placed after its element can lose to a stream chunk boundary (2026-11-14)
- **Symptom:** after the home redesign, `apply-nav-e2e` failed on phone TR second loads: a member's tab bar showed
  5 tabs including "Başvur" for one frame, then the 4-tab guess. Visitors' "second load showed the guess first" check
  failed too (the first frame was not a guess).
- **Cause:** the script followed the `<nav>` and marked `previousElementSibling`. The parser can yield between the
  nav and the script when the stream splits there, and the browser may paint the unmarked bar in between (a frame the
  logger sees in `requestAnimationFrame` is a frame that can be painted). A bigger closing section moved the split.
  Muting the test (skipping frames without a following sibling) would have hidden a real flash.
- **Do:** make the script the first child of the element it marks and use `currentScript.parentElement`
  (`applyHintScript`: both navs and the home "Başvur" links): it runs before any tab or label of that element is
  parsed, wherever chunks split. Never filter frames in the logger to make such a failure disappear. The session hint
  (`sessionHintScript`, user-menu skeleton) still uses the sibling pattern (`docs/follow-ups.md`).
- **Source:** found by `scripts/e2e/apply-nav-e2e.mjs` (frame logger), reproduced 3 of 3 runs.

### Brand assets: tracing the wordmark and building the R&V icon (2026-11-09)
- **Wordmark SVG:** potrace (pure-JS `potrace` npm) on the **half-resolution** alpha bitmap (1794×572, `turdSize` 10,
  `optTolerance` 0.4, threshold 128), then round coordinates to 1 decimal and drop the whitespace → 39.7 KB, single
  evenodd path, brush texture kept (full-res trace was 93 KB because of 3-decimal coordinates). Used as a CSS mask.
- **`monogram-cream-master.png` is unusable as is:** the R's leg is cut by a vertical edge, the V by the image border,
  and the & overlaps the V. The letters in `wordmark-cream-master.png` are separate connected components, so the
  monogram is rebuilt from them (R, &, V pulled out by flood fill and re-spaced ~70 px apart, no underline).
- **Icons:** render SVG → PNG with headless Chrome (`--default-background-color=00000000` keeps transparency);
  maskable icon keeps the monogram inside ~56 % of the width (corners well inside the 80 % safe circle).

### `opengraph-image.jpg` in `[locale]` is served from `/-/opengraph-image.jpg` (2026-11-09)
- **Symptom:** `og:image` content is `…/-/opengraph-image.jpg?<hash>` (HTML of `/` and `/en`);
  `/opengraph-image.jpg` is 404.
- **Cause:** the dynamic segment is replaced by `-` in the metadata route; it works (200, image/jpeg;
  the file was a PNG until 2026-11-13).
- **Do:** nothing. `og:image` is absolute, built from `metadataBase`, which is fixed to the production origin
  (see `nextjs.md`).

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

### A skeleton of a different height toggles the scrollbar and shifts the centred layout (2026-11-11)
- **Symptom:** on desktop (Windows, classic scrollbars) the whole header moved ~8px sideways and back while switching
  the language on `/apply` as a member.
- **Cause:** the `/apply` skeleton is the long form (default state), the member's real page is a short card: the
  scrollbar (15–17px) appears for the skeleton and disappears again, and `mx-auto` content re-centres.
- **Do:** `scrollbar-gutter: stable` on `<html>` (`globals.css`) keeps the space reserved; Base UI's scroll lock
  already works with it (menus don't shift). Short pages show an empty gutter on classic-scrollbar desktops.
- **Source:** iltan's screenshots, `scripts/e2e/header-e2e.mjs` section 6.

### PWA install: `beforeinstallprompt` fires without a service worker (2026-11-12)
- **Symptom:** Chrome's blog "Revisiting Chrome's installability criteria" says the install *prompt* still needs a
  service worker with a `fetch()` handler (only menu install dropped it); web.dev's criteria list doesn't mention one.
- **Cause:** the blog is outdated. A local production build with only `src/app/manifest.ts` (no service worker) has no
  installability errors in Chrome 157 (`Page.getInstallabilityErrors` → `[]`) and fires `beforeinstallprompt` (launched
  with `--bypass-app-banner-engagement-checks`; real users also need a tap + ~30 s on the site).
- **Do:** don't add a service worker just for installability. Check with CDP `Page.getInstallabilityErrors` /
  `Page.getAppManifest` against `pnpm start -p 3123` (local only). Firefox (Android/desktop) and WebKit never fire the
  event: guide those users manually (spec `docs/superpowers/specs/2026-11-12-install-prompt-design.md`).
- **Source:** found by testing (headless Chrome 157 via puppeteer-core, 2026-11-12).

### iOS Home Screen web apps don't share storage with Safari (2026-11-12)
- **Symptom:** after adding the app to the Home Screen, opening a club link in Safari (e.g. from WhatsApp) shows the
  "install the app" banner again (and again 30 days after each "Şimdi değil").
- **Cause:** an iOS Home Screen web app has its own storage (and cookies), separate from Safari, and Safari exposes no
  "installed" signal (`getInstalledRelatedApps` is Chromium-only, `appinstalled` never fires): the `rv-install-*` flags
  set inside the app are invisible to Safari.
- **Do:** accept it (the banner is dismissible for 30 days); don't try to sync the flags. Members also sign in again
  inside the installed app.
- **Source:** install-prompt final review (WebKit storage partitioning for Home Screen web apps).

### A portal into `<body>` from a page is hidden with the page's hidden route copy (2026-11-12)
- **Symptom:** worry: the install banner's in-flow spacer is portalled to the end of `<body>` (so it follows the
  footer); Next keeps the previous route mounted but hidden after a client navigation, so would the spacer's height
  stay on the next page?
- **Cause:** no: React hides the host nodes of a hidden `Activity` subtree including its portals (inline
  `display: none !important`), and shows them again when the route is revealed (Back). Checked in a production build
  (`/account` → `/` → `/members` → Back ×2: exactly one visible spacer whenever `/account` is shown, none elsewhere).
- **Do:** portalling page-owned layout helpers into `<body>` is safe with Next's hidden routes; the E2E keeps a check
  (`scripts/e2e/install-e2e.mjs`, section 8c).
- **Source:** found by testing (install prompt final fixes).

### Cross-tab state: stored values outlive what they describe; background tabs mount late (2026-11-12)
- **Symptom:** (code review + E2E) a language switch to the language already in `localStorage` reached no tab (no
  write, no event); a tab opened in the background and shown after a sign-out elsewhere stored its outdated user, so
  the next real sign-in looked like "no change"; a background tab missed a language switch made before it was shown.
- **Cause:** a `localStorage` value outlives the session it came from (the `NEXT_LOCALE` cookie may be gone, the
  account signed out), and a tab's streamed header hydrates only when the tab is first shown
  (`docs/learnings/testing.md`), so "compare with the stored value" is wrong in both directions.
- **Do:** treat user actions as events (`localeEvent`: unique value per switch) and catch up on mount with events
  newer than the page load (`localeSwitchedSince(…, performance.timeOrigin)`); give state a time and let only newer
  state win (`authMark` with the server render time, `authRenderAction`; refresh at most once per stored mark so a
  server clock behind can't loop). Code: `src/lib/cross-tab.ts`.
- **Source:** code review of `feat/cross-tab-sync`; `scripts/e2e/cross-tab-e2e.mjs`.

### An empty `ActionStatus` is still a flex item: it adds a gap (2026-11-13)
- **Symptom:** the Acil durum card skeleton was 16px short per status line.
- **Cause:** `ActionStatus` renders an empty `<p aria-live>` (height 0) even without a result; inside a `flex gap-4`
  `CardContent` it still takes a gap. Measure the real children (puppeteer `getBoundingClientRect` per child) before
  sizing a skeleton.
- **Do:** put it inside the small group it belongs to (gap-2) and mirror it in the skeleton with an empty `<div />`.
- **Source:** found by measuring (`scripts/e2e/skeletons.mjs`).

### A section that must stay in the night palette: put the `dark` class on it (2026-11-13)
- **Symptom:** cream text on a photo's dark gradient became unreadable (dark-on-dark / light-on-light) in the light theme.
- **Cause:** the tokens (`text-foreground`, `bg-background`) follow the page theme; the photo gradient doesn't.
- **Do:** give the section `className="dark …"`: the `.dark` scope makes the tokens resolve to the night palette inside
  it, in both themes (`src/components/home/home-hero.tsx`).
- **Also set `text-foreground` on the section** (2026-11-24): the class re-resolves the variables, but `color` is
  inherited as a computed value from `body` (resolved in the page theme). Anything that doesn't set its own text colour
  (an outline button: `buttonVariants({ variant: "outline" })` sets none) stays dark-on-dark in the light theme. The
  events E2E compares the hero button's colour with the h1's in the light theme.
- **Source:** found by testing (home hero; "Etkinlikleri Gör", events release).

### A `font-stretch` display heading reflows at the font swap: use fixed lines (2026-11-14)
- **Symptom:** first visit on a slow network: the home hero h1 ("Let's ride together.") wrapped to 3 lines, then
  shrank to 2 when Saira arrived, and the bottom-anchored hero text jumped (CLS 0.08-0.095 on /en at 1.6 Mbps).
- **Cause:** next/font's size-adjusted fallback (Arial) can't be condensed, so `font-stretch: 62%` only applies after
  the swap; the fallback text is ~1.6x wider and wraps differently.
- **Do:** make the heading fixed lines that never wrap (`t.rich` with `<line>` tags rendering
  `<span className="block whitespace-nowrap">`; the accessible text keeps its space) and size it by viewport only
  (`text-[min(23.5vw,5.75rem)]`), checked in the final font at 320-1280 px. Code: `src/components/home/home-hero.tsx`.
- **Source:** whole-branch review of `feat/home-redesign`; CLS measured with a throttled puppeteer run.

### A decorative line over full-bleed photos: stacking and SVG alignment (2026-11-14)
- **Symptom:** the home page's route line (an `absolute` span) was drawn across edge-to-edge photos on phones and
  cut faces; a first mockup of a bend around the photo met the straight line ~1px off.
- **Cause:** absolutely positioned elements paint above non-positioned blocks, so a plain `<Image>` can't cover the
  line; an SVG stretched with `preserveAspectRatio="none"` to a width other than its viewBox scales its x coordinates.
- **Do:** wrap the photo (and the bend strips) in a `relative z-10` element with an opaque background where the line
  must be hidden; draw the bend in a fixed-size SVG (`viewBox` = CSS size, `overflow-visible`) and position it with the
  same CSS variable as the line (`left: calc(var(--route-x) + 1.5px - 30px)`), so the ends meet exactly. Verify by
  reading `getScreenCTM()` of the path ends against the line's centre.
- **Source:** iltan's review of the live redesign; measured with puppeteer (`src/components/home/route.tsx`).

### `text-base/snug` sets no `--tw-leading`: a variant `text-sm` then drops the line height (2026-11-15)
- **Symptom:** after `text-base leading-snug` became `text-base/snug` (the canonical form), small card titles
  (`group-data-[size=sm]/card:text-sm`) got `text-sm`'s default line height instead of snug.
- **Cause:** Tailwind 4's `leading-*` sets `--tw-leading`, which a later `text-*` keeps; the `text-X/Y` shorthand
  writes `line-height` directly, so any other `text-*` replaces it.
- **Do:** when a size changes in a variant, repeat the line height there too (`…:text-sm/snug`, `src/components/ui/card.tsx`),
  or keep a separate `leading-*` class.
- **Source:** Task 4 review; measured in headless Chrome (16/22px and 14/19.25px before and after the fix).

### `heading text-3xl` is 36px tall, not 30px: the size's line height beats the utility's `line-height: 1` (2026-11-21)
- **Symptom:** the events skeleton's heading row (sized for `line-height: 1` × 30px) measured 32px, the real
  `<h1 class="heading text-3xl">` 36px.
- **Cause:** the `heading` utility sets `line-height: 1`, but `text-3xl` sets `line-height: var(--tw-leading,
  var(--text-3xl--line-height))` (2.25rem) and wins in the cascade.
- **Do:** size a skeleton of a `heading text-3xl` line as `h-9` (36px); measure, don't compute from the utility.
- **Source:** found by measuring `/events/past` with JS off (Task 5 of the events branch).

### A `<fieldset>`'s `<legend>` is no flex item: its gap is its margin (2026-11-21)
- **Symptom:** the event form's skeleton came out 6px taller per fieldset than the form.
- **Cause:** the rendered legend sits outside the fieldset's flex layout, so `gap-3` doesn't apply after it; shadcn's
  `FieldLegend` brings `mb-1.5` (24px line + 6px). A legend inside another element isn't the fieldset's legend at all
  (no accessible name): use `role="group"` + `aria-labelledby` when the label shares a row with buttons
  (`src/components/events/place-field.tsx`).
- **Do:** in a skeleton, give the legend line its height plus a negative margin of (gap − legend margin)
  (`-mb-1.5 h-6` for `gap-3`, `src/components/events/event-form-skeleton.tsx`); measure, don't compute.
- **Source:** found by measuring `/events/new` with JS off (events Task 7).
