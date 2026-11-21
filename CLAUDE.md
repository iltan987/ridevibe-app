@AGENTS.md

# Ride & Vibe — club platform

Web app (PWA) for Ride & Vibe, an Istanbul motorcycle club (founded 2026-11-01, ~140 members): applications, members,
events, announcements, photo galleries, attendance. Plan and decisions: `docs/PLAN.md`. Application form spec:
`docs/application-form.md`. Keep both up to date when decisions change. Club facts for public copy (rides, who can
join, rules, Samet's answers): `docs/content/home-page-questions.md`.

## Working agreement

- iltan is the engineer steering; Claude Code is the agentic tool. Work in small, reviewable iterations, explain
  decisions, and stop at decision points instead of building large chunks unasked.
- **Research before writing code.** Don't trust memory for library APIs: check the bundled docs
  (`node_modules/next/dist/docs/`, package READMEs/types), context7, or the web. Prefer current versions and patterns.
- **Learnings — read before, write after.** `docs/learnings/` holds everything discovered the hard way (library
  quirks, root causes of mistakes, workarounds, environment issues), one file per topic (index in its README).
  Before working in an area, read the matching file. Whenever you discover something non-obvious — by docs, by
  trial, or by fixing your own mistake — add an entry (symptom → cause → do) in the same commit as the work.
- **Workflow per iteration (superpowers):** design → `brainstorming` (spec, iltan approves) → `writing-plans` →
  `subagent-driven-development` with `test-driven-development` (pgTAP first for permissions) → `verification-before-
  completion` (format, lint, tsc, test, db:test, build, browser E2E) → `requesting-code-review` (+ `/security-review` for
  RLS/grant changes) → iltan reviews → merge. Small fixes skip design/plan. No git worktrees (one local Supabase DB);
  no PRs (local `--no-ff` merge). End of session: `claude-md-management:revise-claude-md`.
  Plans: a task that changes a shared type/schema also updates its consumers, so every commit passes tsc.
- **Follow-ups — read before, write after.** `docs/follow-ups.md` is the one backlog of everything consciously not
  done: open decisions, deferred features, parked edge cases, review minors, polish. Read it before planning. Every
  item deferred, parked or declared out of scope (incl. "minor (deferred)"/"parked" lines from review ledgers in
  `.superpowers/`, which are git-ignored and deleted after a plan) goes there in the same commit as the work, before
  any scratch workspace is deleted. Remove items when done or dropped.
- **Nothing project-related lives only on one PC.** Claude Code settings, permissions, plugins and auto memory are
  committed in `.claude/` (memory in `.claude/memory/` via `autoMemoryDirectory`); durable rules still belong here or
  in `docs/`. Final assets go into `docs/` (not `.superpowers/`, the Desktop or the scratchpad); only secrets stay
  out. New machine: README "New machine setup".
- **Fix the environment yourself** before calling it a blocker: e.g. Docker down → start
  `"/mnt/c/Program Files/Docker/Docker/Docker Desktop.exe" &` and wait for `/var/run/docker.sock`.
  `supabase start` "ports are not available" = Windows reserved the ports: quit Docker first, then admin
  `net stop winnat; net start winnat` (iltan runs it; with Docker running it hangs) or reboot (learnings/environment.md).
- **Remove dead code.** Unused exports, helpers, messages, flags and leftovers from replaced approaches go in the same
  change that makes them dead, unless there is a stated reason to keep them. Also do a periodic dead-code sweep
  (`docs/follow-ups.md`).
- **Missing tool → ask, never skip.** If a step needs something not installed (CLI, package, browser tooling), ask
  iltan to approve the install or to set it up; don't drop the step or swap in a weaker check.

## Git

- Author: `iltan <iltancanerr@gmail.com>` (set in local repo config).
- **Never add `Co-Authored-By` or any other co-author/attribution trailer to commit messages.**
- `main` = production. One short-lived branch per iteration (`feat/…`, `fix/…`, `chore/…`, `docs/…`); iltan reviews,
  then merge into `main` with `--no-ff`. Small doc/config tweaks may go straight to `main`.
- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`).
- Stage files by path; never `git commit -a` / `git add -A`: iltan's local `.claude/settings.json` change stays unstaged.
  The file also holds shared hooks: commit only your lines (`git hash-object -w` + `git update-index --cacheinfo`),
  merge without a checkout when `git switch` refuses (both recipes: docs/learnings/tooling.md).
- Never discard working-tree changes you didn't make: no `git checkout -- .`, `git restore .`, `git reset --hard`,
  `git stash` or `git clean`; undo your own edits file by file (a tree-wide checkout wiped iltan's local settings once).
  Subagent briefs repeat this rule.

## Commands

```bash
pnpm dev          # dev server
pnpm build        # production build (also validates Cache Components rules)
pnpm format       # Prettier (TS/JS/CSS/JSON + Tailwind class order); `format:check` only checks; Markdown/SQL by hand
pnpm lint         # ESLint, type-aware (~30–40 s); `lint:fix` applies the autofixes
echo '<code>' | pnpm exec eslint --stdin --stdin-filename src/lib/<existing-file>.ts   # probe a rule (a filename not on disk fails typed lint)
pnpm exec tsc --noEmit
pnpm test         # unit tests (node --test, *.test.ts)
                  # tested modules import relatively with `.ts` extensions (`node --test` can't resolve `@/`)
                  # scripts run directly by node (scripts/db/) are `.mts`; Supabase CLI prints JSON when stdout isn't a TTY
```

`git commit` runs a pre-commit hook (husky + lint-staged, `lint-staged.config.mjs`): `eslint --fix` then Prettier on
the staged files, fixes added to the commit, anything unfixable fails the commit (~20 s). It runs with `--no-stash`
(no backup stash, no hard reset; never remove that flag: see Git). Before every commit that touches code, also run
`pnpm lint && pnpm exec tsc --noEmit && pnpm test && pnpm build` (the hook lints only staged files, so a type change
breaking another file shows up only in the full `pnpm lint`); after committing, check what the hook changed
(`git show --stat`). No format-on-edit hooks in Claude Code (iltan): they rewrite lines just written and force re-reads;
the tools run only at commit time (subagents too).
Try git-hook or tooling changes in a throwaway clone in the scratchpad (`node_modules` symlinked, lockfile copied, then
`pnpm install --frozen-lockfile` in the real repo): `docs/learnings/tooling.md`.

```bash
pnpm db:start                 # local Supabase in Docker (Docker Desktop with WSL integration must be running)
pnpm db:reset                 # rebuild local DB from migrations (+ seed)
pnpm db:migration <name>      # generate a migration from supabase/schemas (review it!)
pnpm db:test                  # pgTAP tests in supabase/tests/database
pnpm db:types                 # regenerate src/lib/supabase/database.types.ts
pnpm db:push                  # production rollout: encrypted backup → dry-run → confirm (--yes) → push → pgTAP
pnpm db:backup                # encrypted production backup alone (--local: the local stack); runbook below
pnpm exec supabase migration up   # apply new migrations locally, keeping data (db:reset wipes auth users; after
                                  # an iteration that reset, restore iltan's local admin before browser review)
kill $(ss -ltnp | grep ':3123 ' | grep -oP 'pid=\K[0-9]+')   # stop a local server; never `pkill -f` (kills own shell)
PUPPETEER_DIR=~/e2e-tools node scripts/e2e/{nav,members,safety,header,apply,apply-nav,install,cross-tab,lists,deletion,events}-e2e.mjs   # browser E2E vs `pnpm start -p 3123` (setup: scripts/e2e/README.md)
node scripts/e2e/seo-check.mjs   # SEO head/robots/sitemap/JSON-LD check, no puppeteer; `BASE=https://ridevibe.com.tr` for production
# signed-in parts need fixture users (admin@/member@/pending-noapp@test.local) that `db:reset` wipes: recreate per README
# headless hides scrollbars (launch({ scrollbars: true }) keeps them); Next keeps the previous route hidden in the DOM: select visible elements
# members E2E needs only its fixtures active: park other active profiles, restore by id (docs/learnings/testing.md)
# background tabs: streamed parts stay unrevealed/unhydrated until first shown (React reveals via rAF) — no visibility
#   filters there; to load a tab in the background, bringToFront() another first; seed shared localStorage before other tabs exist
# throwaway spikes need no app code: `window.next.router` (refresh/replace/push) is callable from puppeteer page scripts
```

Signed-in local E2E needs email sign-in: `SUPABASE_AUTH_EMAIL_ENABLED=true pnpm exec supabase start` (temporary;
recipe and test users in `docs/learnings/testing.md`), then restart normally and delete the test rows:
`docker exec -i supabase_db_ridevibe psql -U postgres` (`-i`, or piped SQL is silently ignored), delete
`public.applications` then `auth.users` where the email ends in `@test.local` / `@fixture.invalid`.

## Database (Supabase)

- **Declarative schemas:** `supabase/schemas/*.sql` is the source of truth (files apply in name order). Never edit the
  DB via Studio or ad-hoc SQL. Workflow: edit schema file → `pnpm db:migration <name>` → review the generated file in
  `supabase/migrations/` → `pnpm db:reset` → `pnpm db:test` → `pnpm db:types` → commit schema + migration + types
  together. Data (DML) is not tracked by declarative schemas; write such migrations by hand.
- **Security model:** every table has RLS enabled **and** explicit grants: `revoke all … from anon, authenticated`, then
  grant only what is needed (column-level `update` grants for user-editable fields). Policies alone are not enough.
- Security-definer helpers live in the non-exposed `private` schema with `set search_path = ''` and fully qualified
  names. Use `(select auth.uid())` / `(select private.has_permission('…'))` in policies (evaluated once per query).
  Trigger functions in `private` fired by anon/authenticated writes must be `security definer` too.
  A `check` constraint can't call a `private.*` helper (it runs with the writer's rights): use a security-definer trigger.
- Conditional self-service writes (only once, only while null, only when active) need a `public` security-definer
  RPC with no target id: it writes `where profile_id = (select auth.uid())`, locks the row (`for update`), and is
  granted to `authenticated` only (example: `set_my_birth_date`).
- A function that checks rows and then acts on them in later statements (purges, last-admin guards) locks the set
  first (`select … order by id for update` into an array, then filter by it); lock in one global order (by id).
- **Member data:** `profiles` is readable by active members only (no private columns there; ön alım members see the
  crowd view from `public.club_overview()` instead); `member_details`
  (birth date, Instagram, visibility flags, photo consent) and `member_motorcycles` are own row + `members.manage` only;
  other members' data only via the `public.member_directory` RPC. Birth date is read-only; members without one enter it
  once via `public.set_my_birth_date`. Directory visibility: birthday opt-out (iltan's decision), Instagram opt-in.
  Members can't edit `full_name`/`avatar_url` (staff: `set_member_name`). Names are tidied on insert only (`private.tidy_name`: Turkish rules, mixed case
  untouched); staff corrections are stored as typed. `avatar_url` follows the Google photo at each sign-in (trigger
  on `auth.identities`); after sign-up never read `raw_user_meta_data` — users can rewrite it via the Auth API.
- **Safety data:** `member_emergency_contacts` and `member_health` (blood type, written only via `set_my_blood_type` /
  `withdraw_my_blood_type_consent`) are own row only; others only via `member_safety_card` / the directory filters
  with `members.safety`. Every blood-type read/write is logged in `safety_access_log` (readable by admins only).
  RPCs that write `safety_access_log` are `volatile`; call each once per render.
- Turkish text in SQL: `lower/upper/ilike` mishandle `İ/ı` (`lower('İ')` = `i̇`) — sort with `collate "tr-x-icu"`;
  client search with `foldSearch` (`src/lib/search-fold.ts`).
- PostgREST caps every select and set-returning RPC at `[api] max_rows` (1,000) without an error: read longer lists in
  `.range()` chunks of `CHUNK_SIZE` with `readAll` (`src/lib/pagination.ts`), ordered totally (ending in `id`), and
  dedupe the joined chunks with `uniqueById` (rows can shift between the chunk requests).
- **Roles & permissions** (`supabase/schemas/05_roles.sql`): admins create roles and tick permissions
  (`public.permission` enum); each profile has at most one `role_id` (null = regular member). The built-in admin role
  (`roles.is_admin`) has every permission plus admin-only powers (editing roles, assigning roles). Only **active**
  members have rights. Helpers: `private.has_permission(p)`, `private.is_admin()`, `private.is_active_member()` (= full
  member: guards everything that exposes others), `private.is_club_member()` (active or probation: own-row writes
  only: bikes, emergency contacts, birth date once, blood type). A new feature must decide whether ön alım members
  get it (closed by default).
  Role changes only via `public.set_member_role()` (admins), status via `public.set_member_status()`
  (`members.manage`). App side: `can(user.access, p)`, `requirePermission()` / `requireAdmin()` in
  `src/lib/auth/`. A new permission = enum value + policy/RPC check + pgTAP test + `Admin.permissions.*` messages.
- **Staff notes** (`public.member_notes`, permission `members.notes`): append-only, author forced, 1–2,000 chars; read/add
  on non-deleting others; notes about admin-role holders: admins only; delete: admins only, never about oneself;
  nobody reads notes about themselves. Counts via the security-invoker view `member_note_counts`.
  KVKK art. 11 request: content + date by hand, never the author's name (PLAN.md "Access requests and staff notes").
- **Events** (`public.events` + `event_places`, `supabase/schemas/40_events.sql`, permission `events.manage`): release
  gate until the joining branch: RLS select for `events.manage` only (everyone else: "Çok yakında" on `/events`, 404
  on the rest). Writes only via `save_event` / `cancel_event` / `delete_event`. A place = point and/or venue link
  (Google place / Yandex org); a route link keeps only its destination (the origin is the sharer's position):
  pasted links are never stored or logged (`src/lib/events/place-input.ts`, `resolve-place.ts`).
- Status: `pending` / `probation` ("Ön alım") / `active` / `inactive` / `deleting`. Approval and staff manual
  activation start in `probation`; staff promote via `set_member_status` ("Tam üye yap"); the DB refuses
  pending → active. `profiles.status_changed_at` records the last change (moves into/out of `deleting` keep it).
  **Self-service deletion:** `request_my_account_deletion()`
  (refuses the last active admin, `hint = 'last_admin'`) saves `status_before_deletion` + `deletion_requested_at` and
  sets `deleting`: no rights, hidden from members **and staff** (every `members.manage` / `applications.view` path
  filters it; rejected applications stay visible); `cancel_my_account_deletion()` restores it. A new staff read path
  must exclude `deleting` profiles too (pgTAP). Staff RPCs (`set_member_status` / `_role` / `_name`) answer a
  `deleting` target as `P0002` "not found" (staff must not learn the state, the action maps it to `invalid`); setting
  the `deleting` status is `42501`.
- **Purge:** `private.purge_deleted_accounts(as_of)` (pg_cron job `purge-deleted-accounts`, `0 2 * * *` UTC) deletes
  accounts 14 days after the request from `auth.users`, with their non-rejected applications (linked or same sign-in
  email) and the person's `auth.audit_log_entries` rows (no FK; matched on `payload->>'actor_id'`; rows also hold the
  email in `actor_username` and the IP in `ip_address`).
  Approved applications of accounts that were `inactive` are kept unlinked with `applications.retained_until`
  (request + 1 year) and then deleted; a deleted ön alım account is handled like an active one (its approved application is deleted; only `inactive` keeps it for a year); a kept row never matches, links or activates anyone (every email-matching path
  skips `retained_until is not null`); `/admin/members` flags a returning pending account as `former_member`. The
  schedule is DML: a hand-written idempotent migration (`docs/learnings/supabase.md`).
  Generated migrations touching `90_ops.sql` may emit `cron.unschedule(...)`: delete that line.
  Drift check (after hand-editing an unpushed migration or a schema comment): `pnpm db:migration drift_check` must
  produce only that `cron.unschedule` noise; delete the generated file.
- Anything that decides which account becomes active (approve, `link_application`, editing the email of an approved
  application) requires `applications.decide`; `applications.profile_id` = the account an application belongs to.
  Linking targets pending accounts; approved applications may also go to an active account without one (attach only).
- Every permission rule gets a pgTAP test, including the "must fail" cases. pgTAP also runs against production at
  rollout: scope every assertion to fixture ids/tokens, never to real rows.
  Never update real rows either (not even inside the rolled-back test): if real data makes a case untestable, `skip()`.
- Generated migrations may DROP a replaced column before its data is copied: move the DROP to the end and add the
  hand-written data step in between. Seed rows the app relies on (e.g. built-in roles) go in the migration.
- Never put a `private.*` function in an index/default on a table that anon/authenticated write (it runs with the
  writer's rights → the public form breaks).
- New arguments via `create or replace` create an overload: make sure the migration drops the old signature (pgTAP: one
  row in `pg_proc`).

### Production (hosted Supabase `ridevibe-db`, ref `igqqicbfejhnsggfuydh`, Frankfurt)

- Provisioned via Vercel Marketplace (Free plan); env vars are injected into Vercel **production + preview** only.
  Local dev always uses the Docker stack. Preview deployments share the production database.
- **Migrations:** `pnpm db:push` (needs Docker, `vercel login`, gpg): backs up first (encrypted,
  `~/ridevibe-backups/`, 14 days), shows the dry-run, pushes after a y/N (Claude: `--yes` once iltan said go), then
  runs pgTAP against production. Remote CLI writes (`db push`, `db reset`, `db query`, `db pull`, `migration up/down/repair/squash`, `seed`)
  are blocked for Claude by a hook (`db push --dry-run`, `db query --read-only` allowed).
  Backups, the key and restoring: `docs/runbooks/database-backup.md`. Other tools needing the URL: `vercel env pull
  --environment=production <file outside the repo>` (`POSTGRES_URL_NON_POOLING`) and delete the file afterwards.
  Decrypting a backup needs iltan's gpg passphrase cached first (iltan runs one `gpg --decrypt` in their terminal).
- Changing app data on production (e.g. role permissions): an idempotent hand-written data migration, never ad-hoc SQL.
- **Investigating production data:** read-only psql only (`set default_transaction_read_only = on`, see below)
  or `supabase db query --remote=<url> --read-only`, select the fewest columns (mask emails), never write personal data into the repo or logs.
- **Deleting an account:** members delete their own account on `/account` (14-day grace, purge job above). The manual
  path below is for staff-requested deletions only: only on iltan's explicit OK; `pnpm db:backup` first; check
  status/role/linked application and `applications.reviewed_by`, then delete the person's non-rejected applications
  first (an inactive person's approved application: keep it with `retained_until` = now + 1 year instead), or ask
  them to use the self-service flow: a remaining approved unlinked application would otherwise re-activate them on
  their next sign-in.
  Then `DELETE {SUPABASE_URL}/auth/v1/admin/users/<id>` with `SUPABASE_SECRET_KEY`
  (cascades profile, member_contacts, member_details, member_motorcycles, member_emergency_contacts and
  member_health; applications become unlinked, `reviewed_by` → null; `safety_access_log` rows stay with actor/target
  null) and also delete the person's `auth.audit_log_entries` rows (no FK; match `payload->>'actor_id'`).
  Their access token stays valid up to 1 h; the app shows them signed out because the profile
  row is gone (`getCurrentUser`). Use `getCurrentUser()`, not bare `getClaims()`, wherever "who is signed in" matters.
- **Removing or replacing a website photo** (consent withdrawn, or replaced for editorial reasons): (1) remove/replace
  the file in `src/assets/home/` and its use, merge, deploy; a replacement always gets a NEW file name; (2) purge the
  old path from history in a fresh clone (recipe: `docs/learnings/tooling.md`, "Scrubbing text from history"):
  `git filter-repo --path src/assets/home/<old-file> --invert-paths` (a same-named replacement would be deleted too);
  save its "NOTE: First Changed Commit(s)" lines; check for forks (`gh api repos/iltan987/ridevibe-app --jq
  .forks_count`: forks keep the photo, only their owners can remove it), force-push `main` (one-off exception to
  merge-only, iltan approves; other clones re-clone); (3) the repo is **public**: GitHub serves the orphaned commits by
  SHA until purged, so iltan opens a ticket at support.github.com (removing sensitive data: personal data, consent
  withdrawn) with owner/repo, the number of affected pull requests (0: we merge locally) and the First Changed
  Commit(s); Support garbage-collects the orphaned commits and cached views. Clones made while the photo was public
  can't be recalled; (4) old Vercel deployments: checked
  2026-11-13, `*.vercel.app` URLs redirect to Vercel login (Protection on), so no action; re-check a production and a
  preview URL (`curl -sI`, 302 = protected; may differ per environment); (5) if the old image URL still loads on
  ridevibe.com.tr, purge the cached image (`invalidate_by_src_images` / dashboard); (6) Search Console → "Remove
  outdated content"; (7) originals and unused photos never enter the repo. Consent proof (WhatsApp message) stays with
  the club, outside the repo.
- **Auth/config as code:** production overrides live in `[remotes.production]` in `supabase/config.toml`. Always run
  `pnpm exec supabase config diff --remote=igqqicbfejhnsggfuydh` and review before `config push --remote=… --yes`.
  Local defaults must not leak into production — pin hosted values in the remote block when the diff shows them.
- Google OAuth creds: `GOOGLE_LOCAL_*` / `GOOGLE_PROD_*` in the root `.env` (git-ignored). Never name config env vars
  `SUPABASE_*` — the CLI lets those override every config value, including remote blocks.
- Functions run in `fra1` (`vercel.ts`), next to the database.
- Rollout: merge → `pnpm db:push` (backup, dry-run, push, pgTAP) → push `main` (Vercel deploys). If the
  migration removes something old code uses, push `main` immediately after. Don't push branches with schema changes
  for a preview first: previews use the production DB.
  Adding a column to an RPC's return type doesn't break old callers (PostgREST returns it, old JS ignores the key,
  e.g. `pending_application_flags` gaining `former_member`); removing, renaming or retyping one does, until the deploy
  is Ready. Pushing `main` right after `db push` is fine either way.
  Changing an RPC's arguments: the old overload can't stay beside the new one when both accept the same named args
  (PostgREST can't choose), so pages calling it error until the deploy is Ready: tell iltan, pick a quiet hour.
- **pg_cron on production** (read-only checks): `select jobname, schedule, active from cron.job` (expect
  `purge-deleted-accounts` / `0 2 * * *`) and `select status, return_message, start_time from cron.job_run_details
  order by start_time desc limit 5` (the purge also prunes run history older than 30 days).
- After a `db push` that adds functions: run a read-only `has_function_privilege('anon' / 'authenticated', …)` check
  on production. Column-level grants (e.g. `insert (profile_id, body)`) read `false` in `has_table_privilege`: use
  `has_column_privilege`.
- Before `db push`, run read-only checks for anything a new constraint/unique index could reject:
  `docker run --rm postgres:17-alpine psql "$URL" -c "set default_transaction_read_only = on" -c "<query>"`.
- A migration that rewrites production data gets a read-only preview in `scripts/sql/` (pg_temp copies of new
  functions, rolled back, so it runs *before* the push); iltan runs it in their own terminal, never via `!`.
- New column the form writes: nullable in the DB (old rows), required in Zod; `db push` before pushing `main`.
- Deploy status: `vercel ls ridevibe-app --environment production 2>&1` (prints to stderr; top row: Building → Ready).
  To wait, test only the newest row (`… | grep -m1 "●" | grep -qE "Ready|Error|Canceled"`): older rows already say
  Ready.
- After a deploy that touches metadata, pages or images: `BASE=https://ridevibe.com.tr node scripts/e2e/seo-check.mjs`.
- Check crons/requests: `vercel --scope <team> logs requests --project ridevibe-app --environment production --json
  --since 45m -q 'requestPath:"/api/keep-alive"'` (Hobby keeps < 1 h; fields under `.data`).

## Stack & conventions

- **Next.js 16 App Router** with `cacheComponents`, `partialPrefetching` and React Compiler enabled. Request-time data
  (`cookies()`, `headers()`, session) must sit behind `<Suspense>`; never await it at the top of a layout.
- `proxy.ts` (not `middleware.ts`) runs next-intl locale routing.
- **i18n (next-intl):** locales `tr` (default, served at `/`) and `en` (at `/en`). Turkish (`messages/tr.json`) is the
  source of truth for message keys and types; every key must exist in `messages/en.json` too
  (`src/app/messages-parity.test.ts`). No hard-coded UI strings.
  Use `Link`, `redirect`, `useRouter`, `usePathname` from `@/i18n/navigation`, not from `next/*` (exception: a stored
  full path such as `?next=` already has its prefix → `redirect` from `next/navigation`, `docs/learnings/next-intl.md`).
  Locale on the server comes from `next/root-params` (see `src/i18n/request.ts`). Time zone: `Europe/Istanbul`.
  `/` is Turkish on a first visit: `proxy.ts` pins `accept-language` to `tr` for next-intl (so no page or action sees
  the visitor's real header); an explicit choice lives in `NEXT_LOCALE` (1 year).
  Dev quirk: `pnpm dev` (Turbopack) may keep serving stale `messages/*.json` after edits (`MISSING_MESSAGE`) —
  restart the dev server before assuming a missing key.
  Never CSS-`uppercase` English/brand words on Turkish pages (`i → İ`, "RİDE & VİBE"): use `Wordmark` or write the
  capitals in the source (`docs/learnings/ui.md`).
  Register: UI copy says "sen"; the privacy notice (`privacy/content-*.tsx`) says "siz". Any notice text change bumps
  `PRIVACY_NOTICE_VERSION` (stored with each consent) — once per release: a version not yet deployed absorbs more edits.
  Turkish copy must read native: check everyday connotations ("kahvede" = old men's tea house, "sohbet" = religious
  gathering) and leave out the obvious or transactional ("ücretsiz", who pays); offer 2–3 options for headlines.
- **SEO:** public pages build metadata with `pageMetadata()` (`src/lib/seo/`) and pass `(await parent).openGraph?.images`
  (a page's `openGraph` replaces the layout's share-image file); unfinished pages get `index: false`; a new indexable
  page goes into `src/app/sitemap.ts`. Verify with `scripts/e2e/seo-check.mjs` (`docs/learnings/seo.md`).
  One-off image work (resize, JPEG): sharp from Next's own dependency
  (`require(require.resolve('sharp', { paths: [require.resolve('next', { paths: [process.cwd()] })] }))`, run from
  the repo root), never a new package. Partial blur: `docs/learnings/environment.md`.
- **UI:** Tailwind CSS 4 + shadcn/ui (`base-nova` style, built on Base UI). Base UI composes with the `render` prop,
  **not** `asChild`. For links that look like buttons use `buttonVariants()` on `Link`. `cn` comes from the `cn`
  package (re-exported in `@/lib/utils`). Add components with `pnpm dlx shadcn@latest add <name>`.
- **Design system** ("Gece + turkuaz", `docs/design/README.md`): palette tokens live in `src/app/globals.css` (hex,
  contrast-tested by `globals-contrast.test.ts`; re-run `pnpm test` after changing values); `heading` / `eyebrow`
  utilities; orange text uses `text-accent-text`, not `text-primary`. Brand: `Wordmark` / `ClubBadge`
  (`src/components/brand/`). Theme: dark default via `src/lib/theme.ts` + inline head script, switcher in the header
  only; never read cookies for theme (keeps routes static).
  A section that must stay dark in both themes (home hero, closing) carries the `dark` class: tokens and `dark:` re-resolve.
  Condensed display headings (`font-stretch`) reflow at the font swap (the fallback is never condensed): use fixed
  lines that never wrap (`t.rich` + `whitespace-nowrap` spans) sized by viewport (`docs/learnings/ui.md`).
- **Loading states:** a new page's skeleton copies the structure of what replaces it (`data-skeleton` /
  `data-skeleton-result` attributes, measured with JS off: `docs/learnings/testing.md`, `scripts/e2e/`); links from
  `@/i18n/navigation` already show pending feedback (progress bar + dim, or the page's skeleton when its shell is
  prefetched); no `loading.tsx` unless the dev instant-navigation check flags the segment (`docs/learnings/nextjs.md`).
  A language switch remounts the `[locale]` layout and re-shows fallbacks: test skeletons on a switch *back* too.
  Session-dependent fallbacks take their shape from `hasSessionCookie()` (`src/lib/auth/session-hint.ts`), never a
  server read; when the shape depends on more than signed-in/out, also remember the last streamed answer in
  `localStorage` (pattern: `src/lib/applications/apply-hint.ts`). Inline scripts only via `InlineScript`
  (`src/components/inline-script.tsx`); a hint script marks the element it sits in (the apply hint: first child, marks
  `parentElement`; the session hint still marks its previous sibling), so render it in every Suspense copy
  (`docs/learnings/ui.md`).
- Client-only reads (localStorage, user agent) via `useSyncExternalStore(noSubscribe, client, server)` or a `useState`
  initializer after a hydration key; never `setState` in an effect (React Compiler lint).
- Application form (`/apply`): a new question goes into the Zod schema **and** a step in
  `src/lib/applications/steps.ts` (test: every field in exactly one step). Steps 1–3 are kept in the browser draft:
  contact data and consents belong in step 4 only.
- WhatsApp links: `whatsAppUrl()` (`src/lib/applications/contact.ts`, `api.whatsapp.com/send`), never `wa.me` —
  its desktop redirect turns emoji into "�".
- Mobile-first: design for ~390px first; the bottom tab bar is the main navigation on phones.
- Cross-tab sync (`src/lib/cross-tab.ts`, one `localStorage` key per topic): `AuthSync` in `UserMenu` stores a hash of
  the user + server render time (`rv-auth`; newer render wins), other tabs `router.refresh()` and the server decides
  where they land; the language switcher stores a unique event per switch (`rv-locale`), other tabs follow (and catch
  up when shown late) except `/apply` and `/account` (unsaved form input). Stored values outlive sessions and
  background tabs hydrate late: never compare with "the stored value" alone (`docs/learnings/ui.md`). Theme syncs via
  its own `theme` key.
- PWA: manifest only, no service worker yet (Web Push comes with Events). Own install prompt: `src/lib/pwa/` +
  `src/components/pwa/`; `<InstallBanner />` floats (its spacer is portaled after the footer) on `/account`
  (active/pending/probation) and `/members` (active/probation): add it to a member home page when one exists.
- Primary nav items live in `src/components/layout/nav-items.ts`. "Başvur" is shown only when `/apply` would show the
  form (`applyView` / `getApplyView`); nav and the home hero/closing buttons (`HomeApplyButton`; E2E anchors
  `data-home-hero` / `data-home-closing`) guess from the session cookie + `rv-apply-hidden` until the
  answer streams in; a signed-in submit hides it at once (`markApplySubmitted`, no `refresh()`).
- Server Actions: validate with Zod, let RLS decide, map error codes to results, call `refresh()` (`next/cache`)
  after a successful mutation (exception: `submitApplication`, whose success card a refresh would replace). They and
  Route Handlers can't read the locale root param — derive it from data.
  Any cookie write in an action (e.g. `auth.signOut()`) re-renders the page like `refresh()`: to keep a result
  screen, revoke via `auth.admin.signOut(jwt)` and clear cookies on a later navigation (`docs/learnings/nextjs.md`).
- `Date.now()` in an async Server Component after a session read (request-time) trips `react-hooks/purity`: use
  `// eslint-disable-line react-hooks/purity -- <reason>`, never move it into a helper to dodge the rule.
- **Write it so lint passes** (`eslint.config.mjs`, details in `docs/learnings/tooling.md`): no `as` casts (`as const`
  is fine), `!`, `any` or `@ts-*`: narrow with guards, parse outside data (FormData, JSON, RPC `jsonb`) with Zod
  (`formDataText` / `formDataTexts`, `oneOf` for option lists); template values are strings or numbers only; `String()`
  never on objects or FormData values; every promise is awaited or `void`ed on purpose; a disable names one rule and
  says why (`eslint-disable-next-line <rule> -- <reason>`), never blanket or file-wide; Tailwind classes are known,
  unique, non-conflicting and canonical (an override is a later `cn` argument).
- **Every list paginates and shows its total; never a silent cap** like `.limit(200)` (the club grew to ~130 members
  in two weeks). Lists people browse get numbered pages (`src/lib/pagination.ts`, `PagerButtons` / `PagerLinks`):
  either load fully on the server up to `LIST_CEILING` (2,000) with `readAll` and filter/page in the browser, failing
  loudly above it (`CeilingNotice`; `/members`, `/admin/members`; URL state via `useListParams`), or page on the
  server with offsets (`?page=N`, odd values → redirect) when a list grows without bound (`/admin/applications`).
  Search-and-pick results inside a dialog may instead "load more" with keyset cursors over a changing set
  (`findLinkableAccounts`). Access checks via `can()` / `requirePermission()`.
  A `Link` whose `href` follows live client state (search box, chips) needs `prefetch={false}`, or it prefetches
  on every change.

## Privacy (KVKK)

Personal data is regulated by KVKK. Collect only what a feature needs, keep consents separate and explicit (never
pre-ticked), treat blood type as special-category data, and never log personal data. See the KVKK section of
`docs/PLAN.md`.
Photos of people on the public site need their written consent for the website (the in-app photo consent covers
only the members' gallery); blur bystanders; never commit originals or unused photos (removal: Production section).
No lawyer review (iltan, 2026-11-13): research official sources (law text, KVKK Board decisions) and decide open KVKK
questions yourself; never park them as "ask the lawyer".
