# Loading States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every link tap gives visible feedback (dimmed link + delayed orange top bar), skeletons match what replaces
them, and `loading.tsx` is added only where Next's dev check flags a blocking segment.

**Architecture:** The exported `Link` in `src/i18n/navigation.tsx` wraps next-intl's `Link` and appends a client
`<LinkPending />` child. It reads `useLinkStatus()`, renders a hidden marker (CSS dims the `<a>`) and registers with a
tiny pending store. `<NavigationProgress />` in the root layout reads the store and draws the bar. Skeletons are
measured with JavaScript off/on in puppeteer and rebuilt to copy their result's structure.

**Tech Stack:** Next.js 16.4 (`cacheComponents`, `partialPrefetching`), next-intl 4.14, React 19
(`useSyncExternalStore`), Tailwind 4, shadcn/Base UI, `node --test`, puppeteer-core in the scratchpad.

**Spec:** `docs/superpowers/specs/2026-11-10-loading-states-design.md`

## Global Constraints

- Branch `feat/loading-states` from `main`; Conventional Commits; author iltan; **no `Co-Authored-By` or other
  trailers**.
- Before every commit that touches code: `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm build`.
- No new dependencies in `package.json`; puppeteer-core lives in the session scratchpad only.
- Import `Link`/`useRouter`/`usePathname`/`redirect`/`getPathname` only from `@/i18n/navigation`.
- No hard-coded UI strings (the bar has no text; it is `aria-hidden`). Never CSS-`uppercase` English words.
- Never read cookies/headers for these features; the `pnpm build` route table must stay identical to the baseline
  (Task 1).
- Bar: 2px, `bg-primary`, `fixed inset-x-0 top-0 z-50`, shown after **150 ms** pending, ~30 % fast then crawl to
  ~90 %, static full-width bar under `prefers-reduced-motion: reduce`.
- Pending link: `a:has(> [data-link-pending])` → `opacity: 0.6`, opacity transition only (no size change).
- Skeleton rule: copy the structure of the most common result (same `Card`, paddings, gaps, row/input/button
  heights); no single tall grey block.
- Every discovery goes into `docs/learnings/` (symptom → cause → do) in the commit of the task that found it.

## Review Focus

1. **Pending never clears:** the user taps link A then quickly link B (only the last link is pending), or the tapped
   link unmounts mid-navigation. Expected: bar and dim always clear once the page settles. → Task 3 unit test
   (`end()` idempotent, unmount ends) + Task 4 E2E "double tap".
2. **Links inside the user dropdown** (Account, admin pages): Base UI unmounts the popup on close, which unmounts
   `LinkPending` and drops the pending state. These routes are never prefetched (hidden until opened), so they are the
   slowest taps. Expected: bar shows. → Task 4 E2E step; fix with `keepMounted` if it fails.
3. **Tapping the already-active tab/chip:** no real navigation. Expected: no stuck bar. → Task 4 E2E step.
4. **Same-route search-param taps** (filter chips, pager), the original "frozen" case. Expected: feedback. → Task 1
   spike decides; Task 5 if needed; Task 4 E2E.
5. **Signed-in header on every page:** the skeleton is sized for the signed-out button, so members see a small shift
   inside the right-hand cluster only (accepted in spec). Expected: wordmark and nav never move. → Task 6 measurement.

---

### Task 1: Branch, build baseline and `useLinkStatus` spike (throwaway)

**Files:**
- Modify: `docs/learnings/nextjs.md` (spike finding)
- Scratch (not committed): `<scratchpad>/route-table-baseline.txt`, `<scratchpad>/spike.mjs`

**Interfaces:**
- Produces: the decision **"same-route taps report pending: yes/no"**, recorded in `docs/learnings/nextjs.md`. Task 5
  runs only on "no".

- [ ] **Step 1:** `git switch -c feat/loading-states main`.
- [ ] **Step 2:** `pnpm build 2>&1 | sed -n '/Route (app)/,$p' > <scratchpad>/route-table-baseline.txt`. Expected: the
  file lists every route with its ○/◐/ƒ marker.
- [ ] **Step 3: Temporary probe.** In `src/components/admin/pager.tsx` and the filter chips of
  `src/app/[locale]/admin/applications/page.tsx`, add a throwaway client child that does
  `console.log("pending", useLinkStatus().pending)` inside each `Link`. Also add one to a bottom-nav item and one to a
  user-dropdown item (`src/components/auth/user-menu-dropdown.tsx`).
- [ ] **Step 4:** `pnpm db:start`, `pnpm build && pnpm start -p 3123`. Seed > 25 applications (`docs/learnings/testing.md`
  "Seed many rows") so the pager shows. Sign in as `admin@test.local` (recipe in `docs/learnings/testing.md`).
