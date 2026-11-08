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
- **Do:** helper is `private.my_role()`; don't name functions after SQL keywords.

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
