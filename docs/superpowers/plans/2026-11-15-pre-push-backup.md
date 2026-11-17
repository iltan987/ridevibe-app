# Backup Before Every Production `db push` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `pnpm db:push` / `pnpm db:backup` take a gpg-encrypted dump of the production database before any push,
and a Claude Code hook blocks bare remote `supabase db push` commands.

**Architecture:** Pure helpers (`scripts/db/backup-files.ts`, `scripts/db/push-guard.ts`) are unit-tested with
`node --test`; a thin orchestrator (`scripts/db/production.ts`) spawns `vercel`, `supabase` and `gpg` (no shell) and
streams each dump through a marker check straight into `gpg --encrypt`, so no plaintext touches the disk. A
`PreToolUse` hook (`scripts/db/guard-hook.ts`) uses the guard helper.

**Tech Stack:** Node 24 (runs `.ts` directly), Supabase CLI 3.0 (`db dump`, `db push`, `test db`), gpg 2, Vercel CLI,
Zod (hook input), Claude Code hooks.

**Spec:** `docs/superpowers/specs/2026-11-15-pre-push-backup-design.md`

## Global Constraints

- Branch `chore/pre-push-backup`, commit spec + plan first. No worktrees. Stage files by path; never `git add -A`,
  `git stash`, `git checkout -- .`, `git restore .`, `git reset --hard`, `git clean`. No co-author trailers.
- `.claude/settings.json` has iltan's uncommitted local change (a removed `typescript-lsp` line): never commit,
  revert or mention it; only the hook block is committed (Task 1 shows how).
- No plaintext dump on disk, in the repo, in logs or in the scratchpad at any point. The database URL never printed.
- No push after a failed or incomplete backup.
- Backups: `~/ridevibe-backups/<UTC timestamp>/{roles,schema,data}.sql.gpg`, folder mode 700, deleted after 14 days.
- Scripts are TypeScript run by `node`; relative imports with `.ts` extensions; lint rules apply (no `as`, `!`,
  `any`; parse outside data with Zod).
- Nothing reads production rows into Claude's context: counts only.
- Before each commit touching code: `pnpm lint && pnpm exec tsc --noEmit && pnpm test && pnpm build`.

## Review Focus

1. **Ctrl+C or a crash mid-backup** — the temp env file is deleted and the half-written folder is not a backup:
   write into `<name>.partial/`, rename to `<name>/` only after all three dumps pass; prune also deletes stale
   `*.partial` folders. (Task 2 tests the names; Task 3 verifies with a manual Ctrl+C.)
2. **One side of a pipe fails** — `supabase db dump` exits 0 but gpg fails (bad key), or the reverse: both exit codes
   are checked, and the run stops before any push. (Task 3, manual: point the key path at an invalid file.)
3. **Prune touches only its own folders** — names that don't match the backup pattern (a file iltan put there,
   `restore-notes`) are never deleted. (Task 2 test.)
4. **Guard false positives/negatives** — chained commands, `npx`/`pnpm exec`/bare `supabase`, `--db-url`/`--linked`
   must block; `pnpm db:push`, a local `supabase db push`, `--dry-run`, `db dump --remote`, `git push` must pass.
   (Task 1 tests.)
5. **Prerequisites missing** — Docker down, `gpg` or the key file missing, not logged in to Vercel: fail with a
   plain message before pulling env vars. (Task 3, manual: stop Docker once.)

---

### Task 1: Guard hook for remote `supabase db push`

**Files:**
- Create: `scripts/db/push-guard.ts`, `scripts/db/push-guard.test.ts`, `scripts/db/guard-hook.ts`
- Modify: `.claude/settings.json` (add `hooks` block; index gets only this block)