- [ ] **Step 5:** With puppeteer (390×844, CDP `Network.emulateNetworkConditions` ~ 400 kbps / 400 ms latency), wait for
  prefetches to settle, then tap: a filter chip, "Next page", a bottom tab, a user-dropdown item. Record which logged
  `pending true`, and whether the dropdown item's pending survives the menu closing.
- [ ] **Step 6:** Revert the probe (`git checkout -- src`), stop the server
  (`kill $(ss -ltnp | grep ':3123 ' | grep -oP 'pid=\K[0-9]+')`), delete the seeded rows.
- [ ] **Step 7:** Add a learnings entry to `docs/learnings/nextjs.md`: `useLinkStatus` with partial prefetching, per
  link kind (same-route search params, other route, dropdown item), with the source "found by testing".
- [ ] **Step 8:** Commit `docs(learnings): useLinkStatus behaviour with partial prefetching`.

### Task 2: Pending store

**Files:**
- Create: `src/lib/navigation/pending-store.ts`
- Test: `src/lib/navigation/pending-store.test.ts`

**Interfaces:**
- Produces:
  - `beginNavigation(): () => void` increments the count and returns an **idempotent** `end` that decrements once.
  - `subscribePending(listener: () => void): () => void` returns an unsubscribe function.
  - `getPendingCount(): number`
  - `getServerPendingCount(): 0`

- [ ] **Step 1: Write the failing tests** (`import … from "./pending-store.ts"`, `node:test` + `node:assert/strict`,
  style of `src/lib/applications/contact.test.ts`):
  - `begin/end counts pending links`: two `beginNavigation()` → `getPendingCount() === 2`; end one → `1`; end other → `0`.
  - `end is idempotent`: calling the same `end` twice → count goes 1 → 0 and stays `0` (never negative).
  - `subscribers are notified on every change and can unsubscribe`: listener call count 2 after begin+end;
    after unsubscribing, another begin does not call it.
  - Tests must clean up (end everything they begin), because the store is module state.
- [ ] **Step 2:** `pnpm test` → FAIL (module not found).
- [ ] **Step 3:** Implement with a module-level `count` and a `Set` of listeners.
- [ ] **Step 4:** `pnpm test` → all pass.
- [ ] **Step 5:** Commit `feat(nav): pending-navigation store`.

### Task 3: `LinkPending`, `Link` wrapper and the pending style

**Files:**
- Create: `src/components/layout/link-pending.tsx` (`"use client"`)
- Rename + modify: `src/i18n/navigation.ts` → `src/i18n/navigation.tsx` (import path `@/i18n/navigation` unchanged)
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `beginNavigation` (Task 2).
- Produces: `LinkPending(): JSX.Element | null`; `Link` exported from `@/i18n/navigation` with next-intl's props
  (`ComponentProps<typeof IntlLink>`). The other exports (`redirect`, `usePathname`, `useRouter`, `getPathname`) stay
  the same.

- [ ] **Step 1:** `LinkPending`: `const { pending } = useLinkStatus()` (from `next/link`). An effect calls
  `beginNavigation()` while `pending` and returns its `end` as cleanup (covers unmount mid-navigation). Render
  `<span data-link-pending hidden />` when pending, else `null`.
- [ ] **Step 2:** In `navigation.tsx`: `const navigation = createNavigation(routing)`, re-export the four helpers, and
  export `function Link({ children, ...props }: ComponentProps<typeof navigation.Link>)` rendering
  `<navigation.Link {...props}>{children}<LinkPending /></navigation.Link>`. No hooks, so it works from server and
  client components. Keep the existing file comment.
- [ ] **Step 3:** In `globals.css`, inside `@layer base`: `a:has(> [data-link-pending]) { opacity: 0.6; }` and give
  `a` an `opacity` transition of 150 ms (only the `opacity` property).
- [ ] **Step 4:** If Task 1 found that dropdown items lose pending when the menu closes: add an optional
  `keepMounted?: boolean` prop to `DropdownMenuContent` in `src/components/ui/dropdown-menu.tsx`, passed to
  `MenuPrimitive.Portal`, and set it on the user menu. Otherwise skip this step.
- [ ] **Step 5:** `pnpm lint && pnpm exec tsc --noEmit && pnpm test && pnpm build`, then diff the build route table
  against `route-table-baseline.txt`. Expected: identical.
- [ ] **Step 6:** Browser check on `pnpm start` with a throttled network: tapping a bottom tab dims it until the page
  changes. Links with `render={<Link …/>}` (dropdown items) still render their icon + label.
- [ ] **Step 7:** Commit `feat(nav): dim the tapped link while its navigation is pending`.

