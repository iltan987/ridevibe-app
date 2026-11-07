# Learnings

Things discovered the hard way while building this project: library behaviour that differs from docs or memory,
mistakes and their root causes, workarounds, environment quirks. Goal: never re-discover the same thing twice.

**Before working in an area, read its file. After discovering something non-obvious, add an entry in the same commit.**

| File | Covers |
|---|---|
| [nextjs.md](nextjs.md) | Next.js 16 (Cache Components, proxy, routing, dev server) |
| [next-intl.md](next-intl.md) | i18n routing, messages, typing |
| [supabase.md](supabase.md) | CLI v3, declarative schemas, RLS/grants, auth, pgTAP, hosted project |
| [ui.md](ui.md) | shadcn/ui `base-nova`, Base UI, mobile UX |
| [forms.md](forms.md) | Zod 4, form submission, phone input |
| [testing.md](testing.md) | Browser E2E without a test framework, signed-in sessions |
| [environment.md](environment.md) | WSL, Docker, pnpm, CLI tools, shell gotchas |
| [infra.md](infra.md) | Vercel, Marketplace, domain/DNS, costs |
| [domain.md](domain.md) | Motorcycle/Turkey/KVKK facts that drive product decisions |

## Entry format

```markdown
### Short, searchable title (YYYY-MM-DD)
- **Symptom:** what you see (error text, wrong behaviour).
- **Cause:** why it happens (verified, not guessed).
- **Do:** the rule / fix / workaround to apply. Point to code if relevant.
- **Source:** doc, file, or "found by testing".
```

Rules: one fact per entry, imperative "Do", keep it short, fix or delete entries that turn out to be wrong.
