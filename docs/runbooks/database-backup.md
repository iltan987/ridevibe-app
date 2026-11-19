# Database backups: runbook

Spec: `docs/superpowers/specs/2026-11-15-pre-push-backup-design.md`. Code: `scripts/db/production.mts`.

## What runs

- `pnpm db:push` — the only way to push migrations to production: backup → `db push --dry-run` (shown) → confirm
  (y/N in a terminal, `--yes` otherwise) → push → pgTAP against production. "Remote database is up to date" → it
  stops after the backup. Claude Code is blocked by a hook (`scripts/db/guard-hook.mts`) from every Supabase CLI
  write to a remote database: `db push` (`--dry-run` stays allowed), `db reset` (never on production), `db query`
  (`--read-only` stays allowed), `db pull` (records a migration in production's history; `--declarative` stays
  allowed), `migration up/down/repair/squash` and `seed`. If one of those is really needed on production (e.g. a
  `migration repair`), iltan runs `pnpm db:backup` and then the command in their own terminal. Read-only remote
  commands (`db dump`, `migration list/fetch`, `db diff`, `test db`) pass.
- `pnpm db:backup` — the backup alone, before other risky production work (e.g. a manual account deletion).
  `pnpm db:backup --local` backs up the local stack (for testing).

A backup is `~/ridevibe-backups/<UTC time>/{roles,schema,data}.sql.gpg` (folder mode 700). Every dump streams
through a check (the data must contain `public.profiles` and `auth.users`) straight into `gpg`, encrypted to the
public key `scripts/db/backup-key.asc`; no plaintext is written. A failed run leaves no backup (a `.partial` folder
after Ctrl+C is deleted by a later run, after an hour).

Backups older than 14 days are deleted by `node scripts/db/production.mts prune`, which runs at the start of every
Claude Code session in this project (`SessionStart` hook in `.claude/settings.json`) and before every backup. Gap: if
neither happens for a while, an old backup outlives its 14 days until the next session; open Claude Code here (or
run the prune command) at least every two weeks while backups exist.

## KVKK rules

Backups hold every member's data, blood types included: they stay encrypted, on iltan's PC only, at most 14 days
(the privacy notice §6 and the delete dialog say so). Never copy a backup or its decrypted content elsewhere (cloud
drives, the repo, the scratchpad, chats). Decrypt only by streaming into `psql`, as below.

## The key

- Public key: `scripts/db/backup-key.asc` (in git; fingerprint `096EC331A6E105FFE7DDA4541954622305A390DC`).
- Private key: in iltan's gpg keyring on this PC, protected by a passphrase kept in iltan's password manager.
  No other copy: the backups never leave this PC, so a key copy elsewhere would only matter if they did.
- New machine: backups can be taken right away (only the public key is needed). Old backups can't be read there
  unless the private key is exported (`gpg --armor --export-secret-keys <fingerprint>`) and imported
  (`gpg --import`) together with the backups — they expire after 14 days anyway.
- gpg asks for the passphrase on the first decrypt, then caches it for ~10 minutes. Claude's shell can't show the
  prompt: warm the cache in your own terminal first, e.g. `gpg --decrypt <folder>/roles.sql.gpg > /dev/null`.

## Restore

The backup restores **data**. The schema comes from the migrations in git: `supabase db dump` leaves out triggers on
`auth.users` / `auth.identities` (e.g. the sign-up trigger) and the pg_cron schedule, so a schema restored from
`schema.sql` alone would be incomplete. `schema.sql` is for comparing (did the schema change since the backup?) and
for reading old definitions; `roles.sql` only holds role settings that the migrations also set.

