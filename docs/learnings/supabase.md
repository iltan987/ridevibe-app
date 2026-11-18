# Supabase learnings

### CLI v3 (released 2026-11-02) differences that matter (2026-11-07)
- Local stack by default; every hosted change asks for confirmation (default **No**) → pass `--yes` non-interactively.
- `--db-url` is deprecated → `--remote=<postgres-url>` or `--remote=<project-ref>` (ref needs `supabase login`).
- **`SUPABASE_*` env vars override every config value, including `[remotes.*]` blocks** → never name our config env
  vars `SUPABASE_*` (we use `GOOGLE_LOCAL_*` / `GOOGLE_PROD_*`), or `config push` sends local values to production.
- `env()` in `config.toml` reads the **root** `.env` (not `.env.local`, not `supabase/.env`).
- **Source:** supabase.com/docs/guides/local-development/cli/migrating-to-v3, managing-config.

### Declarative schemas workflow (2026-11-07)
- **Do:** edit `supabase/schemas/*.sql` → `pnpm db:migration <name>` (`db schema declarative sync --no-apply`) →
  review → apply. Don't use `db diff` for this. Data (DML) isn't tracked — hand-write those migrations.
- Generated SQL is verbose (one REVOKE/GRANT per column, odd ordering) but correct; review the security lines.
- `ALTER TYPE … ADD VALUE` is split automatically into two migrations (`_1`, `_2`) because a new enum value must be
  committed before use. Keep both.

### `pnpm db:reset` wipes local auth users (2026-11-07)
- **Do:** to apply new migrations locally while keeping data/sign-ins, use `pnpm exec supabase migration up`.
  After a reset, sign in again and re-run the admin bootstrap SQL (README).
- **Symptom (2026-11-10, members):** after an iteration whose subagents ran `db:reset` many times, iltan's local
  `/members` said "you haven't applied yet": the sign-in had re-created their account as a fresh `pending` profile
  without a role. **Do:** at the end of any iteration that reset the DB, tell iltan and restore their local admin
  (status `active` + admin role) before handing over for browser review.

### Data API exposure: policies alone are not enough (2026-11-07)
- **Cause:** on existing/most projects new `public` tables get ALL privileges for `anon`/`authenticated` by default;
  RLS policies don't revoke grants.
- **Do:** per table `revoke all … from anon, authenticated`, then grant exactly what's needed; use column-level
  `grant update (col, …)` / `grant insert (col, …)` to protect sensitive columns (role, status, review fields).
- **Source:** supabase docs "Securing your API", "Grants vs. Policies".

### `current_role` is a reserved SQL word (2026-11-07)
- **Do:** don't name functions after SQL keywords (we once had `private.my_role()` for this reason).

### pgTAP tests must work on a non-empty database (2026-11-07)
- **Symptom:** tests passed on a fresh DB, failed once real users existed (`users_email_partial_key` duplicates,
  counts off).
- **Do:** fixture emails on `@pgtap.invalid`; scope every count/update/delete to fixture ids/emails; delete extra
  fixture rows right after their own test. Tests run in a rolled-back transaction, so they're safe on production.

### Server-side auth with `@supabase/ssr` (2026-11-07)
- **Do:** `getClaims()` (verifies the JWT), never `getSession()` on the server. Proxy: no code between
  `createServerClient` and `getClaims()`; copy cookies and cache headers (`setAll(cookies, headers)`) to the response.