### Task 4: `NavigationProgress` top bar + navigation E2E

**Files:**
- Create: `src/components/layout/navigation-progress.tsx` (`"use client"`)
- Modify: `src/app/[locale]/layout.tsx` (mount once, first child inside the providers, before `<SiteHeader />`)
- Modify: `src/app/globals.css` (keyframes)

**Interfaces:**
- Consumes: `subscribePending`, `getPendingCount`, `getServerPendingCount` (Task 2).
- Produces: `NavigationProgress(): JSX.Element | null`.

- [ ] **Step 1:** `useSyncExternalStore(subscribePending, getPendingCount, getServerPendingCount)`. When count > 0,
  start a 150 ms timer; render the bar only after it fires; clear the timer and hide when the count returns to 0.
- [ ] **Step 2:** Bar: `<div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5">` with an inner
  `bg-primary` strip animated by a `nav-progress` keyframe (transform `scaleX` from 0 → 0.3 in ~0.2 s, then → 0.9
  over ~8 s, `origin-left`, `forwards`). `motion-reduce:` no animation and `scaleX(1)`.
- [ ] **Step 3:** `pnpm lint && pnpm exec tsc --noEmit && pnpm test && pnpm build`; route table identical to the
  baseline.
- [ ] **Step 4: E2E** (scratchpad puppeteer, production build, 390×844, `admin@test.local`, seeded > 25 applications,
  throttled network unless noted). Query only visible elements (`docs/learnings/testing.md`). Assert for each:
  - bottom tab → bar visible within 600 ms, tapped tab has the pending marker, both gone after the URL changes and
    content renders;
  - filter chip, "Next page", list card → detail: same (or Task 5's list dim if Task 1 said "no");
  - user dropdown → "Başvurular": bar visible;
  - **double tap**: tap tab A then tab B within 100 ms → bar clears after B's page renders;
  - **active tab** tapped again → no bar after 1 s;
  - fast network, prefetched tab → bar never appears (sample every 50 ms);
  - `page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])` → bar has no running animation;
  - screenshots of the bar in dark and light themes (check that it is visible against the header).
- [ ] **Step 5:** Commit `feat(nav): delayed top progress bar for pending navigations`.

### Task 5 (only if Task 1 found "no" for same-route taps): list controls with a transition

**Files:**
- Create: `src/components/admin/list-nav.tsx` (`"use client"`)
- Modify: `src/app/[locale]/admin/applications/page.tsx`, `src/app/[locale]/admin/members/page.tsx`,
  `src/components/admin/pager.tsx`

**Interfaces:**
- Consumes: `beginNavigation` (Task 2), `useRouter` from `@/i18n/navigation`.
- Produces: `ListNavProvider({ children })` holding `useTransition`; `ListNavLink(props: ComponentProps<typeof Link>)`
  that renders `Link` but on a plain left click (no modifier keys) calls `preventDefault()` and
  `startTransition(() => router.push(href))`; `ListNavRegion({ children })` that sets `aria-busy` and `opacity-60`
  while pending. While pending the provider holds a `beginNavigation()` so the bar shows.

- [ ] **Step 1:** Build the three components; wrap the chips + list + pager of both list pages in the provider; use
  `ListNavLink` for chips and pager links, `ListNavRegion` around the list.
- [ ] **Step 2:** Lint, tsc, test, build; route table identical.
- [ ] **Step 3:** E2E: chip and pager taps dim the list and show the bar; Ctrl/Cmd-click still opens a new tab.
- [ ] **Step 4:** Commit `feat(admin): show pending state while a list filter or page loads`.

### Task 6: Measure skeletons, then fix the public and header ones

**Files:**
- Scratch: `<scratchpad>/skeletons.mjs`, `<scratchpad>/skeletons-before.md`
- Modify: `src/components/auth/user-menu.tsx` (`UserMenuSkeleton`), `src/app/[locale]/sign-in/page.tsx`,
  `src/app/[locale]/apply/page.tsx`, `src/app/[locale]/account/page.tsx`
- Modify: `docs/learnings/testing.md`

**Interfaces:**
- Produces: `<scratchpad>/skeletons.mjs <baseUrl> <out.md>`, reused by Task 7.

- [ ] **Step 1: Measuring script.** For each route × viewport (390×844, 1280×800) × theme (dark, light: set via the
  theme mechanism in `src/lib/theme.ts`) × state (signed out, pending without application, pending with application,
  member, admin; only states the route can show):
  - load with `page.setJavaScriptEnabled(false)` and record the bounding box of each fallback;
  - load with JS on, wait for network idle, and record the box of the element in the same place.

  Locate fallbacks with a `data-skeleton="<name>"` attribute on each fallback root and `data-skeleton-result="<name>"`
  on each result root. These attributes are **committed** (harmless, and they make future measuring possible). Routes:
  `/`, `/sign-in`, `/apply`, `/account`, plus the header (user menu, locale switcher, nav active state) on each. Output:
  a markdown table `name | state | viewport | theme | skeleton h×w | result h×w | Δh`.
- [ ] **Step 2:** Run on `pnpm build && pnpm start` → `skeletons-before.md`. Attach its summary to the commit message.
- [ ] **Step 3: Fix** following the rule (Global Constraints):
  - `UserMenuSkeleton`: same box as the signed-out `buttonVariants({ variant: "outline", size: "sm" })` "Giriş yap"
    button (measure its width in TR; EN is shorter, accepted).
  - `/sign-in`: height of the Google sign-in button.
  - `/apply`: the form's first section card (same `Card`, header, and the first few fields' heights), not 60rem.
  - `/account`: mirror the account card (header + rows).