**Interfaces:**
- Produces: `isUnguardedDbPush(command: string): boolean` — true when any segment of `command` (split on `;`, `&&`,
  `||`, `|`, newlines) contains the word `supabase`, then `db push`, plus `--remote`, `--db-url` or `--linked`, and
  not `--dry-run`. The message constant `GUARD_MESSAGE = "Production pushes go through \`pnpm db:push\` (backs up first). See docs/runbooks/database-backup.md."`

- [ ] **Step 1: Create the branch and commit spec + plan**

```bash
git switch -c chore/pre-push-backup
git add docs/superpowers/specs/2026-11-15-pre-push-backup-design.md docs/superpowers/plans/2026-11-15-pre-push-backup.md
git commit -m "docs: spec and plan for the pre-push database backup"
```

- [ ] **Step 2: Write the failing tests** (`scripts/db/push-guard.test.ts`, `node:test` + `node:assert/strict`)

Blocked (`true`): `pnpm exec supabase db push --remote=postgres://x`, `supabase db push --remote`,
`npx supabase db push --db-url postgres://x`, `supabase --workdir . db push --linked`,
`cd /repo && pnpm exec supabase db push --remote=$URL --yes`, `supabase db push --remote=x | tee log`,
`supabase  db   push --remote` (extra spaces).
Allowed (`false`): `pnpm db:push`, `pnpm db:push --yes`, `supabase db push`,
`pnpm exec supabase db push --remote=x --dry-run`, `pnpm exec supabase db dump --remote=x`, `git push`,
`supabase test db --remote=x`, `echo done && supabase db push` (local, no remote flag in that segment),
`supabase db push; echo --remote` (flag in another segment).

- [ ] **Step 3: Run** `node --test scripts/db/push-guard.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 4: Implement `isUnguardedDbPush` and `GUARD_MESSAGE`** in `scripts/db/push-guard.ts` (regexes per segment).

- [ ] **Step 5: Run** `node --test scripts/db/push-guard.test.ts` — Expected: all pass.

- [ ] **Step 6: Implement `scripts/db/guard-hook.ts`**

Reads all of stdin, parses with Zod `{ tool_input: { command: string } }` (passthrough; unparsable input → exit 0, the
hook must never break unrelated tools), and when `isUnguardedDbPush` is true writes `GUARD_MESSAGE` to stderr and
exits 2. First confirm the current hook contract (stdin JSON fields, exit code 2 = block with stderr shown to Claude,
`$CLAUDE_PROJECT_DIR`) in the Claude Code hooks docs (https://code.claude.com/docs/en/hooks); adjust if it changed.

- [ ] **Step 7: Register the hook in `.claude/settings.json`** (working tree):

```json
"hooks": {
  "PreToolUse": [
    { "matcher": "Bash", "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/scripts/db/guard-hook.ts\"" }] }
  ]
}
```

- [ ] **Step 8: Verify the hook live** — Claude Code may need `/hooks` review or a restart to load it (ask iltan).
Run as a Bash tool call: `true supabase db push --remote=postgres://example.invalid` → Expected: blocked with
`GUARD_MESSAGE`. Run `true supabase db push --remote=x --dry-run` → Expected: runs. Then pipe a sample JSON into
`node scripts/db/guard-hook.ts` and check `echo $?` is 2 / 0 for the two cases.

- [ ] **Step 9: Stage the hook without iltan's local change** — build the index blob from `HEAD`:
`git show HEAD:.claude/settings.json` → add the same `hooks` block (same formatting) → write it with
`git hash-object -w <tmpfile>` (tmpfile in the scratchpad) → `git update-index --cacheinfo 100644,<hash>,.claude/settings.json`.
Check: `git diff --cached .claude/settings.json` shows only the hook block; `git diff .claude/settings.json` still
shows only the `typescript-lsp` line.

- [ ] **Step 10: Commit**

```bash
git add scripts/db/push-guard.ts scripts/db/push-guard.test.ts scripts/db/guard-hook.ts
git commit -m "chore(db): block bare remote db push from Claude Code"
```