- Cookie name locally: `sb-127-auth-token` (from the URL host's first label); value `base64-<base64url(session JSON)>`,
  chunked at 3180 chars (`.0`, `.1`).
- Local auth signs JWTs with **ES256** (private key), so test tokens can't be minted — see testing.md.

### Hosted project via Vercel Marketplace (2026-11-07)
- `vercel integration add supabase --billing-plan free --meta region=fra1 -e production -e preview --no-env-pull`
  (first time: accept terms in the browser at the printed URL). `--no-env-pull` keeps `.env.local` pointing at local.
- Injected env names include `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `POSTGRES_URL_NON_POOLING` (session pooler :5432 — fine for `db push`/`test db`).
- Project lives in a Vercel-managed Supabase org; `supabase login` (choose "Continue with Vercel") gives CLI access.

### `config push` would leak local defaults into production (2026-11-07)
- **Symptom:** first `config diff` also changed pooler size, TOTP MFA, email rate limits, vector storage.
- **Do:** always `config diff` first; pin hosted values in `[remotes.production]` for anything you don't intend to
  change. Undeclared properties are left untouched (v3).

### `supabase test db --remote=…` needs `--yes` in agent runs (2026-11-08)
- **Symptom:** `HostedMutationConsentRequiredError … Run pgTAP tests … Nothing was changed.`
- **Do:** after `db push`, run `supabase test db --remote=<url> --yes` (tests roll back; documented rollout step).

### Declarative sync drops columns before data can be migrated (2026-11-08)
- **Symptom:** the generated `roles_permissions` migration dropped `profiles.role` *before* creating `roles`, which
  would have lost every role assignment.
- **Do:** whenever a column/type is replaced, move the generated `DROP` to the end of the migration and add the
  hand-written data step (`INSERT …`/`UPDATE …`) in between; verify on local data with `migration up` before
  `db reset`. Seed rows the app relies on (e.g. the built-in admin role) belong in that migration.

### Column grants also apply to `id` in inserts (2026-11-08)
- **Symptom:** pgTAP `permission denied for table roles` when inserting `(id, name)` as an admin.
- **Do:** that's correct (`grant insert (name)`); in tests insert only granted columns and look rows up by name.

### PostgREST embeds: `table(count)` and many-to-one objects (2026-11-08)
- `select("…, profiles(count)")` returns `[{ count }]` per row (respects RLS); `role:roles(...)` via a FK column
  returns an object or null, typed correctly by generated types.
- Generated RPC arg types are non-nullable even when SQL accepts null (`set_member_role(…, null)`) → cast at the call.
- Return types too (2026-11-09): `my_application_status()` is typed `application_status` but returns null when there
  is no application; `linkable_accounts().email` is typed `string` but is null without a `member_contacts` row →
  treat RPC results as nullable in app code.

### Expression indexes run with the inserting user's rights (2026-11-08)
- **Symptom:** after adding `create index … on applications (private.normalize_email(email))`, the public form
  failed: `42501: permission denied for function normalize_email` (anon has no access to `private`).
- **Cause:** index expressions are evaluated as the role doing the INSERT/UPDATE.
- **Do:** never index a `private.*` function on a table that anon/authenticated write; only on tables written by
  security-definer code (e.g. `member_contacts`). The pgTAP "anon can submit" test caught it — keep such tests.

### pgTAP/SQL helper parameters can be shadowed by column names (2026-11-08)
- **Symptom:** every assertion returned the same unrelated row.
- **Cause:** in `language sql` function `profile_of(email text)`, `where u.email = email` compared the column to
  itself.
- **Do:** name parameters so they can't collide with columns (`user_email`, `target_id`).

### Same-event triggers fire in name order (2026-11-09)
- **Symptom (avoided):** a `before update` guard comparing `new.email` with `old.email` would have treated
  `RIGHT@x` → `right@x` as a change, because the normalising trigger (`applications_normalize_contact`) runs *after*
  `applications_check_decision`.
- **Cause:** PostgreSQL fires triggers of the same timing/event alphabetically by name.
- **Do:** in a guard trigger, compare the normalised value (`lower(trim(new.email))`), or name triggers so the
  normaliser sorts first.

### An embedded row hidden by RLS comes back as `null`, even though the FK is set (2026-11-09)
- **Symptom:** application detail showed "not linked" (and offered linking) for an application with `profile_id` set,
  for a decider without `members.manage`.
- **Cause:** the `member:profiles!applications_profile_id_fkey(...)` embed obeys profiles RLS; pending profiles are
  hidden from staff without `members.manage`, so the embed is `null`.
- **Do:** derive state from the FK column itself (`!!a.profile_id`); use the embed only for optional extras (name,
  status) and have a fallback label.
- **Source:** code review of Task 7, verified in the browser with a view+review+decide role.

### Turkish i-letters break `lower()`/`upper()`; trigger helpers need `security definer` (2026-11-10)
- **Symptom:** `lower('İ')` returns `i̇` (i + combining dot), `upper('i')` returns `I` not `İ`, so "ILKER"/"ilker"
  tidy to wrong names. Separately, a `before insert` trigger calling `private.*` helpers failed for anon with
  "permission denied for schema private".
- **Cause:** the DB case functions are not locale-aware by default; a trigger function runs with the writer's rights,
  and the helper call inside it is permission-checked (only the trigger function's own EXECUTE is skipped).
- **Do:** `translate()` the Turkish i-letters before case functions (`lower(translate(s, 'İI', 'iı'))`,
  `upper(translate(s, 'iı', 'İI'))`; non-Turkish: `translate(s, 'İ', 'I')` first). Make trigger functions that call
  `private.*` helpers `security definer` with `set search_path = ''`.
- **Source:** `supabase/schemas/02_names.sql`, Members Task 1.

### A tidy-on-update trigger overrides staff corrections (2026-11-11)
- **Symptom:** staff couldn't save "XYZ Lojistik" on production: it came back as "Xyz Lojistik".
- **Cause:** the name-tidy triggers ran `before insert or update of full_name`; `tidy_name` lowers every ALL-CAPS
  word, so "mixed case is left alone" only protected corrections without an ALL-CAPS word.
- **Do:** normalise user input on INSERT only when staff may later correct it on purpose; let staff updates store
  what they typed. Test the update path with the exact value that the normaliser would change.
- **Source:** `supabase/schemas/10_profiles.sql`, `20_applications.sql`, `tidy_name.test.sql`.

### Turkish sort order and search: ICU collation + `private.search_fold` (2026-11-10)
- **Symptom:** default collation sorts `Çelik`/`İlker` after `Z`; `ilike '%ilker%'` doesn't find `İlker` and
  `'%ISIK%'` doesn't find `Işık` (`ilike` doesn't fold `İ/ı`).
- **Do:** order with `collate "tr-x-icu"` (local PG 17 image has it; **check the hosted DB in rollout** before
  `db push`). Search with `private.search_fold(col) like '%' || escaped(private.search_fold(term)) || '%'`
  (`translate` of Turkish letters + `lower`); escape `\`, `%`, `_` in the term.
- **Also:** a plpgsql function can't have a parameter with the same name as an output column (`parameter name "side"
  used more than once`) → `member_directory` takes `side_filter`.
- **Source:** `supabase/schemas/30_member_directory.sql`, Members Task 5. **Update 2026-11-13:** directory search moved
  to the browser (`src/lib/search-fold.ts`, same fold) and `private.search_fold` was dropped; the recipe above still
  holds for any new SQL search.

### Previewing a data migration on production before its functions exist (2026-11-10)
- **Symptom:** the first name-tidy preview called `private.tidy_name(...)`, but rollout runs the preview *before*
  `db push`, when the function doesn't exist on production yet → it would just fail.
- **Cause:** a preview that reuses helpers from the migration depends on the migration.
- **Do:** make preview scripts self-contained: `begin;` → `create function pg_temp.f(...)` (exact copy of the schema
  body, with a "keep in sync" comment) → `set transaction read only;` → the select → `rollback;`. Functions in
  `pg_temp` are never found via `search_path`: always call them as `pg_temp.f(...)`. Switching to read-only after the
  DDL in the same transaction is allowed (only read-only → read-write is refused). Test it locally after dropping the
  real helpers inside the same rolled-back transaction. The preview's casing/ordering rules must match the migration's.
- **Source:** `scripts/sql/name-tidy-preview.sql`, members final review.

### Provider data after sign-up: trust `auth.identities`, never `raw_user_meta_data` (2026-11-11)
- **Symptom:** a trigger on `auth.users.raw_user_meta_data` would refresh the profile photo from Google, but any
  signed-in user can rewrite their own user metadata (`supabase.auth.updateUser({ data })`), so it would let a member
  show any URL (tracking pixel, offensive image) as their photo in the directory.
- **Cause:** on every OAuth sign-in of an existing account Supabase Auth updates **both** the identity
  (`identity.identity_data`, `last_sign_in_at`) and the user metadata (`external.go`, `AccountExists` branch →
  `UpdateUserMetaData`); only the identity row is out of the user's reach.
- **Do:** read provider data from `auth.identities` (`provider = 'google'`); `on_google_identity_avatar_changed`
  copies a changed `avatar_url` to `profiles` (`supabase/schemas/10_profiles.sql`). Sign-up still reads user metadata
  (`handle_new_user`) — safe only because email sign-up is disabled (`[auth.email] enabled = false`).
  The refresh needs a real Google sign-in; sessions last indefinitely (refresh tokens never expire, no time-box on
  Free), so most members only get it after signing out and in again.
- **Testing:** "profile not written" inside one pgTAP transaction: compare `ctid` (new on every row update);
  `now()`/`updated_at` don't change within a transaction.
- **Source:** github.com/supabase/auth `internal/api/external.go`; supabase.com/docs/guides/auth/sessions; found by
  design review.

### Deleting a user doesn't sign out their open browser (2026-11-11)
- **Symptom:** after `DELETE /auth/v1/admin/users/<id>` in production, the person's open tab still looked signed in
  after a refresh.
- **Cause:** with asymmetric signing keys (ES256), `supabase.auth.getClaims()` only verifies the JWT signature locally
  (JWKS); it calls the Auth server (`getUser`) only for HS* tokens. An access token can't be revoked, so it stays
  valid until `exp` (`jwt_expiry`, 1 h). The delete removes `auth.sessions` / refresh tokens, so the next refresh
  fails and the cookie is dropped then. The DB is safe meanwhile: rights hang on the (deleted) profile row.
- **Do:** don't read "verified claims" as "user exists". `getCurrentUser` (`src/lib/auth/user.ts`) treats a verified
  token whose own-profile lookup succeeds without a row as signed out (every account gets its profile in the sign-up
  transaction); a *failed* lookup keeps the user, so a DB hiccup doesn't sign people out. Code that needs the user id
  goes through `getCurrentUser()`, not bare `getClaims()` (`submitApplication` would link to the deleted id and fail
  on the `profile_id` FK). Rejected: `getUser()` per request (Auth round trip), shorter `jwt_expiry` (more refreshes
  for everyone), a profile lookup in the proxy (a DB query per request).
- **Source:** `@supabase/auth-js` `GoTrueClient.getClaims` (2.119.0); production check (no rows written afterwards);
  local repro: sign in, admin-delete, reload → still signed in before the fix, `/sign-in` after it.

### Cross-tab sign-in/out without a browser Supabase client (2026-11-12)
- **Need:** other open tabs should follow a sign-in, sign-out or account switch.
- **Cause:** `onAuthStateChange` needs supabase-js in the browser (~56 KB gzipped UMD, 2.119.0) for every visitor, and
  a browser client refreshes tokens itself, next to the proxy's refresh. Our sign-in/out run on the server only.
- **Do:** store `<short hash of the user id>@<server render time>` in `localStorage` (`rv-auth`,
  `src/lib/cross-tab.ts`, `AuthSync`) and `router.refresh()` in the other tabs when the stored user differs from the
  one they show (`storage` event, plus a re-check when a tab becomes visible or leaves the bfcache). The render time
  matters: a tab shown late mounts with an old render and must refresh instead of overwriting newer news (code
  review found this). No new dependency, ~1 KB.
- **Source:** spike 2026-11-12 (two Puppeteer tabs, production build).

### `max_rows` (1,000) silently truncates selects and set-returning RPCs (2026-11-13)
- **Symptom (risk):** a list that "loads everything" stops at row 1,000 with no error: `data` just ends.
- **Cause:** PostgREST caps every table select and set-returning RPC at `[api] max_rows` (`supabase/config.toml`: 1000;
  the hosted default is also 1,000). It applies to `rpc()` too, like a hidden `limit`.
- **Do:** read in `.range(from, to)` chunks of `CHUNK_SIZE` (= `max_rows`) with `readAll` (`src/lib/pagination.ts`):
  it stops at a short chunk or `LIST_CEILING` + 1 rows. `supabase.rpc(…).range()` is typed and becomes
  `offset`/`limit` on the function's output, so the query needs a total order ending in `id` (else chunks skip or
  repeat rows). Chunks are separate requests, so a row changing in between can still repeat at a boundary: pass the
  result through `uniqueById`. An RPC that logs (blood filter) logs once per chunk call: keep such results within one chunk.
- **Source:** spec `docs/superpowers/specs/2026-11-13-list-ux-design.md`; `loadDirectory` in
  `src/lib/members/queries.ts`.

### `.range()` past the last row is an empty page, not an error (2026-11-13)
- **Question:** a server-paged list (`/admin/applications`) runs its page query alongside the counts, before it
  knows whether `?page=` is past the end. Does a too-large offset fail (HTTP 416 "range not satisfiable")?
- **Cause:** supabase-js `.range(from, to)` sends `offset`/`limit` query parameters (not a `Range` header);
  PostgREST answers `200 []` for an offset past the end (checked locally up to offset 99,999,975).
- **Do:** run the page query in parallel with the counts and redirect afterwards when `serverPage` (`src/lib/list-url.ts`)
  flags the URL; no need to wait for the count first.
- **Source:** `postgrest-js` `range()` in `node_modules/@supabase/postgrest-js/dist/index.mjs`; curl against local
  PostgREST.

### pg_cron with declarative schemas: extension in the schema, schedule in a hand-written migration (2026-11-14)
- **Symptom:** the declarative diff handles `create extension if not exists pg_cron with schema pg_catalog;` but
  emits `CREATE EXTENSION "pg_cron";` (schema clause and `if not exists` dropped); the job itself is not in any schema.
- **Cause:** a schedule is a row in `cron.job` (DML), which declarative schemas don't track; the diff tool normalizes
  extension statements. Supabase documents `pg_catalog` as pg_cron's schema (the `cron` tables still live in schema `cron`).
- **Do:** keep the `create extension` line in `supabase/schemas/90_ops.sql`, then edit the generated migration back to
  `create extension if not exists pg_cron with schema pg_catalog;`. Schedule in a separate hand-written migration:
  `create extension if not exists …`, `select cron.unschedule(jobid) from cron.job where jobname = '…'`, then
  `cron.schedule(name, cron, command)`. Run it after the migration that creates the function. pgTAP can read
  `cron.job` (jobname, schedule, command). The job runs as the scheduling role (postgres); the purge function is
  security definer with no grants to anon/authenticated. Plain `pg_cron` needs no `shared_preload_libraries` change locally.
- **Source:** `supabase/migrations/*_purge_deleted_accounts.sql`, `*_schedule_purge_deleted_accounts.sql`.

### The declarative diff plans to unschedule pg_cron jobs, and a multi-statement job must lock first (2026-11-14)
- **Symptom:** the next generated migration contained `SELECT cron.unschedule('purge-deleted-accounts');` (and a
  `COMMENT ON EXTENSION` line): the diff sees the job in the local DB but not in the schema files.
- **Cause:** `cron.job` rows are data the schema doesn't declare. Separately, a job that runs several statements
  under READ COMMITTED lets a concurrent cancel commit between them.
- **Do:** delete any generated `cron.unschedule` line (and extension comment noise) from migrations. For purge-like
  jobs, `select … for update` the due rows into an array first and filter every statement by `= any(due)`.
- **Source:** `private.purge_deleted_accounts`, `*_purge_lock_due_accounts.sql`.

### `supabase.auth.signOut()` signs out every device by default (2026-11-14)
- **Symptom:** none visible at first: signing out in one browser also ends the sessions on the member's other devices.
- **Cause:** auth-js `signOut(options = { scope: 'global' })` revokes all refresh tokens of the user; `'local'` ends
  only this session, `'others'` all but this one. The access token (JWT) itself stays valid until it expires (≤ 1 h):
  `getClaims()` checks it locally, so a revoked user still reads as signed in until then (the app treats a deleted
  profile as signed out in `getCurrentUser`).
- **Do:** pass the scope explicitly. Account deletion wants `global` (`admin.signOut(jwt, "global")`, see
  `docs/learnings/nextjs.md`); the header's sign-out (`src/lib/auth/actions.ts`) uses `{ scope: "local" }` (since
  2026-11-15: this device only, as members expect). `local` removes the session cookies before the server request,
  so it also works when the session was already revoked (the deletion done state reuses this action).
- **Check:** two sessions for one user (two browser contexts), sign out in one, count `auth.sessions` rows for the
  user: `local` leaves 1, `global` leaves 0.
- **Source:** `node_modules/@supabase/auth-js/dist/main/GoTrueClient.js` (`signOut`, `_signOut`); two-context probe.

### Auth audit log rows outlive the deleted user (2026-11-14)
- **Symptom (found in review):** after `delete from auth.users`, `auth.audit_log_entries` still held the person's
  email (`payload->>'actor_username'`), id (`actor_id`) and `ip_address`.
- **Cause:** that table has no FK to `auth.users`, so no cascade reaches it.
- **Do:** purge (and any manual deletion) also runs `delete from auth.audit_log_entries where payload->>'actor_id'
  = any(ids::text[])` first; `postgres` may delete from it locally (hosted: check at rollout, `docs/follow-ups.md`).
  pgTAP can insert fixture rows (`instance_id`, `id`, `payload`, `ip_address`).
- **Source:** final review of account deletion; `private.purge_deleted_accounts`.

### Deleting users with SQL is supported; Storage owners block it (2026-11-14)
- **Need:** delete accounts from a pg_cron job, without the Auth admin API and a secret key in the app.
- **Cause/fact:** `delete from auth.users where id = …` as `postgres` is supported (Supabase's own anonymous-user
  cleanup example does it) and cascades through our `on delete cascade` FKs (profile, contacts, details, bikes,
  safety rows) and `set null` FKs (`applications.reviewed_by`, `safety_access_log`). A user who owns Storage objects
  can't be deleted that way: delete their objects first.
- **Do:** purge in `private.purge_deleted_accounts` (security definer, no grants); when Storage arrives, delete the
  user's objects in the same job, per account (`docs/follow-ups.md`, "Purge is one transaction").
- **Source:** supabase.com/docs/guides/auth/managing-user-data (deleting users), supabase.com/docs/guides/auth/auth-anonymous
  (cleanup with SQL); pgTAP `account_deletion_purge*.test.sql`.

### Generated RPC types call every column and argument non-null (2026-11-15)
- **Symptom:** `no-unnecessary-condition` on `row.birthday ?? null` / `!= null` checks; after the lint autofix removed
  `(x as T | null)`, the `?? null` behind it was flagged too. Passing `null` for a nullable RPC argument doesn't type.
- **Cause:** `supabase gen types` can't tell which columns of a function's result (or which arguments) may be null.
- **Do:** widen the row type at the read: `Omit<Generated…Row, "col"> & { col: T | null }` and assign `data` to it
  (an annotation, not a cast: `DirectoryRow` in `src/lib/members/queries.ts`, `SafetyCardRow` in
  `src/lib/members/safety-card.ts`). A nullable argument needs a justified disable (`setMemberRole` in
  `src/lib/access/actions.ts`) or a `default null` parameter in SQL.
- **Source:** `src/lib/supabase/database.types.ts`; found by linting (Tasks 2–3).

### `supabase db dump` leaves out auth-table triggers and the pg_cron schedule (2026-11-17)
- **Symptom:** the schema dump (`supabase db dump`, no flags) has no `create trigger … on auth.users` /
  `on auth.identities` (our sign-up and avatar triggers, `10_profiles.sql`), and the data dump has no `cron.job` rows.
- **Cause:** the CLI dumps only non-managed schemas; triggers belong to the (managed) table they sit on, and `cron`
  is excluded. Restoring "roles + schema + data" into a fresh project (Supabase's backup guide) would lose them
  silently.
- **Do:** restore **data** onto a schema built from the migrations, only `public` + `auth.users`/`auth.identities`:
  `DELETE` each table right before its `COPY` block, all in one transaction under the dump's
  `session_replication_role = replica` (`scripts/db/restore-sql.mts`, `docs/runbooks/database-backup.md`). Not one
  `truncate` over every dumped table, and not all of `auth`: hosted and local Supabase versions differ (local has
  `storage.iceberg_*` referencing `buckets_analytics`, production doesn't → foreign-key error; production's
  `auth.one_time_tokens` has `link_token_hash`, local doesn't → COPY error). Tried locally 2026-11-18: counts equal,
  triggers still fire.
- **Source:** found by testing (pre-push backup, `scripts/db/production.mts`).

### The CLI prints JSON when stdout isn't a terminal (2026-11-17)
- **Symptom:** `supabase db push --dry-run` from a script prints
  `{"upToDate":true,…,"message":"Remote database is up to date.",…}` instead of text; errors too
  (`{"_tag":"Error",…}`).
- **Cause:** CLI 3 detects agents/non-TTY output (`--agent auto`) and switches the output format.
- **Do:** match on text both formats share (`/up to date/i` in `production.mts`), or pass `--output-format` /
  `--agent no` explicitly when parsing. `db dump` still writes plain SQL to stdout (status lines go to stderr).
- **Source:** found by testing (CLI 3.0.0).

### Turkish upper-casing via the ICU collation; splitting names into words (2026-11-18)
- **Need:** initials for the ön alım crowd view (`club_overview`), Turkish casing (`i → İ`), every name shape.
- **Found (local PG 17, scratch query):** `upper('i' collate "tr-x-icu")` = `İ`, `upper('ı' collate "tr-x-icu")` =
  `I`, `upper('işık' collate "tr-x-icu")` = `İŞIK`; plain `upper('i')` = `I`. `upper('ß' collate "tr-x-icu")` = `SS`
  (the result can be longer than the input). `regexp_split_to_array('', '\s+')` = `{""}` (one empty element, not an
  empty array), and leading/trailing spaces also yield `""` elements.
- **Do:** for a Turkish-only upper-casing, `upper(x collate "tr-x-icu")` is simpler than the `translate()` recipe
  above (that one stays for `tidy_name`, which must also handle non-Turkish names). Split words with
  `array_remove(regexp_split_to_array(s, '\s+'), '')` and treat `cardinality(...) = 0` as "no name". The collation
  already exists on production (`member_directory` sorts with it).
- **Also:** adding a column to a `returns table` function makes the declarative diff emit `DROP FUNCTION` + `CREATE`
  + fresh grants (a return type can't be replaced in place); check the grants at the end of the generated file.
- **Source:** `supabase/schemas/30_member_directory.sql` (`club_overview`), probation Task 2.

### A new `permission` enum value: split migration, and tests that count permissions
- **Symptom:** `pnpm db:migration` after adding an enum value (plus a table using it) emits two files (`_1`, `_2`):
  `ALTER TYPE … ADD VALUE` goes into its own migration (a new value can't be used in the transaction that adds it).
  `roles.test.sql` then failed on a hardcoded permission count.
- **Do:** keep both files; tests that need "every permission" count with
  `array_length(enum_range(null::public.permission), 1)`, never a literal.
- **Also:** a planted row (as `postgres`) through a before-insert trigger that sets `author_id := auth.uid()` gets a
  null author; fine for fixtures that only need visibility.
- **Source:** `supabase/schemas/18_member_notes.sql`, probation Task 3.
