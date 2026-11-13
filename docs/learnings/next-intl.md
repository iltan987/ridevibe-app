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

### Message keys containing dots are nested paths (2026-11-08)
- **Cause:** next-intl splits keys on `.`; a permission value like `applications.view` can't be a flat key.
- **Do:** nest the messages (`permissions.applications.view.label`); then `t(\`permissions.${permission}.label\`)`
  works and stays type-checked.

### Messages in another language than the viewer's (2026-11-08)
- **Do:** `getTranslations({ locale, namespace })` renders text in a given locale — used for the WhatsApp invite,
  which must be in the *applicant's* language (`applications.locale`) while the admin browses in theirs. Build the
  link with `getPathname({ href: "/sign-in", locale })` so English applicants get `/en/sign-in`.

### `redirect` / `getPathname` from `@/i18n/navigation` prefix again: a stored `next` path takes Next's `redirect` (2026-11-12)
- **Symptom (risk):** `redirect({ href: "/en/members", locale: "en" })` would go to `/en/en/members`.
- **Cause:** with `localePrefix: "as-needed"`, `getPathname` adds the prefix to every non-default-locale href without
  looking at it (`applyPathnamePrefix` in `next-intl/dist/esm/development/navigation/shared/utils.js`). A `next`
  value is built with `getPathname` already, so it carries its prefix.
- **Do:** redirect to a full stored path with `redirect` from `next/navigation` (after `safeNextPath`), like
  `/sign-in` does for signed-in visitors (`signedInDestination`) and the OAuth callback; keep `@/i18n/navigation` for
  hrefs without a prefix.
- **Source:** next-intl source (installed version).

### Locale detection order and the `NEXT_LOCALE` cookie (2026-11-13)
- **Symptom:** a first visit (or crawler) with `Accept-Language: en` is redirected from `/` to `/en`; the language
  choice is forgotten when the browser closes.
- **Cause:** `resolveLocale` goes prefix → `NEXT_LOCALE` cookie → `Accept-Language` → default. The default cookie has
  no `maxAge` (session cookie). `syncCookie` sets it on document requests only, when it is outdated or (no cookie and)
  the locale differs from the header-derived one — so a header-less request sets it only for non-default locales.
- **Do:** in `src/proxy.ts` give next-intl a `new NextRequest(request, { headers })` without `accept-language`
  (cookie detection keeps working) and pass the original request to `updateSession`; in `routing.ts` set
  `localeCookie: { maxAge: 60 * 60 * 24 * 365 }` (merged into the defaults; the client `syncLocaleCookie` reads it too).
- **Source:** `next-intl/dist/esm/development/middleware/{resolveLocale,syncCookie}.js`, found by testing.
