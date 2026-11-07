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
