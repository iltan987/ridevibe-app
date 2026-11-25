# Rollout and production checks: runbook

Everything that runs against production around a release. Rules that apply every time (db:push only, the hook,
read-only investigation, previews share the production DB) are in CLAUDE.md "Production & deploy"; backups in
`docs/runbooks/database-backup.md`.

## Getting the connection URL

`vercel env pull --environment=production <file outside the repo>` (`POSTGRES_URL_NON_POOLING`), use it, delete the
file afterwards. Read-only queries:

```bash
docker run --rm postgres:17-alpine psql "$URL" -c "set default_transaction_read_only = on" -c "<query>"
# or: pnpm exec supabase db query --remote=<url> --read-only
```

Select the fewest columns, mask emails, never write personal data into the repo or logs.

## Before `pnpm db:push`

- **New constraint or unique index:** run read-only queries for any existing rows it would reject.
- **Migration that rewrites production data:** a read-only preview in `scripts/sql/` (pg_temp copies of the new
  functions, rolled back, so it runs *before* the push). iltan runs it in their own terminal, never via `!`.
- **Changing an RPC's arguments:** the old overload can't stay beside the new one when both accept the same named
  args (PostgREST can't choose), so pages calling it error until the deploy is Ready: tell iltan, pick a quiet hour.
  Adding a column to an RPC's return type doesn't break old callers (PostgREST returns it, old JS ignores the key, e.g.
  `pending_application_flags` gaining `former_member`); removing, renaming or retyping one does, until the deploy is
  Ready.

## Order

merge → `pnpm db:push` (backup, dry-run, push after y/N — Claude: `--yes` once iltan said go — then pgTAP against
production) → push `main` (Vercel deploys). If the migration removes something old code uses, push `main` immediately
after; pushing `main` right after `db push` is fine either way. Never push a branch with schema changes for a preview
first: previews use the production DB.

## After `pnpm db:push`

- **Added functions:** read-only `has_function_privilege('anon' / 'authenticated', …)` check. Column-level grants
  (e.g. `insert (profile_id, body)`) read `false` in `has_table_privilege`: use `has_column_privilege`.
- **pg_cron:** `select jobname, schedule, active from cron.job` (expect `purge-deleted-accounts` / `0 2 * * *`) and
  `select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5` (the purge
  also prunes run history older than 30 days).

## After pushing `main`

- **Deploy status:** `vercel ls ridevibe-app --environment production 2>&1` (prints to stderr; top row: Building →
  Ready). To wait, test only the newest row (`… | grep -m1 "●" | grep -qE "Ready|Error|Canceled"`): older rows
  already say Ready.
- **Metadata, pages or images changed:** `BASE=https://ridevibe.com.tr node scripts/e2e/seo-check.mjs`.
- **Crons/requests:** `vercel --scope <team> logs requests --project ridevibe-app --environment production --json
  --since 45m -q 'requestPath:"/api/keep-alive"'` (Hobby keeps < 1 h; fields under `.data`).

## Auth config (`supabase/config.toml`)

Production overrides live in `[remotes.production]`. Run `pnpm exec supabase config diff
--remote=igqqicbfejhnsggfuydh`, review it, then `config push --remote=… --yes`. Local defaults must not leak into
production: pin hosted values in the remote block when the diff shows them.