### Task 2: Backup file helpers

**Files:**
- Create: `scripts/db/backup-files.ts`, `scripts/db/backup-files.test.ts`

**Interfaces:**
- Produces:
  - `BACKUP_MAX_AGE_DAYS = 14`
  - `backupFolderName(now: Date, local: boolean): string` — `YYYY-MM-DDTHH-MM-SSZ` in UTC, suffix `-local` when local.
  - `expiredBackups(names: readonly string[], now: Date, maxAgeDays: number): string[]` — names (incl. `.partial`
    variants) older than `maxAgeDays`, plus every `.partial` older than 1 hour; never a name that doesn't match the
    pattern.
  - `createMarkerCheck(markers: readonly string[]): { transform: Transform; missing(): string[] }` — a pass-through
    `Transform` that records which markers occurred, line-wise across chunk boundaries.
  - `DATA_MARKERS = ['COPY "public"."profiles"', 'COPY "auth"."users"']` (CLI 3.0 dumps with
    `--quote-all-identifier`; confirm against a local `--data-only --use-copy` dump in Task 3).

- [ ] **Step 1: Write the failing tests**

`backupFolderName(new Date("2026-11-15T21:04:05.123Z"), false) === "2026-11-15T21-04-05Z"`, with `true` →
`"2026-11-15T21-04-05Z-local"`.
`expiredBackups` with now `2026-11-30T00:00:00Z`, 14 days: returns `2026-11-15T21-04-05Z`, `2026-11-01T00-00-00Z-local`,
`2026-11-29T22-00-00Z.partial`; keeps `2026-11-16T00-00-01Z`, `2026-11-29T23-30-00Z.partial`; never returns
`notes`, `2026-11-01`, `2026-11-01T00-00-00Z.bak`.
`createMarkerCheck`: input split as `["COPY \"pub", "lic\".\"profiles\" (a) FROM stdin;\n", "x\n"]` → output bytes equal
the input, `missing()` = `['COPY "auth"."users"']`; both present → `[]`; empty stream → both missing.

- [ ] **Step 2: Run** `node --test scripts/db/backup-files.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement** the four exports in `scripts/db/backup-files.ts` (`node:stream` `Transform`; keep the
  last partial line between chunks).

- [ ] **Step 4: Run** `node --test scripts/db/backup-files.test.ts` — Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/db/backup-files.ts scripts/db/backup-files.test.ts
git commit -m "chore(db): backup folder naming, pruning and dump marker check"
```

### Task 3: Backup key and the `db:backup` / `db:push` commands

**Files:**
- Create: `scripts/db/backup-key.asc` (iltan), `scripts/db/production.ts`
- Modify: `package.json` (scripts `"db:backup": "node scripts/db/production.ts backup"`,
  `"db:push": "node scripts/db/production.ts push"`)

**Interfaces:**
- Consumes: Task 2 exports.
- Produces: CLI `node scripts/db/production.ts backup [--local]` and `push [--yes]`; prints the backup folder path.

- [ ] **Step 1: iltan creates the key** (own terminal; it prompts for a passphrase):

```bash
gpg --quick-generate-key "Ride & Vibe database backups" ed25519 cert never
gpg --quick-add-key <FINGERPRINT> cv25519 encr never
gpg --armor --export <FINGERPRINT> > scripts/db/backup-key.asc
gpg --armor --export-secret-keys <FINGERPRINT>   # paste into the password manager with the passphrase
```

Check: `gpg --show-keys scripts/db/backup-key.asc` lists an encryption subkey.

- [ ] **Step 2: Confirm CLI behaviour on the local stack** — `pnpm exec supabase db dump --data-only --use-copy | head`
  writes SQL to stdout (status lines on stderr) and contains the `DATA_MARKERS` lines; `pnpm exec supabase test db --help`
  shows how to target `--remote=<url>` and whether `--yes` is needed; `db push --dry-run` output when nothing is
  pending (the "up to date" text the script will detect). Record anything surprising for the learnings (Task 4).

