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
- Known cosmetic issue on light theme (`border-border`); revisit when theming/branding.

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
  prerendered. A plain `<script>` in the root `<head>` gave no React dev warning.
- **Gotcha:** `initTheme` is embedded via `toString()`, so it must not reference module-level identifiers (inline
  constants); `src/lib/theme.test.ts` runs the generated string in `node:vm` to prove it.
- **Source:** `node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md`, found by testing.
