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
```

Run lint, typecheck and build before every commit that touches code.

```bash
pnpm db:start                 # local Supabase in Docker (Docker Desktop with WSL integration must be running)
pnpm db:reset                 # rebuild local DB from migrations (+ seed)
pnpm db:migration <name>      # generate a migration from supabase/schemas (review it!)
pnpm db:test                  # pgTAP tests in supabase/tests/database
pnpm db:types                 # regenerate src/lib/supabase/database.types.ts
```

## Database (Supabase)

- **Declarative schemas:** `supabase/schemas/*.sql` is the source of truth (files apply in name order). Never edit the
  DB via Studio or ad-hoc SQL. Workflow: edit schema file → `pnpm db:migration <name>` → review the generated file in
  `supabase/migrations/` → `pnpm db:reset` → `pnpm db:test` → `pnpm db:types` → commit schema + migration + types
  together. Data (DML) is not tracked by declarative schemas; write such migrations by hand.
- **Security model:** every table has RLS enabled **and** explicit grants: `revoke all … from anon, authenticated`, then
  grant only what is needed (column-level `update` grants for user-editable fields). Policies alone are not enough.
- Security-definer helpers live in the non-exposed `private` schema with `set search_path = ''` and fully qualified
  names. Use `(select auth.uid())` / `(select private.is_staff())` in policies (evaluated once per query).
- Roles: `member` / `organizer` / `admin`; status: `pending` / `active` / `inactive`. Helpers: `private.my_role()`,
  `private.is_active_member()`, `private.is_staff()`, `private.is_admin()`. Role/status change only through
  `public.admin_set_member_access()`.
- Every permission rule gets a pgTAP test, including the "must fail" cases.

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
- **UI:** Tailwind CSS 4 + shadcn/ui (`base-nova` style, built on Base UI). Base UI composes with the `render` prop,
  **not** `asChild`. For links that look like buttons use `buttonVariants()` on `Link`. `cn` comes from the `cn`
  package (re-exported in `@/lib/utils`). Add components with `pnpm dlx shadcn@latest add <name>`.
- Mobile-first: design for ~390px first; the bottom tab bar is the main navigation on phones.
- Primary nav items live in `src/components/layout/nav-items.ts`.

## Privacy (KVKK)

Personal data is regulated by KVKK. Collect only what a feature needs, keep consents separate and explicit (never
pre-ticked), treat blood type as special-category data, and never log personal data. See the KVKK section of
`docs/PLAN.md`.
