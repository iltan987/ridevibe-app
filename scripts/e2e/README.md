# Local browser E2E scripts

Run against a **local** stack only (local Supabase + a server on port 3123); never against production.

- `e2e-lib.mjs` — helpers: `launch()` (system Chrome, `CHROME_PATH` to override), `newPage()` (390x844, Turkish),
  `signIn(page, email)` (sets Supabase session cookies via email/password), `throttle()` (CDP network throttling).
  The keys in it are the public local-Supabase demo keys, not secrets.
- `nav-e2e.mjs` — navigation progress bar / pending dim checks (PASS/FAIL lines, exit code != 0 on failure).
  Needs a production build served on 3123: `pnpm build && pnpm start -p 3123`.
  Screenshots go to `OUT_DIR` (default temp).
- `members-e2e.mjs` — `/members` directory and `/account` profile editing (PASS/FAIL lines, exit code != 0 on failure).
  Needs `member@test.local` (active, "Test Üye"), `second@test.local` ("Çelik Fixture", Beşiktaş + `side`, bike,
  birthday + Instagram shown), `nobirth@test.local` (active, no birth date), `pending-noapp@test.local`, and 26 more
  active profiles (29 active in total, so the pager appears); fixture recipe in the header of the script. It plants and
  removes bikes through `docker exec … psql` (`DB_CONTAINER`, local only). Screenshots go to `OUT_DIR`.
- `theme-e2e.mjs` — `<head>` theme script with a stored light theme across a language switch and an unknown path
  (theme kept, client-created script inert, no React "script tag" warning). No sign-in or fixtures; run against
  `pnpm dev -p 3123` (the warning is dev-only) and `pnpm start -p 3123`. `BASE_URL` overrides the server.
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
