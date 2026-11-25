# Learnings

Things discovered the hard way while building this project: library behaviour that differs from docs or memory,
mistakes and their root causes, workarounds, environment quirks. Goal: never re-discover the same thing twice.

**Before working in an area, read its file. After discovering something non-obvious, add an entry in the same commit.**

| File | Covers |
|---|---|
| [nextjs.md](nextjs.md) | Next.js 16: Cache Components, `"use cache"` and prerendering, proxy, routing and navigation, URL state, Server Actions, dev server, types and build |
| [next-intl.md](next-intl.md) | i18n routing, locale detection (`accept-language` pinning, `NEXT_LOCALE`), locale in Server Actions, messages, typing |
| [supabase.md](supabase.md) | CLI v3 and the hosted project, declarative schemas and migrations (enum splits, pg_cron), grants/RLS, Turkish text in SQL, auth and account deletion, PostgREST reads and generated types |
| [ui.md](ui.md) | shadcn/ui `base-nova` and Base UI, Tailwind and contrast, theme, inline scripts and session hints, skeletons, focus, PWA install, cross-tab state, brand assets |
| [forms.md](forms.md) | Zod 4 (incl. `z.uuid()` versions), form submission and state, drafts, phone and date inputs |
| [testing.md](testing.md) | Browser E2E without a framework (setup, signed-in sessions, hidden routes, background tabs, skeleton measuring, fixtures, racing requests), unit tests with `node --test`, pgTAP (fixtures, planting rows, hints, mutation checks) |
| [seo.md](seo.md) | Search, metadata merging, share and Open Graph images, link previews for bots, structured data |
| [security.md](security.md) | Redirects, Google sign-in in in-app browsers, which account an approval activates, personal data in the repo, server-side link following (SSRF) |
| [tooling.md](tooling.md) | ESLint (typescript-eslint, Tailwind class lint), Prettier, disable comments, `.mts` scripts, pre-commit hook (lint-staged `--no-stash`), git recipes (throwaway clone, merge without checkout, staging only your lines, scrubbing history) |
| [environment.md](environment.md) | WSL, Docker and Windows-reserved ports, pnpm, CLI tools, shell gotchas (`pkill -f`, `docker exec -i`), secrets in commands, Claude Code setup, Windows GPU tools, headless Chrome exports, sharp image edits |
| [infra.md](infra.md) | Vercel (project, crons, request logs, deploy status), Marketplace, domain/DNS, email, Google OAuth publishing, costs and plan limits (backups) |
| [domain.md](domain.md) | Motorcycle/Turkey/KVKK facts that drive product decisions, WhatsApp links and photos, map link formats |

pgTAP: how to write, plant fixtures for and mutation-check tests is in `testing.md`; `supabase.md` holds the database
behaviour the tests pin down (grants, triggers, migrations). Big files open with a "Contents" list of their `##`
groups: put a new entry into the group it belongs to.

## Entry format

Two kinds: something went wrong or surprised us → **problem entry**; reference knowledge that shapes decisions (no
bug behind it) → **fact entry**.

Problem entry:

```markdown
### Short, searchable title (YYYY-MM-DD)
- **Symptom:** what you see (error text, wrong behaviour).
- **Cause:** why it happens (verified, not guessed; "not investigated" if unknown).
- **Do:** the rule / fix / workaround to apply. Point to code if relevant.
- **Source:** doc, file, or "found by testing".
```

Fact entry:

```markdown
### Short, searchable title (YYYY-MM-DD)
- The fact(s), one bullet each; say what to do with them where it matters.
- **Source:** law/doc link, file, or "found by testing".
```

A problem caught before it showed (design review, docs) may skip **Symptom**; extra labels (**Need:**, **Test:**,
**Consequence:** …) are fine where they help.

Rules: one fact per entry, imperative "Do", keep it short, fix or delete entries that turn out to be wrong.
