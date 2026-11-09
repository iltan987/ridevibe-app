# Design system "Gece + turkuaz" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the chosen visual identity (night background, sunset orange actions, teal statuses, cream text, Saira,
the club badge + derived wordmark/icon) to every existing page, with a dark-default Sistem/Koyu/Açık theme switch.

**Architecture:** Colours are CSS variables in `src/app/globals.css` mapped onto shadcn's token names, so components
change by token, not by hand. The theme is applied before first paint by an inline `<head>` script (the pattern from
`node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md`) built from a pure, unit-tested
function in `src/lib/theme.ts`; nothing reads cookies/headers, so pages stay static under Cache Components. Brand
files are generated once from `docs/design/brand/` masters (scripts stay in the scratchpad) and served via
`public/brand/` and Next.js metadata file conventions.

**Tech Stack:** Next.js 16.4 App Router (Cache Components, React Compiler), React 19.3, Tailwind CSS 4, shadcn
`base-nova` (Base UI), next-intl 4, `next/font/google` (Saira), `node --test` with TS type stripping. One-off asset
tooling: Python 3 + Pillow (installed), npm `potrace` in a scratchpad project.

**Spec:** `docs/superpowers/specs/2026-11-09-design-system-design.md` (read it; mockup:
`docs/design/mockups/chosen-gece-turkuaz.png`, variant "2 · Gece + turkuaz" and "Açık tema").

## Global Constraints

- Branch `feat/design-system`; Conventional Commits; author iltan; **no `Co-Authored-By` or other trailers**.
- Run `pnpm lint && pnpm exec tsc --noEmit && pnpm test && pnpm build` before every commit that touches code.
- No hard-coded UI strings: every new label in `messages/tr.json` (source of truth) **and** `messages/en.json`.
- Never `await` request data (`cookies()`, `headers()`) for theming; the build must not gain new dynamic segments.
- Use `Link` etc. from `@/i18n/navigation`; Base UI composes with `render`, not `asChild`; `cn` from `cn`.
- Never CSS-uppercase English/brand words on a `tr` page (dotted-İ rule); the brand is shown as the wordmark asset.
- Colour tokens are 6-digit hex in `globals.css` (the contrast test parses them).
- Theme: default **dark** when nothing is stored; preference values exactly `"system" | "dark" | "light"`; storage key
  `"theme"` in `localStorage`; theme colours `#0B0D10` (dark) / `#FBF5E5` (light).
- Mobile-first: check every change at 390 px first.
- Learnings: read `docs/learnings/ui.md`, `nextjs.md`, `next-intl.md` before starting; add an entry for anything
  non-obvious in the same commit.

## Review Focus

1. **`localStorage` unavailable or throwing** (Safari private mode, blocked storage) → page still renders dark, no
   script error; switching still changes the theme for the session. Test in Task 2 (`initTheme` with a throwing
   storage; `applyThemePreference` swallowing a throwing `setItem`).
2. **Garbage stored value** (`"blue"`, `""`, old formats) → treated as default dark. Test in Task 2.
3. **"Sistem" and the phone switching light/dark while the page is open** → theme follows live. Test in Task 2
   (matchMedia change listener) + browser check in Task 5.
4. **Light theme readability** (cream backgrounds, orange text, input borders outdoors) → all text pairs ≥ 4.5:1,
   input borders/primary on dark ≥ 3:1. Automated in Task 1 (`globals.css` contrast test).
5. **Dev remount resets `<html>` class** (React Strict Mode) → light users see dark in dev. Handled by the switcher's
   `useLayoutEffect` re-apply (Task 2); verified in the browser with `pnpm dev` in Task 5.

---