- [ ] **Step 4:** Re-run the script. Expected: |Δh| ≤ 4px for the most common state of each fallback (signed out for
  header, `/sign-in`, `/apply`; member for `/account`). Other states are listed, not required.
- [ ] **Step 5:** Learnings in `docs/learnings/testing.md`: "Measuring Suspense fallbacks: JavaScript off keeps the
  fallback visible" (symptom → cause → do).
- [ ] **Step 6:** Lint, tsc, test, build (route table identical). Commit `fix(ui): size public skeletons like their
  content`.

### Task 7: Admin skeletons and shared `ListSkeleton`

**Files:**
- Create: `src/components/admin/list-skeleton.tsx`
- Modify: `src/app/[locale]/admin/applications/page.tsx`, `src/app/[locale]/admin/members/page.tsx`,
  `src/app/[locale]/admin/applications/[id]/page.tsx`, `src/app/[locale]/admin/roles/page.tsx`

**Interfaces:**
- Consumes: `skeletons.mjs` (Task 6).
- Produces: `ListSkeleton({ rows, rowClassName }: { rows: number; rowClassName: string })`, a chip row matching the
  real filter chips (height and rounded-full pills) plus `rows` skeleton rows with the given height class. It replaces
  both local `ListSkeleton`s (applications: rows like the application card; members: rows like `member-row.tsx`).

- [ ] **Step 1:** Run the script for the admin routes as admin → before table.
- [ ] **Step 2:** Implement `ListSkeleton`; mirror the application detail header (title, date line, contact buttons row)
  plus the first card; mirror the roles page structure.
- [ ] **Step 3:** Re-run. Expected: |Δh| ≤ 4px for the chip row and per row; the detail and roles skeletons cover the
  first viewport at 390px without a visible jump.
- [ ] **Step 4:** Lint, tsc, test, build (route table identical). Commit `fix(admin): skeletons mirror the admin lists,
  detail and roles`.

### Task 8: `loading.tsx` check, docs and backlog

**Files:**
- Maybe create: `src/app/[locale]/<segment>/loading.tsx` (only for flagged segments)
- Modify: `CLAUDE.md`, `docs/follow-ups.md`, `docs/learnings/nextjs.md`,
  `docs/superpowers/specs/2026-11-10-loading-states-design.md` (Status line)

- [ ] **Step 1:** `pnpm dev`, then visit every route under `src/app/[locale]` (as signed out and as admin) by direct
  load **and** by client navigation from another page. Collect Next's instant-navigation validation messages from the
  dev overlay and terminal.
- [ ] **Step 2:** For each flagged segment add a `loading.tsx` that renders that page's skeleton (reuse Task 6/7
  components), and re-check that the message is gone. If nothing is flagged, write that down.
- [ ] **Step 3:** `docs/learnings/nextjs.md`: what the check reported and the rule "pages own their `<Suspense>`; no
  `loading.tsx` unless flagged".
- [ ] **Step 4:** `CLAUDE.md` › Stack & conventions, one bullet: new pages: the skeleton copies the structure of what
  replaces it (`data-skeleton` attributes + JS-off measuring, `docs/learnings/testing.md`); links already show pending
  feedback via the `@/i18n/navigation` `Link`; no `loading.tsx` unless the dev check flags the segment.
- [ ] **Step 5:** `docs/follow-ups.md`: remove "Loading states iteration"; reduce the `/apply` notice-cards item to the
  intro part; add anything deferred during Tasks 1–7 (incl. review minors). Spec status → "implemented".
- [ ] **Step 6:** Full verification: `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm build` (route table
  identical); re-run the Task 4 E2E once on the final branch. Commit `docs: loading-states conventions, learnings and
  follow-ups`.
