# Ride & Vibe

Club platform for Ride & Vibe, an Istanbul motorcycle club. Production: https://ridevibe.com.tr (fallback:
https://ridevibe-app.vercel.app)

- Plan & decisions: [`docs/PLAN.md`](docs/PLAN.md)
- Application form spec: [`docs/application-form.md`](docs/application-form.md)
- Conventions for humans and Claude Code: [`CLAUDE.md`](CLAUDE.md)

## Requirements

- Node.js 26 (via nvm), pnpm (standalone installer, https://pnpm.io/installation: Node 25+ no longer ships
  `corepack`; pnpm then switches itself to the `packageManager` version in `package.json`)
- Docker Desktop (on Windows: enable WSL integration for your distro)
- Vercel CLI (`pnpm add -g vercel`), GitHub CLI (`gh`), Claude Code

## New machine setup

Everything needed lives in this repo except secrets. Clone to **`~/projects/ridingclub`** (Claude Code's memory path
in `.claude/settings.json` assumes it; elsewhere, put `{"autoMemoryDirectory": "<absolute path>/.claude/memory"}` in
`.claude/settings.local.json`).

```bash
git clone git@github.com:iltan987/ridevibe-app.git ~/projects/ridingclub && cd ~/projects/ridingclub
git config user.name iltan && git config user.email iltancanerr@gmail.com   # commit author
git config blame.ignoreRevsFile .git-blame-ignore-revs   # hide the Prettier reformat commit in `git blame`
pnpm install                      # also installs the pre-commit hook (husky; check: git config core.hooksPath)
pnpm db:start                     # local Supabase in Docker; applies migrations + seed
cp .env.example .env.local        # fill NEXT_PUBLIC_SUPABASE_* from `pnpm db:status`
vercel link                       # scope iltan-caners-projects, project ridevibe-app
```

- **`.env`** (git-ignored): `GOOGLE_LOCAL_*` / `GOOGLE_PROD_*` OAuth clients (names in `.env.example`). Keep them in
  your password manager; they can be re-issued in the Google Cloud console. Needed for Google sign-in locally and for
  `supabase config push`. Production app secrets stay in Vercel (`vercel env pull`, see CLAUDE.md).
- **Database backups:** `pnpm db:push` / `pnpm db:backup` work right away (the public key is in the repo; gpg and
  `vercel login` needed). Older backups stay on the old machine; key and restore: `docs/runbooks/database-backup.md`.
- **Claude Code:** open the folder and trust it. Settings, permissions, plugins and memory (`.claude/memory/`) come
  from the repo; plugins still need a one-time install per machine:

  ```bash
  for p in superpowers claude-md-management context7 frontend-design; do
    claude plugin install "$p@anthropic-plugin-directory" --scope project; done
  for p in figma vercel; do
    claude plugin install "$p@claude-plugins-official" --scope project; done
  ```

  Claude Code reads PDFs (e.g. official KVKK guides) only with poppler-utils: `sudo apt-get install -y
  poppler-utils`.

- **Not in git on purpose:** secrets (`.env`, `.env.local`), the 21 MB print logo (Google Drive, see
  `docs/design/README.md`).

## Local development

```bash
pnpm db:start        # starts local Supabase (first run downloads images)
pnpm dev             # http://localhost:3000
```

Local Supabase Studio: http://127.0.0.1:54323

### Two sessions at once (git worktrees)

```bash
claude -w                    # new worktree on wip/<generated name> from main, ready in ~1 min
claude -w fix-home-image     # or give a hint (dashes, no spaces): branch fix/home-image
```

On a `wip/` branch the session renames the branch (`feat/…`, `fix/…`) once it knows the task.

The worktree gets `.env`, `.env.local` and `.vercel` linked from this checkout, its own `node_modules`, and the
Claude Code plugins. All checkouts share the one local Supabase stack, so only one branch at a time may change the
database. This checkout stays on `main` for merges and rollouts. Rules: CLAUDE.md "Parallel sessions"; commands:
`scripts/dev/worktree.mts`.

## Making yourself admin (once per environment)

Sign in once so your profile exists, then run in the SQL editor (Studio locally, Supabase dashboard in production):

```sql
update public.profiles
set role_id = (select id from public.roles where is_admin), status = 'active'
where id = (select id from auth.users where email = 'you@example.com');
```

After that, manage roles at `/admin/roles` and members at `/admin/members`.
