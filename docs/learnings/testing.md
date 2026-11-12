# Testing learnings

### Browser E2E without adding a framework to the repo (2026-11-07)
- **Do:** install `puppeteer-core` in the session scratchpad (not the project) and drive the system Chrome at
  `/usr/bin/google-chrome` (`--no-sandbox`, viewport 390×844 for phones, `Accept-Language: tr`).
- Quick checks without scripts: `google-chrome --headless=new --dump-dom` / `--screenshot` with
  `--virtual-time-budget=6000`. Headless Chrome is English unless `--accept-lang=tr`.
- **Gotcha:** never wait for text that may already be on the page from a previous step (a test "found" the old error
  banner and reported failure while the submit actually succeeded). Wait for the submit button to re-enable or for
  a state that only the new result produces.

### Clearing an `<input type="email">` in puppeteer (2026-11-09)
- **Symptom:** after `click({ clickCount: 3 })` + Backspace, typing appended to the old address (invalid email, the
  submit failed for the wrong reason).
- **Do:** `focus()`, then Ctrl+A, Backspace before typing.
- **Source:** found by testing.

### E2E: visiting `/en/...` makes later `/` visits English in the same browser (2026-11-10)
- **Symptom:** after checking `/en/apply`, a script loading `/apply` got the English form and English errors, although
  Chrome ran with `--accept-lang=tr`.
- **Cause:** next-intl remembers the chosen locale in the `NEXT_LOCALE` cookie and redirects `/` paths to it.
- **Do:** check each locale in a fresh context (`browser.createBrowserContext()`), or Turkish first; and always pass
  `--accept-lang=tr` + `Accept-Language: tr` for Turkish checks.
- **Source:** found by testing (conflict-question E2E).

### After a client navigation the previous page is still in the DOM, hidden (2026-11-09)
- **Symptom:** after switching TR → EN, a script saw "Türkçe" *and* "English" checked, and clicking "Türkçe" did
  nothing — it looked like the locale switch was broken (the design-system review reported it as a bug).
- **Cause:** with Cache Components, Next keeps the previous route mounted inside a hidden `<Activity>`
  (`display:none`) so Back is instant — even across locales (TR → EN is a soft navigation). Its open dropdown portal
  stays too. `querySelector` finds the hidden copy first; clicking its 0×0 rect hits nothing. Users never see it.
- **Do:** in E2E scripts query only visible elements (`getBoundingClientRect().width > 0`), and expect duplicate
  headers/landmarks in the DOM. (Re-tested this way: switching works both ways and `NEXT_LOCALE` stays in sync.)
- **Source:** found by testing (`window` marker survived the switch; `display:none` ancestor on the stale menu).

