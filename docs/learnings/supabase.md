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