### Task 1: Colour tokens, Saira font, contrast test

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/[locale]/layout.tsx` (fonts only in this task)
- Create: `src/app/globals-contrast.test.ts`

**Interfaces:**
- Produces: CSS variables + Tailwind colours `background, foreground, card, popover, secondary, muted,
  muted-foreground, accent, border, input, primary, primary-foreground, ring, destructive` (existing names) and new
  `accent-text, status, status-muted, status-foreground, sun` (usable as `text-accent-text`, `bg-status`,
  `bg-status-muted`, `text-status-foreground`…); utilities `heading` and `eyebrow`; `--radius: 0.375rem`; font variable
  `--font-sans` = Saira.

- [ ] **Step 1: Write the failing contrast test** `src/app/globals-contrast.test.ts`

Reads `src/app/globals.css`, extracts `--name: #rrggbb` pairs from the `:root { … }` (light) and `.dark { … }` blocks,
computes WCAG 2.x contrast (relative luminance, sRGB linearisation) and asserts per theme:

```ts
const TEXT = [ // ≥ 4.5
  ["foreground", "background"], ["foreground", "card"], ["muted-foreground", "background"],
  ["muted-foreground", "card"], ["muted-foreground", "secondary"], ["primary-foreground", "primary"],
  ["accent-text", "background"], ["accent-text", "card"], ["status-foreground", "status-muted"],
  ["destructive", "background"], ["destructive", "card"],
];
const UI = [["input", "background"], ["input", "card"]]; // ≥ 3, both themes
const UI_DARK_ONLY = [["primary", "background"]];       // ≥ 3, dark
```
Each failing pair's message names theme, pair and ratio. Also assert every token used above exists in both blocks.

- [ ] **Step 2: Run it — fails** (`pnpm test`): missing tokens (`accent-text`, `status-*`) / oklch values not parsed.

- [ ] **Step 3: Replace the palette in `globals.css`**

Values (light `:root` / dark `.dark`), all hex:

| token | light | dark |
|---|---|---|
| background | `#FBF5E5` | `#0B0D10` |
| foreground, card-foreground, popover-foreground, secondary-foreground, accent-foreground | `#14120F` | `#FBF5E5` |
| card, popover | `#FFFDF7` | `#14171C` |
| secondary, muted, accent | `#F1E9D6` | `#1E2229` |
| muted-foreground | `#6B6352` | `#A39C8C` |
| border | `#E6DCC5` | `#22272F` |
| input | `#93876C` | `#646A75` |
| primary | `#F98D2F` | `#F98D2F` |
| primary-foreground | `#1A0E02` | `#1A0E02` |
| accent-text | `#B4560C` | `#FBA04A` |
| ring | `#E2741A` | `#F98D2F` |
| status | `#0E9F88` | `#2FD8BE` |
| status-muted | `#DDF5F0` | `#0E2C28` |
| status-foreground | `#0B6E5F` | `#4FE6CE` |
| sun | `#F2C230` | `#FBE563` |
| destructive | `#C2272D` | `#F2555A` |

Also: chart-1…5 → primary, status, sun, muted-foreground, border; sidebar-* → same values as their base tokens;
`--radius: 0.375rem`; add `--color-accent-text`, `--color-status`, `--color-status-muted`,
`--color-status-foreground`, `--color-sun` to `@theme inline`; `--font-heading: var(--font-sans)`; remove
`--font-mono: var(--font-geist-mono)` (no `font-mono` usage in `src/`). In `@layer base`: `:root { color-scheme:
light }` and `.dark { color-scheme: dark }`. Add:

```css
@utility heading { font-family: var(--font-heading); font-weight: 800; font-stretch: 80%;
  text-transform: uppercase; letter-spacing: 0.01em; line-height: 1; }
@utility eyebrow { font-size: 0.6875rem; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.14em; color: var(--accent-text); }
```

- [ ] **Step 4: Swap fonts in `src/app/[locale]/layout.tsx`**: `Saira({ variable: "--font-sans", subsets: ["latin",
  "latin-ext"], axes: ["wdth"] })` (no `weight` — variable font); delete `Geist`/`Geist_Mono`; `<html className>`
  gets `saira.variable` and, until Task 2, a literal `dark` class so the default look is visible.

- [ ] **Step 5: Run checks** — `pnpm test` (contrast test PASS), `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build`
  (no new dynamic-route errors; Saira `wdth` axis accepted).

- [ ] **Step 6: Quick look** — `pnpm dev`, open `/` and `/apply` at 390 px: night background, cream text, orange
  primary button, Saira; Turkish characters render.

- [ ] **Step 7: Commit** — `feat(ui): Gece + turkuaz colour tokens, Saira font, contrast test`

