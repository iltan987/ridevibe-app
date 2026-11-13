# Local browser E2E scripts

Run against a **local** stack only (local Supabase + a server on port 3123); never against production.

- `e2e-lib.mjs` — helpers: `launch({ scrollbars, args })` (system Chrome, `CHROME_PATH` to override; `scrollbars: true`
  keeps classic scrollbars, hidden by default in headless; `args` = extra Chrome flags), `newPage()` (390x844, Turkish),
  `signIn(page, email)` (sets Supabase session cookies via email/password), `throttle()` (CDP network throttling),
  `watchServer(page)` (counts document and RSC requests only; the favicon refetch on URL changes is ignored),
  `pagerFit(page)` (the visible pager's button row: one line, no overflow) and `clearAndType(page, text)` (the visible
  search box, zero-delay typing). The keys in it are the public local-Supabase demo keys, not secrets.
- `nav-e2e.mjs` — navigation progress bar / pending dim checks (PASS/FAIL lines, exit code != 0 on failure).
  Needs a production build served on 3123: `pnpm build && pnpm start -p 3123`, `admin@test.local` and more than 25
  applications with status `new` (the list's default tab; the pager check needs a second page). Recipe (local only;
  delete with `delete from applications where email like 'app%@fixture.invalid'`):

      docker exec -i supabase_db_ridevibe psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
      insert into applications (status, full_name, phone, email, birth_date, district, side, languages, license_class,
        riding_years, owns_motorcycle, riding_styles, group_experience, in_other_clubs, heard_from, event_interests,
        expectations, alienating_behaviors, conflict_handling, consent_privacy, consent_rules, privacy_notice_version)
      select 'new', 'Başvuru Fixture ' || g, '+90532' || lpad(g::text, 7, '0'), format('app%s@fixture.invalid', g),
        '1990-01-01', 'Kadıköy', 'asian', array['tr'], 'a2', 3, false, array['city'], 'some', false, 'friend',
        array['day_rides'], 'Fixture expectations', 'none', 'talk', true, true, 'e2e'
      from generate_series(1, 30) g;
      SQL

  Screenshots go to `OUT_DIR` (default temp).
- `apply-nav-e2e.mjs` — "Başvur" in the desktop nav, the phone tab bar and the home hero (PASS/FAIL lines, exit code
  != 0 on failure): settled state per fixture at 390px and 1280px, exactly one layout from first paint to settled on
  a second load (TR and EN) and across a language switch and back, a signed-out visitor with a stale stored `"1"`,
  `localStorage` blocked, and sending an application (signed in: "Başvur" gone without a reload; visitor: it stays;
  rows for `pending-noapp@test.local` / `apply-nav-e2e@test.local` deleted before and after via `docker exec … psql`,
  `DB_CONTAINER`, local only). It logs the visible tabs/links per animation frame (`evaluateOnNewDocument`) with
  throttling, so the static-shell guess is on screen long enough to be checked. Needs `pnpm start -p 3123`, local
  email sign-in and `member@test.local` (active), `pending-noapp@test.local` (pending, no application) and
  `pending-app@test.local` (pending, one linked application with status `new` or `contacted`). `BASE_URL` overrides
  the server.
- `members-e2e.mjs` — `/members` directory and `/account` profile editing (PASS/FAIL lines, exit code != 0 on failure).
  The directory part checks that search (zero-delay typing, folded Turkish letters), side chips and numbered pages
  change the list in the next animation frame with no document/RSC request and no skeleton, the URL holds only
  non-default state (`?q=%C3%A7el`, no `?` when cleared), reload and back/forward restore box, chip and page, odd URLs
  (`?page=99`, `?page=abc`, repeated `page`, unknown `side`, stale `cursor`) are corrected in place, the pager fits one
  row at 390px, `/en/members` keeps its prefix, and logs the `/members` document timing (INFO line).
  Needs `member@test.local` (active, "Test Üye"), `second@test.local` ("Çelik Fixture", Beşiktaş + `side`, bike,
  birthday + Instagram shown), `nobirth@test.local` (active, no birth date), `pending-noapp@test.local`, and 26 more
  active profiles (29 active in total, so the pager appears); fixture recipe in the header of the script. It plants and
  removes bikes through `docker exec … psql` (`DB_CONTAINER`, local only). Screenshots go to `OUT_DIR`.
- `safety-e2e.mjs` — safety data (PASS/FAIL lines, exit code != 0 on failure; each scenario in its own browser context):
  emergency contacts on `/account` (prompt card, add, limit of two, delete, re-add becomes the main contact, landline
  error), blood type with its own consent (save disabled until ticked, set, change, withdraw), plates (tidied to `34 ABC
  123`, shown in `/members`, hidden by "Plakalarımı göster"), a plain member (no safety controls, filter params ignored,
  no access-log rows), a `members.safety` holder (blood-type and "no contact" filters — no request while typing or
  tapping a chip; after an in-browser search the blood filter keeps `q`/`side` and logs one `filter_blood_type` row per
  navigation —, safety card with `tel:` and `api.whatsapp.com` links, blood type, plate even when hidden,
  `view_card`/`filter_blood_type` log rows) and an inactive member (delete and withdraw only). Needs `admin@test.local`
  (admin role), `member@test.local`, `second@test.local` (all active) and `inactive@test.local`; recipe in the script
  header. It plants and deletes contacts, blood types, bikes and access-log rows of these four users through `docker
  exec … psql` (`DB_CONTAINER`, local only), before and after the run. Works on a DB with other active members.
  Screenshots go to `OUT_DIR`.