`scripts/db/restore-sql.mts` turns the decrypted data dump into restore SQL: one transaction, triggers and
foreign-key checks off (the dump's own `session_replication_role = replica`), and each restored table emptied with
`DELETE` right before its data is loaded. Restored: every `public` table plus the accounts, `auth.users` and
`auth.identities`. Skipped: auth's short-lived tables (sessions, refresh/one-time tokens, flows), its audit log,
`storage` (unused) and the rest. Their tables differ between the hosted and the local Supabase versions (production
has no `storage.iceberg_*`; its `auth.one_time_tokens` has a column the local one lacks), and nobody needs them back:
after a restore people at most sign in again. It needs the target's schema to match the backup's. It ends in
`COMMIT` only when the dump's last pg_dump line (`-- \unrestrict …`) came through; a cut-off stream (failed or
corrupt decrypt) ends in `ROLLBACK`, and the script exits 1. Sessions of restored accounts stay valid (replica mode
doesn't cascade); rows of accounts created after the backup are removed from `auth.users` but their sessions linger
until they expire.

### Into the local stack (test restore)

```bash
set -o pipefail        # a failing gpg or filter must fail the whole pipe
pnpm db:reset          # schema from the migrations (wipes local data, incl. your local admin)
B=~/ridevibe-backups/<folder>
gpg --batch --quiet --decrypt "$B/data.sql.gpg" | node scripts/db/restore-sql.mts \
  | docker exec -i supabase_db_ridevibe psql -U postgres -v ON_ERROR_STOP=1 -q > /dev/null && echo restored
```

If gpg complains about the passphrase in `--batch` mode, run `gpg --decrypt "$B/roles.sql.gpg" > /dev/null` once
first.

A production backup restored locally puts real member data on the local stack: compare what you need (counts
only), then `pnpm db:reset` and recreate the local admin (`docs/learnings/testing.md`).

### Into production (only after iltan decides to)

Overwrites production data with the backup's: everything since the backup is lost. Only on iltan's explicit decision,
in iltan's own terminal.

1. `pnpm db:backup` first (the current state, in case the restore makes things worse).
2. The schema must match the backup's. If a migration ran since the backup, either restore after rolling the schema
   back with a new migration, or restore only the affected tables (pass the dump through `grep`/an editor to keep
   only those tables' `COPY` blocks first; keep the dump's last `-- \unrestrict` line, or the restore rolls back).
   Compare: `gpg --decrypt <folder>/schema.sql.gpg | diff - <(pnpm exec supabase db dump --remote="$URL")`.
3. Run the pipe above with `psql "$URL"` instead of `docker exec … psql -U postgres` (URL:
   `POSTGRES_URL_NON_POOLING` from `vercel env pull --environment=production <file outside the repo>`; delete the
   file afterwards), e.g. `docker run --rm -i postgres:17-alpine psql "$URL" -v ON_ERROR_STOP=1 -q`.
   Not tried on hosted yet (the hosted `postgres` role deletes from `auth.users` fine, see
   `docs/learnings/supabase.md`; other `auth.*` tables unverified).
4. `pnpm exec supabase test db --remote="$URL" --yes`, then check the app.

## Test restore log

- 2026-11-17, local: 3 fixture users backed up → `pnpm db:reset` → restored; counts of `auth.users`, `profiles`,
  `roles`, `cron.job` etc. equal before/after, a profile's `status` came back, the sign-up trigger still works.
- 2026-11-18: the first production → local attempt stopped at a `truncate` (production lacks `storage.iceberg_*`,
  rolled back, nothing loaded); the restore moved to `restore-sql.mts` (`DELETE` per table). The second stopped at
  `auth.one_time_tokens` (production has `link_token_hash`, local doesn't; rolled back): only `public` +
  `auth.users`/`auth.identities` are restored now.
- 2026-11-18, production backup (2026-11-17T20-57-28Z) → local stack, run by iltan: counts of `auth.users`,
  `auth.identities`, `profiles`, `applications`, `member_contacts`, `member_motorcycles`,
  `member_emergency_contacts`, `member_health`, `roles`, `safety_access_log` equal to production's; local reset after.