---

### Task 2: Theme preference (Sistem / Koyu / Açık)

**Files:**
- Create: `src/lib/theme.ts`, `src/lib/theme.test.ts`
- Create: `src/components/theme/theme-script.tsx`, `src/components/theme/theme-switcher.tsx`
- Modify: `src/app/[locale]/layout.tsx` (html attrs, `<head>` script, viewport)
- Modify: `src/components/layout/site-header.tsx` (add switcher)
- Modify: `messages/tr.json`, `messages/en.json`

**Interfaces:**
- Consumes: `.dark` palette from Task 1.
- Produces (`src/lib/theme.ts`):
  - `type ThemePreference = "system" | "dark" | "light"`; `type ResolvedTheme = "dark" | "light"`
  - `THEME_STORAGE_KEY = "theme"`; `THEME_COLORS = { dark: "#0B0D10", light: "#FBF5E5" } as const`
  - `parseThemePreference(raw: unknown): ThemePreference` — anything not one of the three → `"dark"`
  - `resolveTheme(pref: ThemePreference, systemPrefersDark: boolean): ResolvedTheme`
  - `applyResolvedTheme(doc: Document, theme: ResolvedTheme): void` — toggles `dark` class on
    `doc.documentElement`, sets `content` of `meta[name="theme-color"]` (if present) to `THEME_COLORS[theme]`
  - `initTheme(doc, storage: Pick<Storage,"getItem"> | null, matchMedia: ((q: string) => { matches: boolean }) | null)`
    — self-contained (no outer identifiers; constants inlined) so it can be stringified; storage errors → default
  - `themeInitScript: string` = `` `(${initTheme.toString()})(document, (function(){try{return localStorage}catch(e){return null}})(), window.matchMedia ? window.matchMedia.bind(window) : null)` ``
  - client helpers: `readThemePreference(): ThemePreference`, `applyThemePreference(pref: ThemePreference): void`
    (persists — swallowing storage errors — then resolves with `matchMedia("(prefers-color-scheme: dark)")` and applies)
- Messages: `Theme.label` "Tema"/"Theme", `Theme.system` "Sistem"/"System", `Theme.dark` "Koyu"/"Dark",
  `Theme.light` "Açık"/"Light".

- [ ] **Step 1: Write failing tests** `src/lib/theme.test.ts` (import `./theme.ts`; keep `theme.ts` free of `@/` imports) (fake `document` with a classList Set and a meta stub)

```ts
test("parseThemePreference defaults to dark", () => {
  for (const v of [null, undefined, "", "blue", "DARK", 1, {}]) assert.equal(parseThemePreference(v), "dark");
  for (const v of ["system", "dark", "light"]) assert.equal(parseThemePreference(v), v);
});
test("resolveTheme", () => {
  assert.equal(resolveTheme("system", true), "dark"); assert.equal(resolveTheme("system", false), "light");
  assert.equal(resolveTheme("light", true), "light"); assert.equal(resolveTheme("dark", false), "dark");
});
test("initTheme: nothing stored → dark + dark theme-color");
test("initTheme: 'light' stored → no dark class, meta #FBF5E5");
test("initTheme: 'system' + prefers light → light");
test("initTheme: storage.getItem throws / storage null / matchMedia null → dark, no throw");
test("themeInitScript evaluates in node:vm with fakes and applies 'light'"); // proves the stringified fn is self-contained
test("applyThemePreference: setItem throwing still applies the theme");
```

- [ ] **Step 2: Run** `pnpm test` — FAIL (module missing).

- [ ] **Step 3: Implement `src/lib/theme.ts`** per Interfaces (no `"use client"`; DOM access only inside functions).

- [ ] **Step 4: Run** `pnpm test` — PASS.

- [ ] **Step 5: `ThemeScript`** (`theme-script.tsx`, server component): `<script dangerouslySetInnerHTML={{ __html:
  themeInitScript }} />`. In the layout: `<html … className={`${saira.variable} dark h-full antialiased`}
  suppressHydrationWarning>`, `<head><ThemeScript /></head>` before `<body>`; `viewport.themeColor =
  THEME_COLORS.dark` (single value; the script/switcher update the meta).

