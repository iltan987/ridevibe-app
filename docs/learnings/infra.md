# Infrastructure learnings (Vercel, domain, costs)

### Vercel project basics (2026-11-07)
- Project `ridevibe-app` (team `iltan-caners-projects`), Git-connected to `iltan987/ridevibe-app`; `main` →
  production, other branches → protected preview URLs (use `vercel curl <path> --deployment <url>` to bypass).
- Functions default to `iad1`; we pin `regions: ["fra1"]` in `vercel.ts` (next to the Frankfurt DB, EU). Verify with
  the `x-vercel-id: fra1::…` response header.
- Project defaulted to Node 26 → pinned `engines.node: "24.x"` (matches local).
- Hobby plan = personal/non-commercial only; taking payments in the app → Pro ($20/mo).

### `ridevibe.com.tr` DNS (2026-11-07)
- Registrar TürkTicaret; `.tr` registry = TRABİS (`ns*.ns.tr`). Nameservers must be **only**
  `ns1/ns2.vercel-dns.com` — the panel first *added* them next to `ns1-3.turkticaret.net`, so resolvers randomly got
  the parking IP `31.186.11.254`. Diagnose by asking each nameserver directly (Node `dns.Resolver`).
- Negative/old answers are cached (SOA minimum 3600 s); give `.tr` changes hours.
- `www` redirects (308) to the apex, set via `PATCH /v9/projects/{id}/domains/www.ridevibe.com.tr`.
- With Vercel DNS, all records (e.g. Resend email) can be added from the CLI.

### Email (2026-11-07)
- Resend's `onboarding@resend.dev` only sends to the account owner; real sending needs a verified domain. Supabase's
  built-in auth email is rate-limited and not for production. We avoid email entirely so far (Google sign-in,
  WhatsApp links).

### Free-tier limits that shaped the design (2026-11-07, updated 2026-11-25)
- Supabase Free: 500 MB DB, 1 GB storage, 5 GB egress, **no backups**, pauses after 1 week inactivity → a keep-alive
  cron (`vercel.ts` `crons` → `src/app/api/keep-alive`, entry "Vercel cron on Hobby" below) and our own encrypted
  backup before every production push (`pnpm db:push`, or `pnpm db:backup` alone; no nightly job: "Supabase Free plan
  has no automatic backups" below); media planned on Cloudflare R2 (10 GB free, free egress).
- Videos stay on WhatsApp (it doesn't store media long-term; phones pay the storage).

### Publishing the Google OAuth app (2026-11-08)
- "In production" requires app name, support email, **homepage URL and privacy policy URL** on an authorized domain
  (Branding page); the Publish button stays disabled until they're set. We use `https://ridevibe.com.tr` and
  `https://ridevibe.com.tr/privacy` (must actually be live). Basic scopes (openid/email/profile) need no Google review.
- Until published, only listed test users can sign in. After publishing anyone can — safe because new profiles are
  `pending` until an admin activates them.

### Vercel cron on Hobby + Supabase pausing (2026-11-08)
- Hobby: each cron job may run **once a day** (±59 min), but a project can have 100 jobs → schedule the same path
  several times a day (`vercel.ts` `crons`). Vercel sends `Authorization: Bearer $CRON_SECRET` (set in production
  only; crons only run on production).
- Supabase Free pauses after a week of too little "user database activity" (docs: "a few user requests to the
  database each day") → the cron calls `rpc("keep_alive")`, a real query through the Data API, not a health URL.
- **Source:** vercel.com/docs/cron-jobs/usage-and-pricing, manage-cron-jobs; supabase.com/docs/guides/platform/free-project-pausing.

### Checking production requests/crons from the CLI on Hobby (2026-11-08)
- **Symptom:** `vercel logs --since 1h` printed nothing useful; filtering hid the JSON error *"The hobby plan does not
  retain runtime logs for the requested time range"*. Default `runtime` logs were empty even for real traffic.
- **Do:** use CDN request records, max ~45 min back:
  `vercel --scope <team> logs requests --project ridevibe-app --environment production --json --since 45m -q 'requestPath:"/api/keep-alive"'`
  Fields are under `.data` (`timestamp`, `httpStatus`, `userAgent`); cron calls show `vercel-cron/1.0`. Free-text
  `-q` isn't supported for requests — use `field:"value"`. Never pipe CLI errors into a filter that can hide them.
- Verified 2026-11-08: keep-alive cron ran 19:17 UTC → 200.

### `vercel ls` prints its table to stderr; wait on the newest row only (2026-11-10, updated 2026-11-25)
- **Symptom:** a wait-for-deploy loop (`vercel ls … 2>/dev/null | grep Ready`) never saw "Ready" and ran until its
  timeout, although the deploy was ready after ~40 s.
- **Cause:** the Vercel CLI writes the deployments table (and its status column) to stderr, not stdout. Older
  deployments in the table already say Ready, so a plain `grep Ready` would match at once.
- **Do:** `vercel ls ridevibe-app --environment production 2>&1` (top row: Building → Ready). To wait for a deploy,
  test only the newest row: `vercel ls ridevibe-app --environment production 2>&1 | grep -m1 "●" | grep -qE
  "Ready|Error|Canceled"`.
- **Source:** found by testing (loading-states rollout).

### Supabase Free plan has no automatic backups (2026-11-14)
- **Need:** say in the privacy notice how long deleted data may survive in backups.
- **Fact:** "We automatically back up all Pro, Team, and Enterprise Plan projects on a daily basis" (Pro 7 days, Team
  14, Enterprise up to 30); Free projects are told to export with `supabase db dump` themselves. So deleted data
  leaves no backup copy today, and the notice says nothing about backups.
- **Do:** we back up ourselves before every production push (`pnpm db:push`, encrypted, 14 days, iltan's PC only;
  `docs/runbooks/database-backup.md`); notice §6 and the delete dialog name that window (2026-11-18). If the
  project moves to a paid plan, add Supabase's window too (`docs/follow-ups.md`, "Backups on a paid plan"). Some
  third-party pages claim Free has hidden backups; the docs don't say so — re-check the dashboard's Database →
  Backups page then.
- **Source:** supabase.com/docs/guides/platform/backups (checked 2026-11-14).
