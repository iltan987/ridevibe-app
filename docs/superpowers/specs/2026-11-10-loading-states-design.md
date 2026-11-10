# Loading states — design

Status: **implemented** on `feat/loading-states` (2026-11-10); agreed in chat with iltan.

## Why

iltan noticed two things (backlog item "Loading states iteration", `docs/follow-ups.md`):

1. **Layout jumps** when streamed data replaces a skeleton (skeleton height ≠ real height).
2. **Taps that feel frozen.** Seen in the admin lists: filter chips and "Next page" navigate to the *same* route with
   other search params. React keeps the old list on screen (the `<Suspense>` boundary is already revealed, so a
   transition doesn't show the fallback again) and nothing reacts until the new list arrives.

iltan has fast internet, so neither hurts much today, but data-heavier pages (events, galleries, attendance) are
coming. **Goal:** every tap gives visible feedback, skeletons don't jump, and new pages get both by default.

## What the Next 16 docs say (read for this design)

- `node_modules/next/dist/docs/01-app/02-guides/instant-navigation.md`, `…/prefetching.md`,
  `…/03-api-reference/03-file-conventions/loading.md`, `…/04-functions/use-link-status.md`.
- With `cacheComponents` + `partialPrefetching` every visible `<Link>` prefetches the destination's App Shell; a
  navigation is instant once it is prefetched, and the page's own `<Suspense>` fallbacks stream in. Our pages already
  put request-time data behind `<Suspense>` inside `page.tsx` (below the `[locale]` layout), which is what
  `loading.tsx` would add.
- `useLinkStatus()` (from `next/link`) gives `{ pending }` to any component rendered **inside** a `<Link>`;
  `pending` is `true` until history updates. It is skipped when the destination was already prefetched, and only the
  last clicked link is pending.
- next-intl 4.14 `Link` (`navigation/shared/BaseLink.js`) renders `next/link` and passes `children` through, so the
  hook works inside our `@/i18n/navigation` `Link`. Locale-changing links use a separate internal component
  (prefetch off); they still render `next/link`.

## 1. Navigation indicator

### Units

| Unit | File | Purpose |
|---|---|---|
| Pending store | `src/lib/navigation/pending-store.ts` | Plain TS: `begin()` returns an `end()` function, `subscribe(listener)`, `getSnapshot()` → number of pending links. No React; unit-tested. |
| `LinkPending` | `src/components/layout/link-pending.tsx` (client) | Calls `useLinkStatus()`. While `pending`: renders `<span data-link-pending hidden />` and holds a `begin()` from the store (effect cleanup calls `end()`). Renders nothing otherwise. |
| `Link` wrapper | `src/i18n/navigation.ts` | Exported `Link` = a hook-free component rendering next-intl's `Link` with `<LinkPending />` appended to `children` (works from server and client components). Props typed as `ComponentProps` of next-intl's `Link`, so no call site changes. |
| `NavigationProgress` | `src/components/layout/navigation-progress.tsx` (client) | Reads the store with `useSyncExternalStore`; renders the top bar. Mounted once in the root layout. |
| Pending style | `src/app/globals.css` | `a:has(> [data-link-pending])` → opacity ~60 % with a short transition. |

### Behaviour

- **Tapped item:** the link the user tapped (bottom tab, desktop nav item, filter chip, pager button, list card,
  footer link) dims while pending. Opacity only, so the size never changes and nothing moves.
- **Top bar:** fixed, `top: 0`, full width, 2px tall, brand orange (`bg-primary`, the action colour; teal is for
  status only, `docs/design/README.md`), above the sticky header (`z-50`), outside the page flow. It appears **after
  ~150 ms** of pending (instant navigations never flash it), then grows quickly to ~30 % and slowly crawls towards
  ~90 %. It is removed when the store reaches 0. `aria-hidden` (screen readers already announce the new page).
  `prefers-reduced-motion: reduce` → a static full-width bar with no animation.
- **Static rendering:** `LinkPending` and `NavigationProgress` read no request data; they are client components that
  render nothing on the server, so every route keeps its current prerender mode (checked against the `pnpm build`
  route table).
- **Not covered:** programmatic navigation (`router.push`/`redirect` after Server Actions; their buttons already show
  pending states). Locale switching gets the dim + bar like any link if the spike shows it fires; not required.

### Spike first (throwaway, answers one question)

Does `useLinkStatus` report `pending` for **same-route, different-search-param** taps (filter chips, pager) on a
**production build** with prefetching on? Probe: `pnpm build && pnpm start`, a temporary `LinkPending` that logs,
throttled network in puppeteer, tap a chip and the pager.

- **Yes** → build as above.
- **No** → keep everything above, and add a small client wrapper for the list controls (filter chips + pager) that
  navigates with `router.push` inside `useTransition` and, while `isPending`, dims the list (`aria-busy` on the list
  region) and shows the bar (it calls the same `begin()`/`end()`). The list rows keep using the plain `Link`.

## 2. Skeletons that match the real layout

### Measuring (no new tooling in the repo)

Puppeteer script in the session scratchpad (`docs/learnings/testing.md`), against `pnpm build && pnpm start` with the
local Docker DB and seeded local users:

- **JavaScript off** → the streamed content is never swapped in, so the fallback stays visible: measure the box of
  each `<Suspense>` fallback.
- **JavaScript on** → measure the box that replaced it.
- Matrix: 390×844 and 1280×800 · dark and light · the states each page can show (signed out, pending without
  application, pending with application, active member, admin).
- Output: a before/after table of height (and width where it matters, e.g. the header) per fallback.

### Rule

A skeleton copies the **structure of the most common result**: same `Card`, same paddings and gaps, same row,
input and button heights. No single tall grey block.

### Fallbacks to fix

| Fallback | Today | Most common result | Plan |
|---|---|---|---|
| Header user menu (`UserMenuSkeleton`) | 32px circle | Signed-out "Giriş yap" button (`size="sm"`, wider) | Skeleton with the sign-in button's size; avatar case (members) is narrower → small shift inside the right cluster only |
| `/sign-in` form | one `h-9` bar | Google button (+ error/notice when present) | Match the button height; error/notice cases may grow |
| `/apply` (`ApplyGate`) | `h-[60rem]` block | The form (ad visitors) | Skeleton mirrors the form's first section; members/applicants see a short notice card instead (jump below the fold, accepted) |
| `/account` | `h-40` block | Account card | Mirror the card structure |
| `/admin/roles` | `h-96` block | Role list/editor | Mirror the structure |
| Application detail | `h-[40rem]` block | Header + detail cards | Mirror header (title, date, contact buttons) + first card |
| Admin lists (`ListSkeleton` in applications and members) | `h-9` chip row + 4 × `h-24` | Chip row + list rows | One shared `ListSkeleton` with the real chip and row heights, used by both lists |
| Home "Apply" button, nav active state, locale switcher | same component as result | — | Measure only; expected to match already |

Extract a shared component only where two places use it (`ListSkeleton`); other skeletons stay next to their page.

The follow-up "form intro still shows above the notice on `/apply`" stays in `docs/follow-ups.md`: fixing it moves
static text out of the instant shell, a separate trade-off.

## 3. `loading.tsx`

Not added by default. During the build, run `pnpm dev`, visit every route, and read Next's instant-navigation
validation (dev overlay/terminal). Add a `loading.tsx` **only** for a segment it flags, and note what it reported in
`docs/learnings/nextjs.md`. Expected: nothing flagged.

## 4. Testing and verification

- **Unit** (`node --test`): pending store — begin/end counting, several pending links, `end()` idempotent,
  subscribers notified.
- **Browser E2E** (puppeteer, production build, throttled "slow mobile" network):
  - tap a bottom tab, a filter chip, the pager and a list → detail link: the bar appears after the delay, the tapped
    item dims, both clear after the page changes;
  - instant (prefetched, fast-network) navigation: no bar flash;
  - `prefers-reduced-motion: reduce`: static bar;
  - both themes: bar visible against the header.
- **Skeleton table** re-run after the fixes: no visible jump for the common state of each page.
- **Build:** `pnpm build` route table unchanged (no route becomes dynamic); lint, `tsc`, `pnpm test`.
- No DB changes → no pgTAP or migration.

## 5. Docs (same commits as the work)

- `docs/learnings/nextjs.md`: `useLinkStatus` behaviour found in the spike (same-route taps, prefetched links);
  `docs/learnings/testing.md`: measuring fallbacks with JavaScript off.
- `CLAUDE.md` (Stack & conventions): new pages — skeleton copies the structure of what replaces it; links already
  give pending feedback via `@/i18n/navigation` `Link`; no `loading.tsx` unless the dev check flags the segment.
- `docs/follow-ups.md`: remove "Loading states iteration" and the skeleton half of the `/apply` notice-cards item;
  add anything deferred.

## Not in scope

- Progress for programmatic navigations and Server Action submits.
- Third-party top-loader packages (patch history internals; fragile on Next 16).
- Prefetch tuning (`prefetch={true}` per link) — revisit if a real slow route shows up.