- [ ] **Step 6: `ThemeSwitcher`** (`"use client"`), modelled on `locale-switcher.tsx`: ghost `size="icon-sm"`
  button with lucide `SunMoon` (constant icon → no hydration mismatch) and `aria-label={t("label")}`; dropdown
  with `DropdownMenuLabel` + `DropdownMenuRadioGroup` items `system` (`Monitor`), `dark` (`Moon`), `light` (`Sun`).
  State: `useState(readThemePreference)`. `onValueChange` → `applyThemePreference` + setState. `useLayoutEffect` on
  mount re-applies the stored preference (dev Strict Mode resets `<html>`). While preference is `"system"`,
  `useEffect` subscribes to `matchMedia("(prefers-color-scheme: dark)")` `change` and re-applies; unsubscribe on
  change/unmount. Place it in `site-header.tsx` between `LocaleSwitcher` and the user menu (visible signed in and
  out; fits at 390 px next to wordmark + locale + avatar). Not duplicated in the user menu.

- [ ] **Step 7: Messages** — add the `Theme` block to both message files.

- [ ] **Step 8: Run checks** — lint, tsc, test, build; build output shows no new dynamic routes vs `main`.

- [ ] **Step 9: Browser check** (`pnpm build && pnpm start`, plus `pnpm dev` once for Review Focus 5): first visit
  dark; pick Açık → light, reload → still light, no dark flash; pick Sistem and toggle the OS/devtools
  `prefers-color-scheme` → follows live; DevTools: `<meta name="theme-color">` content follows.

- [ ] **Step 10: Commit** — `feat(ui): dark-default theme with Sistem/Koyu/Açık switch`

---

### Task 3: Brand assets (badge, wordmark SVG, icons, manifest, link preview)

**Files:**
- Create: `public/brand/wordmark.svg`, `public/brand/icon-192.png`, `public/brand/icon-512.png`,
  `public/brand/icon-maskable-512.png`
- Create: `src/assets/brand/badge.png` (1024 px, from `docs/design/brand/badge-2048.png`)
- Replace: `src/app/favicon.ico` (16/32/48); Create: `src/app/icon.svg`, `src/app/apple-icon.png` (180),
  `src/app/manifest.ts`, `src/app/manifest.test.ts`, `src/app/[locale]/opengraph-image.png` (1200×630),
  `src/app/[locale]/opengraph-image.alt.txt`
- Create: `src/components/brand/wordmark.tsx`, `src/components/brand/club-badge.tsx`
- Delete: `public/{file,globe,next,vercel,window}.svg` (starter leftovers, unused — confirm with grep)

