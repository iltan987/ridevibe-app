# Hide "Başvur" for members and applicants — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Başvur" appears in the desktop nav, the phone tab bar and the home hero exactly when `/apply` would show the
form; elsewhere the tab bar has 4 tabs, without the nav moving after first paint on repeat visits.

**Architecture:** One pure rule (`applyView`) decides what `/apply` shows; a per-request cached server helper
(`getApplyView`) feeds `ApplyGate`, the navs and the hero. Each place is a `<Suspense>`: the fallback guesses from the
session cookie + the answer stored in `localStorage` (inline script before first paint, `useSyncExternalStore` on
client renders), the streamed part renders the real answer and stores it.

**Tech Stack:** Next.js 16 App Router (`cacheComponents`, PPR), React 19 + Compiler, next-intl, Tailwind 4,
`node --test`, Puppeteer E2E.

**Spec:** `docs/superpowers/specs/2026-11-11-hide-apply-design.md`

## Global Constraints

- Branch `feat/hide-apply` (exists, spec committed). No worktrees. Commits: Conventional Commits, author iltan, **no
  `Co-Authored-By` or other trailers**.
- Before every code commit: `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm build`.
- Tested modules import relatively with `.ts` extensions (`node --test` can't resolve `@/`); they stay dependency-free.
- Inline scripts only via `InlineScript` (`src/components/inline-script.tsx`); stringified functions must be
  self-contained (arguments only, no imports or closures).
- Client-only reads via `useSyncExternalStore(noSubscribe, client, server)`; never `setState` in an effect.
- Use `Link` from `@/i18n/navigation`. No new UI strings (existing `Nav.apply` / `Home.apply`).
- Storage key `rv-apply-hidden`, values `"1"` (hidden) / `"0"` (shown). Guess: no session cookie → show; session
  cookie → hide unless the stored value is exactly `"0"`.
- Never log personal data (log error codes only).
- Remove code made dead by the change in the same commit (e.g. `ApplyGate`'s own branches).

## Review Focus

- **`localStorage` throws or is missing** (Safari private mode, some in-app browsers, storage disabled): the guess falls
  back to cookie-only, nothing crashes, the streamed answer still renders. Pinned in Task 2 (read/write helpers and the
  inline script with a throwing storage).
- **Visitor with a stale stored `"1"`** (a member signed out on this browser): no session cookie → "Başvur" shown from
  the first frame. Pinned in Task 2 (unit) and Task 5 (E2E).
- **Fallback shown again after a language switch** (the `[locale]` layout remounts; the inline script doesn't run on
  client renders): the hook must give the same guess as the script. Pinned in Task 2 (parity test) and Task 5 (E2E).
- **Submitting an application while signed in** (pending, no application → open application): the nav drops "Başvur"
  without a reload, via the client store `markApplySubmitted` (the action has no `refresh()`; spec amended). Pinned in
  Task 5 (`apply-nav-e2e.mjs`, last scenario).
- **`my_application_status` fails**: nav, hero and `/apply` all fall back to "form" (Başvur shown), error code logged
  once per request. Pinned in Task 1 (`getApplyView` keeps the existing catch; one call per request via `cache`).

---

### Task 1: The rule and `getApplyView`; `ApplyGate` uses it

**Files:**
- Create: `src/lib/applications/apply-view.ts`, `src/lib/applications/apply-view.test.ts`,
  `src/lib/applications/get-apply-view.ts`
- Modify: `src/components/apply/apply-gate.tsx`

**Interfaces:**
- Produces:
  - `type ApplyView = "form" | "alreadyMember" | "underReview" | "inactive"`
  - `applyView(profileStatus: Enums<"member_status"> | null | undefined, applicationStatus: Enums<"application_status"> | null): ApplyView`
    (use the actual enum names from `src/lib/supabase/database.types.ts`, `import type` with a relative `.ts` path)
  - `getApplyView(): Promise<ApplyView>` — `cache()`d, `import "server-only"`; reads `getCurrentUser()`; calls
    `getMyApplicationStatus()` only when the profile is `pending`; on error `unstable_rethrow(error)`, then
    `console.error("getApplyView:", <message or fixed text>)` and treat the application as `null`.

- [ ] **Step 1: Write the failing tests** in `apply-view.test.ts` (`node:test`, `assert/strict`), one per spec row:
  - `applyView(null, null)` → `"form"` (visitor; also a signed-in user without a profile row)
  - `applyView("pending", null)` → `"form"`; `applyView("pending", "rejected")` → `"form"`
  - `applyView("pending", "new")` and `("pending", "contacted")` → `"underReview"`
  - `applyView("pending", "approved")` → `"form"` (today's gate behaviour: approval activates the account, so this
    is a transient state; keep it as is)
  - `applyView("active", <any>)` → `"alreadyMember"`; `applyView("inactive", <any>)` → `"inactive"`
- [ ] **Step 2: Run** `pnpm test` → the new file fails (module not found).
- [ ] **Step 3: Implement** `applyView` (pure) and `getApplyView` (server).
- [ ] **Step 4: Rewrite `ApplyGate`** to `switch` on `await getApplyView()`: `"form"` → `<ApplyForm />`, with the
  `defaults` prop (name + email) when `getCurrentUser()` returns a user (the call is cached, no extra query); the other
  three → `<Notice kind={view} />` with `kind: Exclude<ApplyView, "form">`. Remove the gate's own status branches and
  the now-unused imports.
- [ ] **Step 5: Run** `pnpm test`, `pnpm lint`, `pnpm exec tsc --noEmit` → all pass.
- [ ] **Step 6: Commit** `refactor(apply): one rule for what /apply shows (applyView)`.

### Task 2: The guess (pure helpers + inline script)

**Files:**
- Create: `src/lib/applications/apply-hint.ts`, `src/lib/applications/apply-hint.test.ts`
- Modify: `src/lib/auth/session-hint.ts` (export the cookie regex as `SESSION_COOKIE`; `sessionHintScript` unchanged)

**Interfaces:**
- Consumes: `SESSION_COOKIE: RegExp`, `hasSessionCookie(cookie: string): boolean` from `../auth/session-hint.ts`
- Produces:
  - `APPLY_HINT_KEY = "rv-apply-hidden"`
  - `guessApplyHidden(hasSession: boolean, stored: string | null): boolean` → `hasSession && stored !== "0"`
  - `readApplyHint(getStorage: () => Pick<Storage, "getItem">): string | null` — returns `null` if `getStorage()` or
    `getItem` throws
  - `writeApplyHint(getStorage: () => Pick<Storage, "setItem">, hidden: boolean): void` — writes `"1"`/`"0"`,
    swallows throws
  - `applyHintScript: string` — `(${markApplyHint.toString()})(document, ${SESSION_COOKIE}, "rv-apply-hidden")`;
    `markApplyHint(doc, sessionCookie, key)` sets `data-apply-hidden=""` on `doc.currentScript.previousElementSibling`
    when the cookie matches and the stored value (read in `try`, via `doc.defaultView.localStorage`) isn't `"0"`.
    Same shape as `markSessionHint`.

- [ ] **Step 1: Write the failing tests** in `apply-hint.test.ts`:
  - `guessApplyHidden`: `(false, null|"1"|"0"|"x")` → `false`; `(true, null)` → `true`; `(true, "1")` → `true`;
    `(true, "0")` → `false`; `(true, "garbage")` → `true`
  - `readApplyHint`: returns the stored value; returns `null` when `getStorage` throws and when `getItem` throws
  - `writeApplyHint`: writes `"1"` for `true`, `"0"` for `false`; doesn't throw when `setItem`/`getStorage` throws
  - `applyHintScript` run in `node:vm` (copy the `runScript` approach of `session-hint.test.ts`): for every
    combination of cookie (signed in / out, from `session-hint.test.ts`'s lists) × stored (`null`, `"1"`, `"0"`,
    `"x"`) the attribute is set exactly when `guessApplyHidden(...)` is `true` (parity); a throwing `localStorage`
    with a session cookie → attribute set, no exception; no previous sibling → no exception
- [ ] **Step 2: Run** `pnpm test` → fails (module not found).
- [ ] **Step 3: Implement** `apply-hint.ts`; export `SESSION_COOKIE` from `session-hint.ts`.
- [ ] **Step 4: Run** `pnpm test`, `pnpm lint`, `pnpm exec tsc --noEmit` → pass.
- [ ] **Step 5: Commit** `feat(nav): guess whether to show Başvur before the session loads`.

### Task 3: Navs (desktop + tab bar) and the layout

**Files:**
- Create: `src/components/apply/use-apply-hidden-guess.ts`, `src/components/apply/remember-apply-hint.tsx`,
  `src/components/layout/nav-for-user.tsx`
- Modify: `src/components/layout/desktop-nav.tsx`, `src/components/layout/bottom-nav.tsx`,
  `src/components/layout/site-header.tsx`, `src/app/[locale]/layout.tsx`

**Interfaces:**
- Consumes: `getApplyView()` (Task 1); `guessApplyHidden`, `readApplyHint`, `writeApplyHint`, `applyHintScript`
  (Task 2); `hasSessionCookie`; `InlineScript`
- Produces:
  - `useApplyHiddenGuess(): boolean` (`"use client"` hook): `useSyncExternalStore(noSubscribe, () =>
    guessApplyHidden(hasSessionCookie(document.cookie), readApplyHint(() => localStorage)), () => false)`
  - `RememberApplyHint({ hidden }: { hidden: boolean })`: client, `useEffect` → `writeApplyHint(() => localStorage,
    hidden)`, renders `null`
  - `DesktopNav({ showApply }: { showApply?: boolean })`, `BottomNav({ showApply }: { showApply?: boolean })` —
    `undefined` = guess mode (fallback)
  - Server components `DesktopNavForUser()` and `BottomNavForUser()` in `nav-for-user.tsx`: `await getApplyView()`,
    render the nav with `showApply={view === "form"}`; `BottomNavForUser` also renders
    `<RememberApplyHint hidden={view !== "form"} />` (once per page: the tab bar is in every layout render)

- [ ] **Step 1: Navs.** In both `*NavLinks`:
  - `showApply === false` → the `/apply` item is not rendered; the tab bar uses `grid-cols-4`.
  - `showApply === undefined` → render all items; the `<nav>` gets `data-apply-hidden={hidden ? "" : undefined}`
    (`hidden` from `useApplyHiddenGuess()`) and `suppressHydrationWarning`, followed directly by
    `<InlineScript html={applyHintScript} />` (the script targets its previous sibling, so it must come right after the
    `<nav>`); CSS: the `/apply` item hides and the grid becomes `grid-cols-4` when the `nav` has `data-apply-hidden`
    (Tailwind `group` + `group-data-[apply-hidden]:…`).
  - Every rendered `/apply` link gets `data-apply-link` (E2E hook).
  - The existing pathname `<Suspense>` inside each nav stays; the guess mode applies in both its fallback and its
    content (they render the same `*NavLinks`).
- [ ] **Step 2: Wire up.** `SiteHeader`: `<Suspense fallback={<DesktopNav />}><DesktopNavForUser /></Suspense>`.
  Layout: same for `BottomNav` / `BottomNavForUser`. Nothing awaits at the top of the layout.
- [ ] **Step 3: Verify** `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm build` → pass (the build validates
  the Cache Components rules).
- [ ] **Step 4: Quick browser check** (`pnpm start -p 3123`, signed out and as `member@test.local`, 390px and
  1280px): visitor 5 tabs + desktop link; member 4 tabs, no desktop link; no "Encountered a script tag" console error
  on a language switch.
- [ ] **Step 5: Instant-navigation dev check** for the new layout boundaries (`docs/learnings/nextjs.md`); note
  anything unexpected in learnings.
- [ ] **Step 6: Commit** `feat(nav): hide Başvur from members and open applicants`.

### Task 4: Home hero

**Files:**
- Create: `src/components/apply/hero-apply.tsx`
- Modify: `src/app/[locale]/page.tsx`

**Interfaces:**
- Consumes: `useApplyHiddenGuess`, `applyHintScript`, `getApplyView`, `ApplyLink`
- Produces:
  - `HeroApplyGuess({ className, children })` (client): the plain `Link href="/apply"` with `data-apply-link`,
    `data-apply-hidden={hidden ? "" : undefined}`, `suppressHydrationWarning` and a `data-[apply-hidden]:hidden`
    class, followed by `<InlineScript html={applyHintScript} />`
  - `HeroApplyForUser({ className, children })` (async server): `view === "form"` → `<ApplyLink data-apply-link …>`,
    otherwise `null`

- [ ] **Step 1:** Replace the hero's current UTM `<Suspense>` with `<Suspense fallback={<HeroApplyGuess …>}>
  <HeroApplyForUser …></Suspense>` (one boundary; `ApplyLink` keeps the UTM params). "Etkinlikler" stays as is.
- [ ] **Step 2: Verify** lint, tsc, test, build → pass; browser: visitor sees both buttons, member only
  "Etkinlikler"; `/?utm_source=x` still carries the UTM params to `/apply` for a visitor.
- [ ] **Step 3: Commit** `feat(home): hide the hero's Başvur button from members and open applicants`.

### Task 5: Browser E2E, docs, full verification

**Files:**
- Create: `scripts/e2e/apply-nav-e2e.mjs` (separate from `nav-e2e.mjs`, which is about the progress bar)
- Modify: `scripts/e2e/README.md`, `docs/follow-ups.md`, `CLAUDE.md`, `docs/learnings/*` (only if something was
  learned)

Fixtures (per `scripts/e2e/README.md`, local email sign-in): visitor, `member@test.local` (active),
`pending-noapp@test.local`, `pending-app@test.local` (its linked application must be `new` or `contacted`; check and
fix with `docker exec … psql` like the other scripts).

- [ ] **Step 1: Write the script** (PASS/FAIL lines, exit code ≠ 0 on failure, style of `header-e2e.mjs`). A frame
  logger installed with `evaluateOnNewDocument` records, on every animation frame where it changes: the number of
  visible `[data-apply-link]` in the bottom nav, the `x` of each visible bottom-nav link, the hero's visible
  `[data-apply-link]`, and (at 1280px) the visible desktop `[data-apply-link]`. Checks:
  - settled state, 390px and 1280px: visitor → 5 tabs, hero button, desktop link; member → 4 tabs, none;
    `pending-noapp` → 5 tabs + hero button; `pending-app` → 4 tabs, none
  - second load (answer stored by the first): exactly one recorded layout from first paint to settled, for all four
    fixtures, TR (`/`) and EN (`/en`)
  - language switch and back (member and `pending-noapp`, second load): still one layout across the re-shown fallback
  - visitor with `localStorage["rv-apply-hidden"] = "1"` set before load and no session: 5 tabs from the first frame
  - `localStorage` blocked (`evaluateOnNewDocument` making `localStorage` throw) as member: no page error, settled
    state correct
- [ ] **Step 2: Browser check, application submit** (Review Focus): as `pending-noapp@test.local`, submit an
  application through `/apply` (the `apply-e2e.mjs` helpers can fill it); expect "Başvur" gone from the tab bar after
  the success screen without a reload. Delete the application row afterwards (`docker exec … psql`, local only) so the
  fixture stays "no application". Script it as the last scenario of `apply-nav-e2e.mjs` if the helpers make that
  short; otherwise run it ad hoc and record the result in the final report.
- [ ] **Step 3: Run** `pnpm build && pnpm start -p 3123`, then `PUPPETEER_DIR=~/e2e-tools node
  scripts/e2e/apply-nav-e2e.mjs` → all PASS; `apply-e2e.mjs`, `header-e2e.mjs` and `nav-e2e.mjs` still pass;
  `skeletons.mjs` for `/` shows no new deltas.
- [ ] **Step 4: Docs.** `scripts/e2e/README.md`: entry for the new script and its fixtures. `CLAUDE.md`, after
  "Primary nav items live in `src/components/layout/nav-items.ts`.": "Başvur" is shown only when `/apply` would show
  the form (`applyView` / `getApplyView`); nav and hero guess from the session cookie + `rv-apply-hidden` until the
  answer streams in. `docs/follow-ups.md`: remove the "Hide "Başvur"…" item from "Next up"; add any deferred findings.
  Learnings entry for anything non-obvious met on the way.
- [ ] **Step 5: Full verification** lint, tsc, test, build → pass.
- [ ] **Step 6: Commit** `test(nav): browser E2E for the Başvur visibility; docs`.
