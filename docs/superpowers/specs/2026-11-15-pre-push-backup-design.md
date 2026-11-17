# Backup before every production `db push` — design

Date: 2026-11-15. Status: draft, awaiting iltan's approval.

## Why

The production database (Supabase Free) has no backups. The realistic way to lose data is our own change: a
migration that drops or rewrites data, or a destructive bug shipped with one. Every `db push` touches live data. A
nightly backup was considered and dropped: every extra copy of member data (incl. blood types) is a KVKK cost, and
the GitHub repo is public, so neither commits nor Actions artifacts may hold a dump. Instead: an encrypted snapshot
taken automatically right before each production push, kept briefly on iltan's PC.

## Goals

- One command, `pnpm db:push`, does the production rollout and **always** backs up first; no backup, no push.
- Claude can't skip it: a Claude Code hook blocks a bare `supabase db push` to a remote database.
- Backups are encrypted at rest and deleted automatically after 14 days.
- A restore has been tried once, and the steps are written down.

## Non-goals

- Scheduled/nightly backups, off-site copies, backups in GitHub or any cloud storage.
- Guarding iltan's own terminal (the hook only sees Claude's commands).
- Backing up anything outside the database (photos live in `src/assets/`, media on R2 later).

## Anti-goals

- A plaintext dump on disk, in the repo, in logs or in the scratchpad at any point.
- A push that runs after a failed or empty backup.

## Approaches

- **A. `pnpm db:push` wrapper + Claude Code guard hook** — picked (iltan, 2026-11-15). The wrapper makes the backup
  part of the only documented rollout path; the hook catches the case that matters most, since Claude's Bash is fully
  allowed in `.claude/settings.json`.
- B. The wrapper alone, enforced only by CLAUDE.md — dropped: relies on a rule being followed, the thing automation is
  meant to replace.
- Git pre-push hook — dropped: wrong trigger (`db push` happens before pushing `main` and isn't a git event).

## Design

**Key (one-time, iltan):** create a gpg key pair for backups. The ASCII-armored public key is committed (path: builder's
call, e.g. `scripts/db/backup-key.asc`); the private key and passphrase go to iltan's password manager. Encryption
needs only the public key, so it works on any machine and never prompts.

**`pnpm db:push` (bash script, `scripts/db/`):**

1. Check tools (Docker running if the CLI needs it, gpg, vercel) and the public key; fail early with a clear message.
2. `vercel env pull --environment=production` into a private temp file, read `POSTGRES_URL_NON_POOLING`, delete the
   file on every exit path (`trap`). The URL never appears in output.
3. Back up roles, schema and data (`supabase db dump --role-only`, plain, `--data-only --use-copy`, per Supabase's
   backup guide), each streamed straight into `gpg --encrypt` — no plaintext file. Output:
   `~/ridevibe-backups/<UTC timestamp>/{roles,schema,data}.sql.gpg`, folder mode 700.
4. Sanity check before pushing: every command succeeded (`pipefail`) and the data dump is non-trivial (e.g. it
   contains the `public.profiles` and `auth.users` COPY blocks). Otherwise stop.
5. Delete backup folders older than 14 days.
6. `db push --dry-run`, show the plan; push only after confirmation (a y/N prompt on a terminal, `--yes` otherwise, so
   Claude can run it once iltan has said go). Nothing to push → stop after the dry-run.
7. Push, then `supabase test db` against the same target (the existing rollout step).

Also `pnpm db:backup`: steps 1–5 alone, for other risky production work (e.g. the manual account-deletion path).

**Guard hook:** a `PreToolUse` hook on Bash (`.claude/hooks/`, registered in `.claude/settings.json`; stage only the
hook lines, iltan's local change in that file stays unstaged) that blocks commands running `supabase db push` with
`--remote`, `--db-url` or `--linked`, and tells Claude to use `pnpm db:push`. The wrapper's own internal call isn't
seen by the hook (it only inspects Claude's top-level command).

**Restore drill (once, during the build):** decrypt a real backup, restore it into the local Docker database
(roles → schema → data, as in Supabase's restore guide), compare row counts of `profiles` / `auth.users` with
production (read-only), then `pnpm db:reset` to return to seed data. The steps go into a short runbook (location:
builder's call; linked from CLAUDE.md's Production section).

**KVKK:** backups exist only encrypted on iltan's PC, at most 14 days. Because a purged account can survive in a
backup for up to 14 days, privacy notice §6 and the delete dialog (`Account.delete.removed`) say so; that bumps
`PRIVACY_NOTICE_VERSION`. The follow-up "Backups on a paid plan would keep deleted data" is replaced by this.

**Docs:** CLAUDE.md Production → Migrations and Rollout use `pnpm db:push`; `docs/PLAN.md` running-costs row
updated (no nightly backup; pre-push backup instead); learnings for anything found along the way.

## Left to the builder

Script layout and names, the public key's path, how the data dump is sanity-checked, whether `supabase db dump`
needs Docker, the hook's matching details, the runbook's location.