**Interfaces:**
- Consumes: `THEME_COLORS` from `src/lib/theme.ts` — import it in `manifest.ts` as `../lib/theme.ts` (relative, with extension: `node --test` can't resolve `@/`).
- Produces: `<Wordmark className?: string />` — `<span role="img" aria-label="Ride & Vibe">` sized by className
  (aspect from the SVG viewBox), coloured with `bg-current` + CSS `mask: url(/brand/wordmark.svg) center / contain
  no-repeat` (one cached file, follows `currentColor` in both themes); `<ClubBadge className?: string, priority?: boolean, alt?: string />` (named `ClubBadge` to avoid clashing with shadcn's `Badge`)
  — `next/image` of the static import, `alt=""` (decorative next to visible club name) unless `alt` given, `sizes`
  matching its CSS width.

- [ ] **Step 1: Write failing test** `src/app/manifest.test.ts`

```ts
test("manifest icons exist and colours match the theme", () => {
  const m = manifest();
  assert.equal(m.background_color, THEME_COLORS.dark); assert.equal(m.theme_color, THEME_COLORS.dark);
  assert.ok(m.icons?.some((i) => i.purpose === "maskable"));
  for (const i of m.icons ?? []) assert.ok(existsSync(join("public", i.src)), i.src);
});
```

- [ ] **Step 2: Run** — FAIL (no manifest).

- [ ] **Step 3: Generate assets (scratchpad tooling, outputs only are committed)**
  - Trace: in a scratchpad dir `pnpm init && pnpm add potrace`; convert `docs/design/brand/wordmark-cream-master.png`
    alpha to a black-on-white bitmap (Pillow), trace with `turdSize` ≈ 20 and `optTolerance` ≈ 0.4, single path,
    `fill="currentColor"` removed (mask uses shape only), tight `viewBox`. Target `wordmark.svg` ≤ 60 KB (raise
    `optTolerance` if larger). Compare against the master at 28 px and 600 px height; brush texture may simplify,
    letter shapes must not.
  - Monogram: before tracing, clean the V's right edge in `monogram-cream-master.png` (the cut touched the next
    letter: remove pixels right of the V's outer stroke). Trace the same way → icon artwork.
  - `src/app/icon.svg`: 64×64 viewBox, `#0B0D10` rounded square (rx 14) + monogram in `#FBF5E5`, 16 % padding.
  - PNGs from that artwork (Pillow or headless Chrome screenshot of the SVG): `apple-icon.png` 180, `icon-192`,
    `icon-512`, `icon-maskable-512` (monogram inside the central 80 % safe zone, full-bleed `#0B0D10`), `favicon.ico`
    with 16/32/48.
  - `badge.png`: `badge-2048.png` → 1024 px (Lanczos), keep transparency.
  - `opengraph-image.png`: 1200×630 `#0B0D10`, badge ~460 px left, wordmark in `#FBF5E5` + eyebrow "İSTANBUL MOTOSİKLET
    KULÜBÜ" in `#FBA04A` right. Alt text: "Ride & Vibe — İstanbul motosiklet kulübü".

- [ ] **Step 4: `src/app/manifest.ts`** — `name` "Ride & Vibe", `short_name` "Ride & Vibe", `start_url` "/",
  `display` "standalone", colours `THEME_COLORS.dark`, icons `/brand/icon-192.png` (192), `/brand/icon-512.png` (512),
  `/brand/icon-maskable-512.png` (512, `purpose: "maskable"`).

- [ ] **Step 5: Run** `pnpm test` — PASS.

- [ ] **Step 6: `Wordmark` and `ClubBadge` components** per Interfaces (no usage yet beyond Task 4).

- [ ] **Step 7: Checks** — lint, tsc, test, build; `curl -sI localhost:3000/manifest.webmanifest /icon.svg
  /apple-icon.png /favicon.ico` → 200 after `pnpm start`; view-source of `/` shows `og:image`.

- [ ] **Step 8: Commit** — `feat(brand): club badge, traced wordmark, R&V icons, manifest and link preview`

---

### Task 4: Apply the identity to existing screens

**Files:**
- Modify: `src/components/layout/site-header.tsx`, `bottom-nav.tsx`, `desktop-nav.tsx`, `site-footer.tsx`
- Modify: `src/app/[locale]/page.tsx`, `src/app/[locale]/sign-in/page.tsx`, `src/components/coming-soon.tsx`,
  `src/app/[locale]/not-found.tsx`
- Modify: `src/components/ui/badge.tsx` (new `status` variant)
- Modify: `src/app/[locale]/account/page.tsx`, `src/components/admin/application-review-panel.tsx`,
  `src/components/apply/apply-form.tsx`, `src/app/[locale]/privacy/page.tsx`, `src/app/[locale]/privacy/placeholder.tsx`

**Interfaces:**
- Consumes: tokens/utilities (Task 1), `ThemeSwitcher` (Task 2), `Wordmark`, `ClubBadge` (Task 3).
- Produces: `badgeVariants({ variant: "status" })` = `bg-status-muted text-status-foreground` (border transparent).

- [ ] **Step 1: Header** — replace the text title with `<Wordmark className="h-7 w-[5.5rem] text-foreground" />`
  inside the home `Link` (keep the link's accessible name via the wordmark's `aria-label`); header background
  `bg-background/80` stays.
- [ ] **Step 2: Nav** — bottom tab bar on `bg-card`, active item `aria-[current=page]:text-primary` + `font-semibold`;
  desktop nav active colour the same.
- [ ] **Step 3: Footer** — small `Wordmark` (`h-5`) left, rights text + privacy link muted.
- [ ] **Step 4: Home** — `ClubBadge` 118 px (`priority`) above the eyebrow with a soft radial glow behind it
  (`--primary` at ~35 % opacity, blurred, `pointer-events-none`, decorative); eyebrow uses `eyebrow`; title uses
  `heading` (Turkish text — uppercase is correct here); keep the existing CTA logic and Suspense fallback.
- [ ] **Step 5: Sign-in** — `ClubBadge` ~96 px centred above the card title; card title `heading`.
- [ ] **Step 6: Headings elsewhere** — `ComingSoon` and `not-found` `h1` use `heading`. Admin page titles: use
  `heading` only where the title is Turkish/English UI text from messages (allowed), never on brand names.
- [ ] **Step 7: Status colours** — add `status` variant to `badge.tsx`; use it for the active profile badge
  (`account/page.tsx:74`) and the approved application status (`application-review-panel.tsx:105`, only when
  `status === "approved"`); `apply-form.tsx:117` success icon `text-status`.
- [ ] **Step 8: Replace remaining hard-coded colours** — privacy note and placeholder mark, account notice card:
  amber → `sun`-based tokens (e.g. `border-sun/40 bg-sun/10`, placeholder `bg-sun/30 text-foreground`). Verify:
  `grep -rnE "(amber|green|red|blue|zinc|neutral|gray)-[0-9]" src --include=*.tsx` → no matches outside
  `src/components/ui/` and `google-icon.tsx`.
- [ ] **Step 9: Checks** — lint, tsc, test, build.
- [ ] **Step 10: Browser pass** at 390 px **and** 1280 px, dark and light, TR and EN: `/`, `/apply`, `/sign-in`,
  `/events`, `/gallery`, `/privacy`, a 404, and signed in `/account`, `/admin/applications`, one application detail,
  `/admin/members`, `/admin/roles`. Look for: unreadable text, leftover neutral/grey styling, wordmark crispness,
  no "RİDE", badge not blurry, tab bar active state. Fix within this task.
- [ ] **Step 11: Commit** — `feat(ui): apply Gece + turkuaz identity to header, nav, home, sign-in and status UI`

---

### Task 5: Docs, final verification

**Files:**
- Create: `docs/design/README.md`
- Modify: `docs/PLAN.md`, `CLAUDE.md`, `docs/learnings/*.md` (as needed),
  `docs/superpowers/specs/2026-11-09-design-system-design.md` (final colour values)

- [ ] **Step 1: `docs/design/README.md`** — chosen direction + link to spec; where tokens live; fallbacks (1 · Gece
  orange-only, A, C) with their mockup files and the statement "switching = replace the token values in
  `globals.css` (+ re-run the contrast test)"; asset provenance (WhatsApp JPEG → Real-ESRGAN `realesrgan-x4plus` 4× →
  elliptical mask → masters → traced SVG); print master kept outside git by iltan; WhatsApp group photo file
  (`ride-vibe-whatsapp-1024.jpg`) swap is manual.
- [ ] **Step 2: `docs/PLAN.md`** — replace the "Design pass needed" paragraph with a 3-line decision summary + links;
  Events item: "rides have a **route** (path with start, stops, finish), not a single meeting point — see spec §6".
- [ ] **Step 3: `CLAUDE.md`** — UI bullet: palette/tokens in `globals.css` (hex, contrast-tested), `heading`/`eyebrow`
  utilities, `Wordmark`/`ClubBadge` components, theme via `src/lib/theme.ts` (never read cookies for theme); i18n bullet:
  dotted-İ rule. Spec: replace the input/destructive values with the final ones (`#93876C`/`#646A75`,
  `#C2272D`/`#F2555A`) and note the switcher lives only in the header.
- [ ] **Step 4: Full verification** — `pnpm lint && pnpm exec tsc --noEmit && pnpm test && pnpm build`; compare the
  build's route table with `main` (same static/dynamic markers); re-run the Task 4 browser pass quickly on the
  production build; Lighthouse accessibility on `/` and `/apply` in both themes (no contrast failures).
- [ ] **Step 5: Commit** — `docs: design system decisions, fallbacks and asset provenance`
