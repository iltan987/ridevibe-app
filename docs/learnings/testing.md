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
  `/account`: dialogs are closed, so the visible "Kaydet" submit buttons are location, blood type (while no consent is stored), visibility, photo consent in order (`saveNth` in `members-e2e.mjs`; `safety-e2e.mjs` picks the form via an element inside it instead).
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
- **Do:** compare full-width elements with `document.body` width, not `innerWidth` (`nav-e2e.mjs` "reduced motion").
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

### `beforeinstallprompt` fires only in the default browser context; re-dispatching a real one didn't work (2026-11-12)
- **Symptom:** in a `browser.createBrowserContext()` page the install event never fired (banner tests failed); a
  real event held back with `stopImmediatePropagation()` and re-dispatched with `window.dispatchEvent(held)` reached no
  listener.
- **Cause:** Chrome treats incognito-style contexts as non-installable. The re-dispatch is only *observed* (once), not
  a verified cause: the DOM spec says re-dispatching an event after its dispatch finished should work (follow-up:
  verify or drop).
- **Do:** use `browser.newPage()` (default context) and wipe cookies and site data between scenarios
  (`freshContext()` in `scripts/e2e/install-e2e.mjs`); to show the banner *after* load, release a synthetic event.
- **Source:** found by testing (install prompt).

### E2E in a background tab: streamed content stays unrevealed; freezing a tab (2026-11-12)
- **Symptom:** in the hidden tab of a two-tab test, the header still showed the user-menu skeleton and the streamed
  trigger had zero size seconds after `networkidle0`; the dropdown's portal (name label, `keepMounted`) didn't exist
  until `bringToFront()`.
- **Cause:** React's streaming runtime reveals a completed Suspense boundary with `requestAnimationFrame($RV…)`
  (`next/dist/compiled/react-dom-experimental/cjs/react-dom-server*.production.js`), and hidden tabs run no animation
  frames; the boundary's client components hydrate (and their effects run) only after that, so Base UI's portal and
  any `useEffect` inside streamed parts wait until the tab is first shown. Product consequence: see
  `docs/learnings/ui.md` (cross-tab state in late-mounting tabs).
- **Do:** read state in background tabs without visibility filters (e.g. the trigger's own text, not
  `getBoundingClientRect` or the menu label; `shownUser` in `scripts/e2e/cross-tab-e2e.mjs`), or `bringToFront()`
  first. To simulate a frozen background tab use CDP `Page.setWebLifecycleState` (`frozen` → `active`). To load a tab
  in the background, `bringToFront()` another tab before its `goto`. Seeding a cross-tab `localStorage` key with
  `page.evaluate` is itself a `storage` event for every other open tab (they may follow it and change cookies): seed
  before other tabs exist.
- **Source:** found by testing (cross-tab sync); React source above.

### Safety E2E: forms hold several submit buttons, fixtures need not be on page one (2026-11-13)
- **Symptom:** clicking "the" submit of the visibility form saved nothing (invalid-form message); a staff check found no
  card for a fixture once other active members existed.
- **Cause:** the visibility form also contains the one-time birth-date button (members without a date) as its first
  `button[type=submit]`; the directory sorts by name and pages at 25, so fixtures can be on page two.
- **Do:** pick the submit by its text (`Kaydet`) inside `closest("form")`; look fixtures up through `?q=` (plus
  `noContact`/`blood`) instead of the unfiltered first page. The blood-type consent checkbox is a `[role=checkbox]`
  (not a `button`), and its save button stays disabled until ticked, so `consentRequired` is unreachable from the UI.
- **Source:** found while writing `scripts/e2e/safety-e2e.mjs`.

### E2E for lists filtered in the browser: count server requests, check the next frame, emulate a phone (2026-11-13)
- **Need:** prove that typing, chips and pages make no server round trip and change the list at once.
- **Symptoms:** counting *every* request failed: Chrome re-requests the favicon (`/icon.svg`) on each History API URL
  change. A "next frame" check after a chip tap failed although the list looked instant (it was one frame late, a real
  bug: `docs/learnings/nextjs.md`, "URL as list state"). A pager width check at 390px reported 375px of room: plain
  headless Chrome reserves the 15px scrollbar gutter.