- [ ] **Step 3: Implement `scripts/db/production.ts`**

Order (spec "Design"): check prerequisites (`docker info`, `gpg --version`, key file, `vercel whoami`; skip vercel with
`--local`) → `fs.mkdtemp` in `os.tmpdir()`, `vercel env pull --environment=production <dir>/.env --yes`, read
`POSTGRES_URL_NON_POOLING` with `util.parseEnv`, delete the dir in `finally` and on `SIGINT`/`SIGTERM` → create
`~/ridevibe-backups/<name>.partial/` (mode 700) → three dumps (`--role-only`; plain; `--data-only --use-copy
-x storage.buckets_vectors -x storage.vector_indexes`), each `spawn` (no shell, `stdio: ["ignore", "pipe", "inherit"]`)
piped through `createMarkerCheck` (data dump: `DATA_MARKERS`; others: `[]`) into
`gpg --batch --yes --trust-model always --recipient-file scripts/db/backup-key.asc --encrypt --output <file>`;
await both exit codes; any failure or missing marker → remove the `.partial` folder, exit 1 → rename to `<name>/` →
delete `expiredBackups(...)` → print the folder path. `--local` dumps the local stack (no `--remote`), name gets
`-local`, and `push` refuses `--local`.
`push` continues: `db push --remote=<url> --dry-run` (output shown); nothing pending → exit 0; otherwise confirm (TTY
without `--yes`: `node:readline/promises` y/N; no TTY without `--yes`: print "Dry-run above. Re-run with --yes to
push." and exit 1) → `db push --remote=<url> --yes` → `test db` against the same URL. The URL is passed as an
argument only, never logged.

- [ ] **Step 4: Verify locally** — `pnpm db:backup --local` → a `…-local/` folder with three `.gpg` files, mode 700;
  `gpg --list-packets` on each shows encryption to the backup key; no `.partial` left. Review Focus 1: Ctrl+C during a
  run → `.partial` left, no env dir in `os.tmpdir()`; next run prunes it once older than 1 h (or test with a renamed
  folder). Review Focus 2: `--recipient-file` pointing at an empty file → run fails, no folder. Review Focus 5: stop
  Docker once → plain message (restart Docker after).

- [ ] **Step 5: Verify against production (read-only)** — `pnpm db:backup` → folder created, sizes plausible
  (`du -h`), no URL in the output. `pnpm db:push` with no pending migration → dry-run says up to date, exits 0, nothing
  pushed.

- [ ] **Step 6: Commit**

```bash
git add scripts/db/backup-key.asc scripts/db/production.ts package.json
git commit -m "chore(db): db:backup and db:push take an encrypted backup before any push"
```

### Task 4: Restore drill and runbook

**Files:**
- Create: `docs/runbooks/database-backup.md`
- Modify: `docs/learnings/supabase.md` (new entries for what the drill teaches), `docs/learnings/README.md` if a new
  topic file is needed

- [ ] **Step 1: Work out the restore on local data** — take `pnpm db:backup --local`; iltan warms gpg-agent in their
  terminal (`gpg --decrypt <folder>/roles.sql.gpg > /dev/null`, passphrase cached ~10 min). Restore into the local
  stack by streaming `gpg --decrypt … | docker exec -i supabase_db_ridevibe psql -U postgres -v ON_ERROR_STOP=1`
  (roles → schema → data), starting from `pnpm db:reset` and clearing what migrations/seed already created (public and
  private schemas, `auth.users`, `cron.job` rows); adjust until it runs cleanly. Never print rows: check with counts.
- [ ] **Step 2: Write `docs/runbooks/database-backup.md`** — what `db:push`/`db:backup` do, key setup on a new machine
  (public key is in the repo; private key from the password manager: `gpg --import`), the exact restore commands from
  Step 1, the KVKK rules (encrypted only, 14 days, never copy elsewhere), and "after a drill: `pnpm db:reset`, restore
  the local admin".
- [ ] **Step 3: Real drill (iltan, own terminal)** — iltan follows the runbook on the Task 3 production backup;
  Claude compares counts of `public.profiles`, `auth.users`, `public.applications`, `public.member_health` with
  production (read-only psql, counts only). Expected: equal. Then `pnpm db:reset` and restore iltan's local admin.
- [ ] **Step 4: Commit**

```bash
git add docs/runbooks/database-backup.md docs/learnings/supabase.md
git commit -m "docs: database backup runbook and restore drill learnings"
```

### Task 5: Privacy notice, delete dialog and project docs

**Files:**
- Modify: `src/app/[locale]/privacy/content-tr.tsx`, `src/app/[locale]/privacy/content-en.tsx` (§6, new last `<li>`),
  `messages/tr.json`, `messages/en.json` (`Account.delete.kept`), `src/lib/applications/options.ts`
  (`PRIVACY_NOTICE_VERSION = "2026-11-15-draft-7"`: draft-6 is already deployed), `CLAUDE.md`, `docs/PLAN.md`,
  `docs/follow-ups.md`, `docs/learnings/infra.md`, `README.md` (New machine setup: pointer to the runbook)

- [ ] **Step 1: Notice §6, new bullet** (iltan reviews the wording; "siz" register):
  TR: "Yedekler: veritabanında değişiklik yapılmadan önce alınan yedekler, şifrelenmiş olarak yalnızca uygulamayı
  yöneten kişinin bilgisayarında en fazla 14 gün saklanır, ardından silinir. Silinen bilgiler bu süre dolana kadar
  bu yedeklerde kalabilir."
  EN: "Backups: backups taken before changes to the database are kept encrypted, only on the computer of the person
  who runs the app, for at most 14 days, and then deleted. Deleted data may remain in these backups until then."
- [ ] **Step 2: Dialog `Account.delete.kept`** — append one sentence ("sen" register):
  TR: "… kalır. Silinen bilgiler şifreli yedeklerde en fazla 14 gün daha kalabilir."
  EN: "… remain. Deleted data may stay in encrypted backups for up to 14 more days."
- [ ] **Step 3: Docs** — CLAUDE.md: `pnpm db:push` / `pnpm db:backup` in Commands; Production "Migrations" and
  "Rollout" use `pnpm db:push` (bare remote push is blocked by the hook; dry-run still allowed); the manual
  account-deletion path starts with `pnpm db:backup`. `docs/PLAN.md` running-costs row: no nightly backup; encrypted
  pre-push backup (spec link). `docs/follow-ups.md`: replace "Backups on a paid plan would keep deleted data" with a
  note that the notice now names the 14-day backup window (a paid plan would add its own window). `docs/learnings/infra.md`
  "Supabase Free plan has no automatic backups": add the outcome.
- [ ] **Step 4: Full check** — `pnpm format:check && pnpm lint && pnpm exec tsc --noEmit && pnpm test && pnpm build`;
  `pnpm start -p 3123` + `PUPPETEER_DIR=~/e2e-tools node scripts/e2e/deletion-e2e.mjs` (its "dialog lists deleted,
  kept, grace and club lines" check covers the new sentence) and look at `/privacy` and `/en/privacy`.
- [ ] **Step 5: Commit**

```bash
git add src/app/[locale]/privacy/content-tr.tsx src/app/[locale]/privacy/content-en.tsx messages/tr.json messages/en.json src/lib/applications/options.ts CLAUDE.md docs/PLAN.md docs/follow-ups.md docs/learnings/infra.md README.md
git commit -m "docs: name the 14-day backup window in the notice and delete dialog"
```

Rollout after merge: push `main` (no migration). The notice version bump asks members for nothing new (it is stored
with new consents only).
