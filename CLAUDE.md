@AGENTS.md

# Ride & Vibe — club platform

Web app (PWA) for Ride & Vibe, an Istanbul motorcycle club (~150 members): applications, members, events,
announcements, photo galleries, attendance. Plan and decisions: `docs/PLAN.md`. Application form spec:
`docs/application-form.md`. Keep both up to date when decisions change.

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
  completion` (lint, tsc, test, db:test, build, browser E2E) → `requesting-code-review` (+ `/security-review` for
  RLS/grant changes) → iltan reviews → merge. Small fixes skip design/plan. No git worktrees (one local Supabase DB);
  no PRs (local `--no-ff` merge). End of session: `claude-md-management:revise-claude-md`.
- **Fix the environment yourself** before calling it a blocker: e.g. Docker down → start
  `"/mnt/c/Program Files/Docker/Docker/Docker Desktop.exe" &` and wait for `/var/run/docker.sock`.

## Git

- Author: `iltan <iltancanerr@gmail.com>` (set in local repo config).
- **Never add `Co-Authored-By` or any other co-author/attribution trailer to commit messages.**
- `main` = production. One short-lived branch per iteration (`feat/…`, `fix/…`, `chore/…`, `docs/…`); iltan reviews,
  then merge into `main` with `--no-ff`. Small doc/config tweaks may go straight to `main`.
- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`).

## Commands

```bash
pnpm dev          # dev server
pnpm build        # production build (also validates Cache Components rules)
pnpm lint         # ESLint
pnpm exec tsc --noEmit
pnpm test         # unit tests (node --test, *.test.ts)
```

Run lint, typecheck, tests and build before every commit that touches code.

```bash
pnpm db:start                 # local Supabase in Docker (Docker Desktop with WSL integration must be running)
pnpm db:reset                 # rebuild local DB from migrations (+ seed)
pnpm db:migration <name>      # generate a migration from supabase/schemas (review it!)
pnpm db:test                  # pgTAP tests in supabase/tests/database
pnpm db:types                 # regenerate src/lib/supabase/database.types.ts
pnpm exec supabase migration up   # apply new migrations locally, keeping data (db:reset wipes auth users)
kill $(ss -ltnp | grep ':3123 ' | grep -oP 'pid=\K[0-9]+')   # stop a local server; never `pkill -f` (kills own shell)
```

## Database (Supabase)

- **Declarative schemas:** `supabase/schemas/*.sql` is the source of truth (files apply in name order). Never edit the
  DB via Studio or ad-hoc SQL. Workflow: edit schema file → `pnpm db:migration <name>` → review the generated file in
  `supabase/migrations/` → `pnpm db:reset` → `pnpm db:test` → `pnpm db:types` → commit schema + migration + types
  together. Data (DML) is not tracked by declarative schemas; write such migrations by hand.
- **Security model:** every table has RLS enabled **and** explicit grants: `revoke all … from anon, authenticated`, then
  grant only what is needed (column-level `update` grants for user-editable fields). Policies alone are not enough.
- Security-definer helpers live in the non-exposed `private` schema with `set search_path = ''` and fully qualified
  names. Use `(select auth.uid())` / `(select private.has_permission('…'))` in policies (evaluated once per query).
- **Roles & permissions** (`supabase/schemas/05_roles.sql`): admins create roles and tick permissions
  (`public.permission` enum); each profile has at most one `role_id` (null = regular member). The built-in admin role
  (`roles.is_admin`) has every permission plus admin-only powers (editing roles, assigning roles). Only **active**
  members have rights. Helpers: `private.has_permission(p)`, `private.is_admin()`, `private.is_active_member()`.
  Role changes only via `public.set_member_role()` (admins), status via `public.set_member_status()`
  (`members.manage`). App side: `can(user.access, p)`, `requirePermission()` / `requireAdmin()` in
  `src/lib/auth/`. A new permission = enum value + policy/RPC check + pgTAP test + `Admin.permissions.*` messages.
- Status: `pending` / `active` / `inactive`.
- Every permission rule gets a pgTAP test, including the "must fail" cases.
- Generated migrations may DROP a replaced column before its data is copied: move the DROP to the end and add the
  hand-written data step in between. Seed rows the app relies on (e.g. built-in roles) go in the migration.