- **Do:** count only `resourceType() === "document"` and RSC fetches (`_rsc=` in the URL or an `rsc` header, which
  includes prefetches) — `watchServer` in `scripts/e2e/e2e-lib.mjs` (with `pagerFit` and `clearAndType`). Read the list in a `requestAnimationFrame`
  callback right after the action (`nextFrame`), and log the search box per frame to catch flips during zero-delay
  typing (`trackFrames`). For phone widths use `{ isMobile: true, hasTouch: true }` in the viewport: overlay
  scrollbars, `<body>` as wide as the screen (`scripts/e2e/lists-e2e.mjs`, widest pager). Measure fallbacks on a
  language switch back with `SWITCH_BACK=1 node scripts/e2e/skeletons.mjs …` (JS on, throttled).
- **Fixtures:** `lists-e2e.mjs` plants and deletes its own rows; `members-e2e.mjs` still needs exactly 29 active
  members (park `admin@test.local` for that run) and moves "Test Üye" to Beşiktaş, which `safety-e2e.mjs` resets.
  `cross-tab-e2e.mjs` reads avatar initials, so it failed ("?") while `member@test.local` had the photo
  `header-e2e.mjs` needs: a loaded photo replaces the initials. Clear `avatar_url` between the two.
- **Source:** found while writing the list-UX E2E.

### Signing in through the real `/auth/callback` locally: a PKCE magic link from Mailpit (2026-11-14)
- **Need:** test what the callback does after sign-in (a `deleting` account lands on `/account` whatever `next` says);
  the password cookie trick (`signIn`) skips the callback, and Google can't be automated.
- **Do:** `signInViaCallback(page, email, next)` in `scripts/e2e/e2e-lib.mjs`: `POST /auth/v1/otp?redirect_to=…`
  with our own `code_challenge` (S256) and `create_user: false`, read the link from Mailpit
  (`http://127.0.0.1:54324/api/v1/messages`, then `/api/v1/message/<ID>` → `Text`), fetch it with
  `redirect: "manual"` → `Location` carries `?code=`, set the cookie `sb-127-auth-token-code-verifier` =
  `"base64-" + base64url(JSON.stringify(verifier))` (what auth-js stores and `exchangeCodeForSession` reads), then open
  `/auth/callback?next=…&code=…`. Needs local email sign-in (`SUPABASE_AUTH_EMAIL_ENABLED=true`); the local
  `redirect_to` for port 3123 was accepted although the allow-list names `localhost:3000/**`.
- **Gotcha:** "X is not in the page" checks must load the page without `?q=X`: the search box echoes the query into
  the HTML (`scripts/e2e/deletion-e2e.mjs` checks `/admin/members` without `q`).
- **Source:** found while writing `scripts/e2e/deletion-e2e.mjs`; auth-js `getCodeChallengeAndMethod`.

### `node --test` strips types only: no constructor parameter properties in test fakes (2026-11-15)
- **Symptom:** `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX: TypeScript parameter property is not supported in strip-only mode`.
- **Cause:** Node's built-in TypeScript support only erases types; `constructor(private x: T)` would need code
  generation (likewise `enum` and `namespace`).
- **Do:** declare plain fields and assign them in the constructor (`FakeWindow` in
  `src/lib/pwa/install-store.test.ts`).
- **Source:** checked with `node` 24 (2026-11-15).

### A class field without an initializer exists on the instance: use `declare` for "absent" (2026-11-15)
- **Symptom:** a fake meant to lack a property still passes `"prop" in obj` checks.
- **Cause:** with ES2022 class fields, `prop?: T;` defines the property (value `undefined`); `declare prop?: T;` only
  types it.
- **Do:** `declare` optional fields a test must be able to leave out (`BeforeInstallPromptEvent` in
  `src/lib/pwa/install-store.test.ts`).
- **Source:** checked with `node` 24 (2026-11-15).

### Fetching an RSC payload in E2E: replay a captured request; district names also sit in public messages (2026-11-18)
- **Symptom:** `fetch(url, { headers: { RSC: "1", Cookie } })` returned 200 only because `fetch` followed a 307 to
  `/members?_rsc`; with `redirect: "manual"` the answer is 307 with an empty body, so a "no names in the payload"
  check could pass without having read the page. Also, the words "Kadıköy"/"Beşiktaş" appear in every page's HTML:
  the home-page copy ships as client messages.
- **Cause:** Next derives the `_rsc` cache-busting hash from the router headers and redirects a hand-made request.
  Public copy is not member data.