### Testing as a signed-in user locally (2026-11-07)
- Google OAuth can't be automated and local JWTs are ES256 (can't be minted). Workaround:
  1. `pnpm exec supabase stop && SUPABASE_AUTH_EMAIL_ENABLED=true pnpm exec supabase start` (temporary, env only)
  2. create users via `POST /auth/v1/admin/users` with the local secret key, `email_confirm: true`, a password
  3. set role/status with SQL (`docker exec supabase_db_ridevibe psql -U postgres …`)
  4. `POST /auth/v1/token?grant_type=password` → session; cookie via `@supabase/ssr` internals:
     `createChunks("sb-127-auth-token", "base64-" + stringToBase64URL(JSON.stringify(session)))`
     (`require` from the project's `node_modules/@supabase/ssr/dist/main/utils/…`)
  5. restart the stack normally afterwards (email sign-in off again).
- Local test users: see below (password `test-password-123`).

### Validating pure TS logic quickly (2026-11-07)
- `npx --yes tsx --tsconfig tsconfig.json script.ts` works (path aliases resolve). `pnpm dlx tsx` fails under
  pnpm 12 because esbuild's build script is blocked.

### Check access control per permission (2026-11-07, updated 2026-11-08)
- Every staff page: signed-out → sign-in redirect, member without the permission → 404, holder → content. Test with a
  role that has *only* the permission in question (create it in the UI as `admin@test.local`). The DB tests cover the
  same rules at the data level.
- Local test users: `admin@test.local` (admin role), `organizer@test.local` (Organizatör), `reviewer@test.local`
  (Başvuru Sorumlusu), `member@test.local`.
- Seed many rows (e.g. 30 pending users via `insert into auth.users … generate_series`) to test pagination
  (`PAGE_SIZE` = 25), then delete them.

### Smoke-testing production safely (2026-11-08)
- Preview deployments are behind Vercel login (puppeteer can't pass it without a bypass secret); production is public.
- **Do:** after merging, run the browser E2E against `https://ridevibe.com.tr` with an `@pgtap.invalid` email and a
  `utm_campaign=smoke-test`, verify the row via `POSTGRES_URL_NON_POOLING` (`docker run --rm postgres:17-alpine
  psql "$URL" …`), then delete it.

### pgTAP: planting rows that today's triggers would reject (2026-11-09)
- **Need:** test that an old row (e.g. a `+90` landline from before the mobile rule) stays editable.
- **Do:** as `postgres`, `set local session_replication_role = replica; update …; set local session_replication_role =
  origin;` — skips (non-`always`) triggers for that statement; CHECK constraints still apply. Unlike
  `alter table … disable trigger` it takes no table lock, so it is safe in `supabase test db --remote` runs. Works on
  the local stack as `postgres`.
- Column-level grant changes don't change `database.types.ts` (`pnpm db:types` yields no diff) — that's expected.

### Unit tests: `node --test` runs `*.test.ts` directly, no framework (2026-11-08)
- Node 24 strips TypeScript types natively and its default test glob includes `**/*.test.ts` → `pnpm test`.
- Limits: no path aliases (`@/…`) and imports need the `.ts` extension (`allowImportingTsExtensions` is on) →
  keep tested logic in dependency-free modules (e.g. `src/lib/auth/safe-next.ts`).
- **Source:** found by testing.

### Puppeteer clicks land on the fixed bottom tab bar (2026-11-09)
- **Symptom:** clicking an "Edit" button on a long admin page at 390×844 navigated to `/apply` instead.
- **Cause:** `ElementHandle.click()` only scrolls if the element is outside the viewport; a button just above the
  bottom edge sits under the fixed tab bar, which receives the click.
- **Do:** `el.evaluate((b) => b.scrollIntoView({ block: "center" }))` before `el.click()`. Also retry the first click
  on a fresh page until the expected element appears (it can land before hydration).
- **Source:** found by testing (Task 7 E2E).

### Seeded `auth.users.created_at` doesn't reach `profiles.created_at` (2026-11-09)
- **Symptom:** a pagination test over 30 seeded pending users was flaky: the order looked random.
- **Cause:** `handle_new_user` inserts the profile with `created_at = now()`, the same for every row of one
  `insert … generate_series`; keyset order (`created_at desc, id desc`) then falls back to random UUIDs.
- **Do:** after seeding, `update public.profiles p set created_at = u.created_at from auth.users u where u.id = p.id …`.
- **Source:** found by testing (Task 7 E2E).

### Measuring Suspense fallbacks: JavaScript off keeps the fallback visible (2026-11-10)
- **Symptom:** a skeleton's size can't be compared with its content in the browser: the fallback is replaced within
  milliseconds, and a screenshot or `getBoundingClientRect()` after load only sees the result.
- **Cause:** React streams Suspense content as a hidden `<template>` plus a tiny inline script that swaps it in. Without
  scripts nothing swaps: the fallback stays visible and the content waits in the template.
- **Do:** `page.setJavaScriptEnabled(false)`, load, measure the fallback root; then JS on + `networkidle0`, measure the
  result root (visible elements only: old routes stay hidden in the DOM). Mark both in the markup
  (`data-skeleton="name"` / `data-skeleton-result="name"`) and compare heights (pass: |Δh| ≤ 4px). Check the trick
  first (fallback visible, non-zero size). With JS off the inline theme script doesn't run: toggle `dark` on `<html>`
  via `page.evaluate` (still works) or note that heights didn't change between themes (they didn't here). Script:
  `skeletons.mjs <baseUrl> <out.md> [routes…]` (committed in `scripts/e2e/`, see its README for setup). Skeleton rule:
  copy the structure of the most common result (same Card, paddings, row/input heights, responsive heights like
  `h-10 md:h-9`), not one grey block.
- **Several roots per fallback / fragment results:** give each part its own name (`admin-chips`, `admin-row`,
  `detail-review`, …; the script takes the first visible element per name). A result that is a fragment has no box:
  wrap it in a `div` with the same `flex flex-col gap-6` as the parent and mark that wrapper. Compare also each
  element's `top`, not only heights: an optional paragraph (members pending hint, 4 lines on a phone) shifts everything
  below it even when every height matches.
- **Source:** found by testing (loading-states Task 6). Wrapping hints (`FieldDescription`) change heights between
  390px and 1280px, so measure both viewports.

### Members E2E fixtures: plant `side`, use `docker exec -i`, measure skeletons against a typical card (2026-11-10)
- **Symptom 1:** the "Avrupa" side chip showed 0 members and a fixture card showed "Beşiktaş" without "· Avrupa", although
  `district` was set. **Cause:** `profiles.side` is derived by the app (`updateLocation`), not by a trigger; profiles
  planted with SQL have `side = null` and count only in "Tümü". **Do:** set `district` *and* `side` in fixture SQL
  (`scripts/e2e/members-e2e.mjs` resets both for its test member).
- **Symptom 2:** `docker exec supabase_db_ridevibe psql … <<EOF` printed nothing and changed nothing. **Cause:** without
  `-i` docker does not forward stdin. **Do:** `docker exec -i`, plus `-v ON_ERROR_STOP=1` so a failed statement is loud.
- **Symptom 3:** `skeletons.mjs` reported `members-row` -24px. **Cause:** it measures the *first* visible row, which was
  the one fixture with bike + birthday + Instagram (114px; name+location only is 74px, plus one bike 94px). **Do:** make
  the first row (sort order) a typical card before judging; the skeleton mirrors name + location + one bike (94px).
- Puppeteer: `page.evaluate` can't take a `RegExp` (it arrives as `{}`): pass `source` and `flags`. Saving a section on
  `/account`: dialogs are closed, so the visible "Kaydet" submit buttons are location, visibility, photo consent in order.
- **Source:** found by testing (members Task 12).

### Members E2E on a DB with other active members; setting `type=date` values (2026-11-11)
- **Symptom:** the members E2E expects exactly 29 active members ("29 üye", 25 + 4 on the pager), but a local DB that
  wasn't just reset also holds seed members and iltan's admin.
- **Do:** instead of `db:reset` (wipes iltan's account), save the ids of the active non-fixture profiles to the
  scratchpad, set them `inactive` for the run, then set exactly those ids back to `active` and delete the fixtures.
- Date inputs: typing into `type=date` depends on the browser's locale (`mm/dd/yyyy` in headless Chrome). Set the value
  through the native setter + an `input` event inside `page.evaluate`, looking the input up by selector
  (`setInputValue` in `scripts/e2e/members-e2e.mjs`). Reusing an `ElementHandle` from `page.evaluateHandle` for this
  threw "Argument should belong to the same JavaScript world as target object" (cause not investigated).
- Polling with `page.evaluate` while a navigation is in flight throws "Execution context was destroyed" (the search
  step submits a form; seen twice in a row on 2026-11-11). `until()` in `members-e2e.mjs` treats that error as "not
  yet" and polls again.
- **Source:** found by testing (birth-date-once).

### E2E: hidden copies of the previous route, background tabs, catching short-lived states (2026-11-11)
- **Symptom:** after a language switch, `waitForSelector('[role=menuitemradio]…')` timed out or clicked "not
  clickable" nodes; in a two-tab test, clicks in the first tab hung (`Runtime.callFunctionOn timed out`); a skeleton
  that users clearly see never showed up in 10ms polling.
- **Cause:** Next 16 keeps the previous route's tree in the DOM, hidden (React `Activity`), so selectors match
  invisible duplicates. Background tabs don't take clicks. Polling via CDP is too slow for a fallback that lives one
  or two frames on a fast local server.
- **Do:** pick the visible element (`getBoundingClientRect().width > 0`, `visible()` in `header-e2e.mjs`);
  `page.bringToFront()` before clicking in another tab; log state per `requestAnimationFrame` inside the page
  (`evaluateOnNewDocument` for hard loads) and add latency with `throttle()` so fallbacks last long enough.
- **Source:** found by testing (user-menu skeleton fix).

### Headless Chrome hides scrollbars: layout shifts from scrollbars are invisible by default (2026-11-11)
- **Symptom:** a sideways header jump iltan saw on Windows didn't show up in any frame log.
- **Cause:** puppeteer launches headless Chrome with `--hide-scrollbars`.
- **Do:** `launch({ scrollbars: true })` in `scripts/e2e/e2e-lib.mjs` (drops that default flag; 15px classic
  scrollbars). Phone-width runs then also lose 15px, unlike real phones (overlay scrollbars).
- **Source:** found by testing (scrollbar-gutter fix).

### Importing app schemas into `node --test`: convert `@/` to relative `.ts` (2026-11-11)
- **Symptom:** `Cannot find package '@/lib'` when a `*.test.ts` imports `src/lib/applications/schema.ts`.
- **Cause:** Node has no path aliases; every module in the import chain must use relative paths with `.ts` extensions
  (`import type` is erased, so aliases there are harmless).
- **Do:** convert the chain (`schema.ts` → `../birth-date.ts`, `../istanbul-districts.ts`, `./contact.ts`, `./options.ts`).
- **Source:** found by testing (application steps Task 1).

### `find()` text filters match `textContent + aria-label`; `^…$` anchors then never match (2026-11-11)
- **Symptom:** the language-switcher click in `apply-e2e.mjs` silently did nothing (`^Dil: TR$` found no element), so the
  check failed for the wrong reason.
- **Cause:** the helper tests the regexp against the text content concatenated with the `aria-label` ("TR" + "Dil: TR").
- **Do:** anchor only the end for icon buttons with an aria-label (`Dil: TR$`); plain-text buttons ("Devam") can be anchored.
  Count default-checked radios (e.g. `city_choice`, step 4) out when asserting "nothing is selected" after a reset.
- **Source:** found by testing (apply steps Task 8).

### E2E: telling a guessing fallback from the streamed part; `scrollbar-gutter` in headless (2026-11-11)
- **Symptom 1:** every phone frame of `apply-nav-e2e.mjs` was classed as the static-shell guess, also long after the
  real tab bar had streamed in (desktop was fine).
- **Cause:** the check was "the nav is followed by a `<script>`" (the guess nav's apply-hint script). The streamed tab
  bar is the last element of `<body>`, so it is followed by Next's own streaming scripts too.
- **Do:** identify the fallback by its own script's content (`textContent.includes("rv-apply-hidden")`), not by tag.
  Prove a "nothing moves" check is meaningful: assert the guess was on screen first (throttle the load). The script
  also prints the first-load wrong-guess case (`pending-noapp`: 4 tabs → 5) in its PASS output as evidence that the
  logger sees changes; it is printed, not asserted.
- **Symptom 2:** `nav-e2e.mjs` "reduced motion: full width" got a 375px bar at a 390px viewport.
- **Cause:** `scrollbar-gutter: stable` on `<html>` reserves 15px on overflowing pages even in headless Chrome with
  hidden scrollbars; `innerWidth` and `document.documentElement.clientWidth` still say 390, `<body>` and fixed
  elements are 375.
- **Do:** compare full-width elements with `document.body` width, not `innerWidth` (follow-up for `nav-e2e.mjs`).
- **Source:** found by testing (hide-Başvur Task 5).

### `display-mode` can't be emulated in headless Chrome: stub `matchMedia` (2026-11-12)
- **Symptom:** `page.emulateMediaFeatures([{ name: "display-mode", value: "standalone" }])` (and the CDP
  `Emulation.setEmulatedMedia`) fails with "Unsupported media feature: display-mode" in Chrome 157, so an "installed
  PWA" state can't be tested the usual way.
- **Cause:** `display-mode` isn't an emulatable media feature in CDP.
- **Do:** replace `window.matchMedia` in `page.evaluateOnNewDocument` so `(display-mode: standalone)` returns an
  object with `matches: true` (plus no-op `addEventListener`/`addListener`), and pass other queries to the real one
  (`scripts/e2e/install-e2e.mjs`, `initScript`). Real `beforeinstallprompt` fires in headless Chrome with
  `--bypass-app-banner-engagement-checks` (`launch({ args })`); to stub `prompt()`/`userChoice` on the real event, add a
  capture-phase `beforeinstallprompt` listener in `evaluateOnNewDocument` (it runs before the page's own listener).
- **Source:** found by testing (install prompt).

### `beforeinstallprompt` fires only in the default browser context; a real event can't be re-dispatched (2026-11-12)
- **Symptom:** in a `browser.createBrowserContext()` page the install event never fired (banner tests failed); a
  real event held back with `stopImmediatePropagation()` and re-dispatched with `window.dispatchEvent(held)` reached no
  listener.
- **Cause:** Chrome treats incognito-style contexts as non-installable; a re-dispatched real event is ignored.
- **Do:** use `browser.newPage()` (default context) and wipe cookies and site data between scenarios
  (`freshContext()` in `scripts/e2e/install-e2e.mjs`); to show the banner *after* load, release a synthetic event.
- **Source:** found by testing (install prompt).