- Never put a `private.*` function in an index/default on a table that anon/authenticated write (it runs with the
  writer's rights → the public form breaks).

### Production (hosted Supabase `ridevibe-db`, ref `igqqicbfejhnsggfuydh`, Frankfurt)

- Provisioned via Vercel Marketplace (Free plan); env vars are injected into Vercel **production + preview** only.
  Local dev always uses the Docker stack. Preview deployments share the production database.
- **Migrations:** `pnpm exec supabase db push --remote=<POSTGRES_URL_NON_POOLING> --dry-run` first, then without
  `--dry-run` + `--yes`; then run `supabase test db` against the same target. Get the URL with
  `vercel env pull --environment=production <file outside the repo>` and delete the file afterwards.
- **Auth/config as code:** production overrides live in `[remotes.production]` in `supabase/config.toml`. Always run
  `pnpm exec supabase config diff --remote=igqqicbfejhnsggfuydh` and review before `config push --remote=… --yes`.
  Local defaults must not leak into production — pin hosted values in the remote block when the diff shows them.
- Google OAuth creds: `GOOGLE_LOCAL_*` / `GOOGLE_PROD_*` in the root `.env` (git-ignored). Never name config env vars
  `SUPABASE_*` — the CLI lets those override every config value, including remote blocks.
- Functions run in `fra1` (`vercel.ts`), next to the database.
- Rollout: merge → `db push` (dry-run first) → `test db --remote --yes` → push `main` (Vercel deploys). If the
  migration removes something old code uses, push `main` immediately after. Don't push branches with schema changes
  for a preview first: previews use the production DB.
- Check crons/requests: `vercel --scope <team> logs requests --project ridevibe-app --environment production --json
  --since 45m -q 'requestPath:"/api/keep-alive"'` (Hobby keeps < 1 h; fields under `.data`).

## Stack & conventions

- **Next.js 16 App Router** with `cacheComponents`, `partialPrefetching` and React Compiler enabled. Request-time data
  (`cookies()`, `headers()`, session) must sit behind `<Suspense>`; never await it at the top of a layout.
- `proxy.ts` (not `middleware.ts`) runs next-intl locale routing.
- **i18n (next-intl):** locales `tr` (default, served at `/`) and `en` (at `/en`). Turkish (`messages/tr.json`) is the
  source of truth for message keys and types; every key must exist in `messages/en.json` too. No hard-coded UI strings.
  Use `Link`, `redirect`, `useRouter`, `usePathname` from `@/i18n/navigation`, not from `next/*`.
  Locale on the server comes from `next/root-params` (see `src/i18n/request.ts`). Time zone: `Europe/Istanbul`.
  Dev quirk: `pnpm dev` (Turbopack) may keep serving stale `messages/*.json` after edits (`MISSING_MESSAGE`) —
  restart the dev server before assuming a missing key.
  Never CSS-`uppercase` English/brand words on Turkish pages (`i → İ`, "RİDE & VİBE"): use `Wordmark` or write the
  capitals in the source (`docs/learnings/ui.md`).
- **UI:** Tailwind CSS 4 + shadcn/ui (`base-nova` style, built on Base UI). Base UI composes with the `render` prop,
  **not** `asChild`. For links that look like buttons use `buttonVariants()` on `Link`. `cn` comes from the `cn`
  package (re-exported in `@/lib/utils`). Add components with `pnpm dlx shadcn@latest add <name>`.
- **Design system** ("Gece + turkuaz", `docs/design/README.md`): palette tokens live in `src/app/globals.css` (hex,
  contrast-tested by `globals-contrast.test.ts`; re-run `pnpm test` after changing values); `heading` / `eyebrow`
  utilities; orange text uses `text-accent-text`, not `text-primary`. Brand: `Wordmark` / `ClubBadge`
  (`src/components/brand/`). Theme: dark default via `src/lib/theme.ts` + inline head script, switcher in the header
  only; never read cookies for theme (keeps routes static).
- Mobile-first: design for ~390px first; the bottom tab bar is the main navigation on phones.
- Primary nav items live in `src/components/layout/nav-items.ts`.
- Server Actions: validate with Zod, let RLS decide, map error codes to results, call `refresh()` (`next/cache`)
  after a successful mutation. They and Route Handlers can't read the locale root param — derive it from data.
- Lists use keyset pagination (`src/lib/pagination.ts` + `Pager`); access checks via `can()` / `requirePermission()`.
- **Every list paginates.** No fixed caps like `.limit(200)`: the club grew to ~130 members in two weeks. Design
  queries and screens with pagination (and visible totals) from the start; don't let counts fail silently.

## Privacy (KVKK)

Personal data is regulated by KVKK. Collect only what a feature needs, keep consents separate and explicit (never
pre-ticked), treat blood type as special-category data, and never log personal data. See the KVKK section of
`docs/PLAN.md`.
