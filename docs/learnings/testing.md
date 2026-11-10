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