- `header-e2e.mjs` — `<head>` theme script across a language switch and an unknown path (theme kept, client-created
  script inert, no React "script tag" warning), theme sync to other tabs, no colour transitions on a theme switch, the
  user-menu skeleton (signed out: button; signed in: the avatar, photo kept on a language switch; language button
  doesn't jump), and no sideways header shift on `/apply` as a member (real scrollbars). Needs `member@test.local`
  (active, `avatar_url` = `<BASE_URL>/apple-icon.png`) for the signed-in part. Run against `pnpm dev -p 3123` (the
  warning is dev-only) and `pnpm start -p 3123`. `BASE_URL` overrides the server.
- `apply-e2e.mjs` — the stepped `/apply` form: step-1 errors only, Enter acts as "Devam" (no POST), browser back, draft
  restore (conditional answers, steps 1-3 only, no contact data in `localStorage`), language switch and "Baştan başla",
  deep link `?step=4` jumping to step 1, writing minimum (15 characters), draft gone after a successful submit, and the
  "Google ile doldur" button (redirect carries `next=/apply?step=4`; hidden in Instagram's in-app browser). Needs
  `pnpm start -p 3123` and the local stack; writes one application for `apply-e2e@test.local` and deletes it before and
  after through `docker exec … psql` (`DB_CONTAINER`, local only). The last check (signed in: no Google button) needs
  email sign-in plus `pending-noapp@test.local` and prints `SKIP` otherwise. Screenshots (390px) go to `OUT_DIR`.
- `install-e2e.mjs` — the "install the app" prompt (PASS/FAIL lines, exit code != 0 on failure): banner and avatar-menu
  entry on `/account` and `/members`, `prompt()` called once and a dismissal remembered (also across tabs), iPhone
  Safari and Android Firefox guides, installed states (standalone via a `matchMedia` stub, stored flag), audiences
  (pending / inactive / signed out), banner layout at 390px, TR to EN switch, no hydration warnings. Uses the real
  `beforeinstallprompt` (Chrome flag `--bypass-app-banner-engagement-checks`) with `prompt()`/`userChoice` stubbed on
  the instance. Needs `pnpm start -p 3123`, local email sign-in and `member@test.local` (active),
  `pending-noapp@test.local` (pending) and `inactive@test.local` (status `inactive`; create it like the others, then
  `update profiles set status = 'inactive'`). `BASE_URL` overrides the server.
- `cross-tab-e2e.mjs` — cross-tab sync (PASS/FAIL lines, exit code != 0 on failure): sign-out in one tab sends a
  background tab on `/members` to `/sign-in?next=…` (and makes no more than two RSC requests there), sign-in takes a tab
  on `/sign-in?next=/members` to `/members`, an account switch shows the new user, a frozen tab
  (`Page.setWebLifecycleState`) catches up, signed-in `?next=/sign-in` lands on `/account`, a tab loaded in the
  background and shown after a sign-out refreshes (doesn't store its outdated user) and still follows the next sign-in,
  and a language switch moves other tabs (query kept; also when the store already holds that language; a tab loaded in
  the background catches up when shown) except `/apply` and `/account`. Needs `pnpm start -p 3123`, local email sign-in
  and two active users `member@test.local` and `second@test.local` whose names have different initials and no
  `avatar_url` (the check reads the avatar initials, which a loaded photo replaces; `header-e2e.mjs` needs a photo for
  `member@test.local`, so clear it between the two: `update profiles set avatar_url = null …`). `BASE_URL` overrides the
  server.
- `lists-e2e.mjs` — the admin lists (PASS/FAIL lines, exit code != 0 on failure): `/admin/members` tabs, search by
  name or email (tab counts follow the search) and pages in the browser with no document/RSC request, URL fixes,
  back, the widest pager (7 numbers + arrows) at 390px (360px as INFO), a status change that empties the last page
  (clamped to page 1, counts updated), `/en` prefix kept; `/admin/applications` server pages and redirects for odd
  `?page=` / `?status=` / stale `?cursor=`. Needs `pnpm start -p 3123`, local email sign-in and `admin@test.local`;
  pages are derived from the DB counts, and the activated row must be one of its fixtures (it fails otherwise);
  plants its own pending/inactive profiles and applications (`lx…@fixture.invalid`, recipe in the header) through
  `docker exec … psql` (`DB_CONTAINER`, local only) and deletes them before and after. Totals are read from the DB.
- `skeletons.mjs <baseUrl> <out.md> [routes…]` — measures each `data-skeleton` fallback against its
  `data-skeleton-result` (JS off vs on); `SWITCH_BACK=1` also logs the fallbacks shown during a language switch back
  (JS on, throttled); see `docs/learnings/testing.md`.

`puppeteer-core` is deliberately **not** a repo dependency. Install it elsewhere and point the scripts at it:

    npm install --prefix ~/e2e-tools puppeteer-core
    PUPPETEER_DIR=~/e2e-tools node scripts/e2e/nav-e2e.mjs

The pending states of `skeletons.mjs` (`STATES=pending-noapp,pending-app`) need `pending-noapp@test.local` and
`pending-app@test.local`: create them like the other users (`docs/learnings/testing.md`, "Testing as a signed-in user
locally"), keep `profiles.status = 'pending'`, and link one application to `pending-app` via `applications.profile_id`.

Prerequisites (test users `admin@test.local` / `member@test.local`, seeded applications, email sign-in enabled locally):
see `docs/learnings/testing.md`.
