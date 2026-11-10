# Local browser E2E scripts

Run against a **local** stack only (local Supabase + a server on port 3123); never against production.

- `e2e-lib.mjs` — helpers: `launch()` (system Chrome, `CHROME_PATH` to override), `newPage()` (390x844, Turkish),
  `signIn(page, email)` (sets Supabase session cookies via email/password), `throttle()` (CDP network throttling).
  The keys in it are the public local-Supabase demo keys, not secrets.
- `nav-e2e.mjs` — navigation progress bar / pending dim checks (PASS/FAIL lines, exit code != 0 on failure).
  Needs a production build served on 3123: `pnpm build && pnpm start -p 3123`. Screenshots go to `OUT_DIR` (default temp).
- `skeletons.mjs <baseUrl> <out.md> [routes…]` — measures each `data-skeleton` fallback against its
  `data-skeleton-result` (JS off vs on); see `docs/learnings/testing.md`.

`puppeteer-core` is deliberately **not** a repo dependency. Install it elsewhere and point the scripts at it:

    npm install --prefix ~/e2e-tools puppeteer-core
    PUPPETEER_DIR=~/e2e-tools node scripts/e2e/nav-e2e.mjs

The pending states of `skeletons.mjs` (`STATES=pending-noapp,pending-app`) need `pending-noapp@test.local` / `pending-app@test.local`, created via the recipe in `docs/learnings/testing.md`.

Prerequisites (test users `admin@test.local` / `member@test.local`, seeded applications, email sign-in enabled locally):
see `docs/learnings/testing.md`.
