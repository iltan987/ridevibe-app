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

## Stack & conventions

- **Next.js 16 App Router** with `cacheComponents`, `partialPrefetching` and React Compiler enabled. Request-time data
  (`cookies()`, `headers()`, session) must sit behind `<Suspense>`; never await it at the top of a layout.
- `proxy.ts` (not `middleware.ts`) runs next-intl locale routing.
- **i18n (next-intl):** locales `tr` (default, served at `/`) and `en` (at `/en`). Turkish (`messages/tr.json`) is the
  source of truth for message keys and types; every key must exist in `messages/en.json` too. No hard-coded UI strings.
  Use `Link`, `redirect`, `useRouter`, `usePathname` from `@/i18n/navigation`, not from `next/*`.
  Locale on the server comes from `next/root-params` (see `src/i18n/request.ts`). Time zone: `Europe/Istanbul`.
- **UI:** Tailwind CSS 4 + shadcn/ui (`base-nova` style, built on Base UI). Base UI composes with the `render` prop,
  **not** `asChild`. For links that look like buttons use `buttonVariants()` on `Link`. `cn` comes from the `cn`
  package (re-exported in `@/lib/utils`). Add components with `pnpm dlx shadcn@latest add <name>`.
- Mobile-first: design for ~390px first; the bottom tab bar is the main navigation on phones.
- Primary nav items live in `src/components/layout/nav-items.ts`.

## Privacy (KVKK)

Personal data is regulated by KVKK. Collect only what a feature needs, keep consents separate and explicit (never
pre-ticked), treat blood type as special-category data, and never log personal data. See the KVKK section of
`docs/PLAN.md`.
