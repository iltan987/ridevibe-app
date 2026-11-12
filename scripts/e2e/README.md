# Local browser E2E scripts

Run against a **local** stack only (local Supabase + a server on port 3123); never against production.

- `e2e-lib.mjs` — helpers: `launch({ scrollbars, args })` (system Chrome, `CHROME_PATH` to override; `scrollbars: true` keeps
  classic scrollbars, hidden by default in headless; `args` = extra Chrome flags), `newPage()` (390x844, Turkish),
  `signIn(page, email)` (sets Supabase session cookies via email/password), `throttle()` (CDP network throttling).
  The keys in it are the public local-Supabase demo keys, not secrets.
- `nav-e2e.mjs` — navigation progress bar / pending dim checks (PASS/FAIL lines, exit code != 0 on failure).
  Needs a production build served on 3123: `pnpm build && pnpm start -p 3123`, `admin@test.local` and more than 25
  applications with status `new` (the list's default tab; the pager check needs a second page).
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
  Needs `member@test.local` (active, "Test Üye"), `second@test.local` ("Çelik Fixture", Beşiktaş + `side`, bike,
  birthday + Instagram shown), `nobirth@test.local` (active, no birth date), `pending-noapp@test.local`, and 26 more
  active profiles (29 active in total, so the pager appears); fixture recipe in the header of the script. It plants and
  removes bikes through `docker exec … psql` (`DB_CONTAINER`, local only). Screenshots go to `OUT_DIR`.
- `header-e2e.mjs` — `<head>` theme script across a language switch and an unknown path (theme kept, client-created
  script inert, no React "script tag" warning), theme sync to other tabs, no colour transitions on a theme switch,
  the user-menu skeleton (signed out: button; signed in: the avatar, photo kept on a language switch; language
  button doesn't jump), and no sideways header shift on `/apply` as a member (real scrollbars). Needs
  `member@test.local` (active, `avatar_url` = `<BASE_URL>/apple-icon.png`) for the signed-in part. Run against `pnpm dev -p 3123` (the warning is dev-only) and
  `pnpm start -p 3123`. `BASE_URL` overrides the server.
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
  background tab on `/members` to `/sign-in?next=…` (and makes no more than two RSC requests there), sign-in takes a
  tab on `/sign-in?next=/members` to `/members`, an account switch shows the new user, a frozen tab
  (`Page.setWebLifecycleState`) catches up, signed-in `?next=/sign-in` lands on `/account`, and a language switch
  moves other tabs (query kept) except `/apply` and `/account`. Needs `pnpm start -p 3123`, local email sign-in and
  two active users `member@test.local` and `second@test.local` whose names have different initials. `BASE_URL`
  overrides the server.
- `skeletons.mjs <baseUrl> <out.md> [routes…]` — measures each `data-skeleton` fallback against its
  `data-skeleton-result` (JS off vs on); see `docs/learnings/testing.md`.

`puppeteer-core` is deliberately **not** a repo dependency. Install it elsewhere and point the scripts at it:

    npm install --prefix ~/e2e-tools puppeteer-core
    PUPPETEER_DIR=~/e2e-tools node scripts/e2e/nav-e2e.mjs

The pending states of `skeletons.mjs` (`STATES=pending-noapp,pending-app`) need `pending-noapp@test.local` and
`pending-app@test.local`: create them like the other users (`docs/learnings/testing.md`, "Testing as a signed-in user
locally"), keep `profiles.status = 'pending'`, and link one application to `pending-app` via `applications.profile_id`.

Prerequisites (test users `admin@test.local` / `member@test.local`, seeded applications, email sign-in enabled locally):
see `docs/learnings/testing.md`.
