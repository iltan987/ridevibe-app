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
- **Source:** `supabase/schemas/30_member_directory.sql`, Members Task 5.

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
- **Do:** expect a window of up to 1 h after deleting an account; don't treat "verified claims" as "user exists" in
  app logic (follow-up: a token without a profile row counts as signed out).
- **Source:** `@supabase/auth-js` `GoTrueClient.getClaims` (2.119.0); production check (no rows written afterwards).
