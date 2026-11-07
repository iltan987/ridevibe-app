# next-intl learnings (v4)

### Use `next/root-params` for the locale (2026-11-07)
- **Do:** `getRequestConfig` reads `rootParams.locale()` and validates with `hasLocale`; layout has
  `generateStaticParams`. No `setRequestLocale` needed. `localePrefix: "as-needed"` → TR at `/`, EN at `/en`.
- **Source:** next-intl docs (routing/setup, blog "nextjs-root-params").

### Root params are not available in Server Actions / Route Handlers (2026-11-07)
- **Do:** in server actions use plain `next/navigation` `redirect("/")` and let the proxy pick the locale
  (NEXT_LOCALE cookie / Accept-Language). In pages use `redirect({ href, locale })` from `@/i18n/navigation`.

### next-intl `redirect` doesn't narrow types (2026-11-07)
- **Symptom:** `'user' is possibly 'null'` after `if (!user) redirect(...)`.
- **Do:** write `return redirect(...)`.

### Typed messages catch missing translations at compile time (2026-11-07)
- **Do:** keep `src/global.d.ts` (`Messages: typeof tr.json`). Adding an option value (e.g. license `b`) without a
  message makes `tsc` fail — good. If `tsc` still complains after adding the key, delete `tsconfig.tsbuildinfo`
  (stale incremental cache).

### `NextIntlClientProvider` (v4) passes messages automatically (2026-11-07)
- **Do:** render it without props in the layout; client components can `useTranslations` any namespace.
- **Note:** use `t.rich("key", { link: (chunks) => <Link…>{chunks}</Link> })` for inline links in messages.

### Uppercase in Turkish needs `lang="tr"` (2026-11-07)
- **Do:** `<html lang={locale}>` — CSS `uppercase` then renders `İSTANBUL` correctly. In JS use
  `toLocaleUpperCase("tr")` (see `src/lib/initials.ts`).