- **Do:** capture a real RSC request in the page (`page.on("request")` while `window.next.router.refresh()` runs),
  replay its URL and `rsc` / `next-router-*` headers with the session cookie and `redirect: "manual"`, and assert
  status 200, `text/x-component` and a string only that render holds. Prove an absence check can fail with a positive
  control (an allowed user's fetch must contain the names). Match member data by key (`district":"Beşiktaş`), not by
  the bare word (`scripts/e2e/probation-e2e.mjs`).
- **Also (2026-11-21):** `<NextIntlClientProvider>` in `[locale]/layout.tsx` ships *every* message to the client, so a
  gated page's labels ("Harita linki, iğne veya koordinat") sit in the HTML of a 404 too: check "the form isn't shown"
  with `document.body.innerText`, not `page.content()`.
- **Source:** found while fixing the review of the probation E2E; the messages note by testing (events Task 7).

### Per-frame layout logs see half-parsed HTML on throttled loads (2026-11-19)
- **Symptom:** `apply-nav-e2e.mjs` "second load, one layout" failed every run for phone TR fixtures that show
  "Başvur": `guess:4tabs@0/75/150/225 → guess:5tabs+B@0/75/150/225/300`, although the guess was right.
- **Cause:** with throttling the document arrives in network chunks, and the browser paints between them. A chunk
  ended inside the bottom tab bar (it follows `<main>` and the footer): 4 of 5 `<li>` parsed into a 5-column grid
  (a real 4-tab bar sits at 0/94/188/281). Only TR, because that is where the byte boundary fell on the current home
  page. The logger waited for the closing section and assumed everything else was parsed by then.
- **Do:** count a frame only once each element it reads is fully parsed: some node follows it or an ancestor, or
  `document.readyState !== "loading"` (`parsed()` in the frame logger). Before calling a layout check a product bug,
  log the element's child count and whether anything follows it.
- **Source:** found by instrumenting the frame logger (`<li>` count, grid columns, next sibling).

### Mutation-check a pgTAP file: did the assertions actually bite? (2026-11-21)
- **Symptom:** a new pgTAP file passes on its first GREEN run; that alone doesn't show the gate/check assertions
  would notice a broken rule (a wrong scope or a too-loose expected code passes silently).
- **Cause:** pgTAP files open their own transaction (`begin; … rollback;`), so a mutation can't simply be applied
  before them without touching the local schema.
- **Do:** pipe the file into psql inside an outer transaction that first breaks the rule, with the file's own
  `begin;` removed (its `rollback` then undoes the mutation too):
  `{ echo "begin;"; echo "alter policy \"…\" on public.events using (true);"; sed 's/^begin;$//' <file>; } |
  docker exec -i supabase_db_ridevibe psql -U postgres -At | grep -E "not ok|Looks"`. Expect the matching
  assertions as `not ok`.
- **Source:** found by testing (events Task 2: gate policy, venue URL check, constraint rename, unique position).

### Browser fixtures with "readable" ids like `00000000-0000-0000-0000-0000000000e1` 404 in the app (2026-11-21)
- **Symptom:** events planted by SQL with such ids rendered "Sayfa bulunamadı" for an organiser; no server error.
- **Cause:** Zod 4's `z.uuid()` checks the RFC 9562 version and variant digits (`…-4xxx-[89ab]xxx-…` for v4); version
  `0` fails, so `getEvent` returned null before querying. Postgres's `uuid` type accepts any hex. (pgTAP fixtures with
  such ids are fine: they never pass through Zod.)
- **Do:** give browser fixtures a valid version/variant: `00000000-0000-4000-8000-0000000000e1`.
- **Source:** found by testing (events Task 6, event page).

### E2E: pasting into a field; reading CSS-uppercased headings (2026-11-21)
- **Need:** test the event form's paste path (`onPaste` reads the clipboard text and resolves it at once) without a
  real clipboard; check that a page is the 404 page.
- **Do:** dispatch a real paste event inside the page: `const d = new DataTransfer(); d.setData("text/plain", text);
  el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: d, bubbles: true, cancelable: true }))` after
  `el.focus()`. React's `onPaste` receives it and `clipboardData.getData("text")` returns the text (headless Chrome;
  `paste()` in `scripts/e2e/events-e2e.mjs`). Typed text plus `Enter` covers the other read path.
- **Gotcha:** `innerText` applies `text-transform`: the 404 heading (`heading` utility, uppercase) reads "SAYFA
  BULUNAMADI", so `innerText.includes("Sayfa bulunamadı")` fails on a real 404. Compare the visible `h1`'s
  `textContent`; for "the form isn't shown" keep using `innerText` (messages ship in every page, see above).
- **Source:** found while writing `scripts/e2e/events-e2e.mjs`.
