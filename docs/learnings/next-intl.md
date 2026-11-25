# next-intl learnings (v4)

### Use `next/root-params` for the locale (2026-11-07)
- **Do:** `getRequestConfig` reads `rootParams.locale()` and validates with `hasLocale`; layout has
  `generateStaticParams`. No `setRequestLocale` needed. `localePrefix: "as-needed"` → TR at `/`, EN at `/en`.
- **Source:** next-intl docs (routing/setup, blog "nextjs-root-params").

### Root params (and so `getLocale()`) don't work in Server Actions / Route Handlers (2026-11-07, updated 2026-11-25)
- **Symptom:** risk of a hard-coded, non-localized redirect (`/sign-in?error=oauth` sent English users to Turkish).
- **Cause:** root parameter getters run in Server Components and server-side utilities only, not in Client
  Components, Server Actions or Route Handlers.
- **Do:** derive the locale from data you already have (e.g. the locale-prefixed `next` path) and build URLs with
  `getPathname({ href, locale })` — see `src/lib/auth/sign-in-error.ts`. A plain `redirect("/")` from
  `next/navigation` only fits where any remembered language will do: the proxy then picks the locale from the
  `NEXT_LOCALE` cookie, else Turkish (`accept-language` is pinned, "Locale detection order" below; `signOut` in
  `src/lib/auth/actions.ts`). In pages use `redirect({ href, locale })` from `@/i18n/navigation`.
- **Source:** Next `02-guides/internationalization.md` ("not in Client Components, Server Actions, or Route
  Handlers").

### next-intl `redirect` doesn't narrow types (2026-11-07)
- **Symptom:** `'user' is possibly 'null'` after `if (!user) redirect(...)`.
- **Cause:** not investigated.
- **Do:** write `return redirect(...)`.
- **Source:** not recorded.

### Typed messages catch missing translations at compile time (2026-11-07)
- **Do:** keep `src/global.d.ts` (`Messages: typeof tr.json`). Adding an option value (e.g. license `b`) without a
  message makes `tsc` fail — good. If `tsc` still complains after adding the key, delete `tsconfig.tsbuildinfo`
  (stale incremental cache).
- **Source:** `src/global.d.ts`.

### `NextIntlClientProvider` (v4) passes messages automatically (2026-11-07)
- **Do:** render it without props in the layout; client components can `useTranslations` any namespace.
- **Note:** use `t.rich("key", { link: (chunks) => <Link…>{chunks}</Link> })` for inline links in messages.
- **Source:** `src/app/[locale]/layout.tsx` (`<NextIntlClientProvider>` without props).

### Uppercase in Turkish needs `lang="tr"` (2026-11-07)
- **Do:** `<html lang={locale}>` — CSS `uppercase` then renders `İSTANBUL` correctly. In JS use
  `toLocaleUpperCase("tr")` (see `src/lib/initials.ts`).
- **Source:** not recorded (CSS case mapping by `lang`: ui.md, "CSS `uppercase` on a `tr` page dots English i's").

### Message keys containing dots are nested paths (2026-11-08)
- **Cause:** next-intl splits keys on `.`; a permission value like `applications.view` can't be a flat key.
- **Do:** nest the messages (`permissions.applications.view.label`); then `t(\`permissions.${permission}.label\`)`
  works and stays type-checked.
- **Source:** roles & permissions commit c346e1d.

### Messages in another language than the viewer's (2026-11-08)
- **Do:** `getTranslations({ locale, namespace })` renders text in a given locale — used for the WhatsApp invite,
  which must be in the *applicant's* language (`applications.locale`) while the admin browses in theirs. Build the
  link with `getPathname({ href: "/sign-in", locale })` so English applicants get `/en/sign-in`.
- **Source:** WhatsApp invite in commit 847c318 (application review panel).

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
  the locale differs from the header-derived one. Without the header `getAcceptLanguageLocale` returns undefined, so
  the cookie gets set on every first visit (also `/` and crawlers).
- **Do:** in `src/proxy.ts` give next-intl a `new NextRequest(request, { headers })` with `accept-language` pinned to
  the default locale (not deleted: see Cause; cookie detection keeps working) and pass the original request to
  `updateSession`. In `routing.ts` set `localeCookie: { maxAge: 60 * 60 * 24 * 365 }` (merged into the defaults; the
  client `syncLocaleCookie` reads it too).
- **Caveat:** next-intl forwards those request headers on, so every localized page, layout and Server Action sees
  `accept-language: tr`. Nothing reads it today; code that needs the visitor's real language must not rely on it.
- **Source:** `next-intl/dist/esm/development/middleware/{resolveLocale,syncCookie}.js`, found by testing.

### Checking ICU messages outside the app: `createTranslator` from `next-intl` (2026-11-22)
- **Symptom:** a scratch script importing `intl-messageformat` to try new `plural` / `select` messages failed with
  `Cannot find module` from the repo root.
- **Cause:** pnpm doesn't hoist next-intl's own dependencies; only `next-intl` itself resolves from the root.
- **Do:** `createRequire(process.cwd() + "/package.json")("next-intl").createTranslator({ locale, messages,
  namespace, onError })` in a scratchpad `.mjs` run from the repo root: the same formatter the app uses, and `onError`
  reports a broken message or a missing argument. Run each `select` / `plural` with every branch's value.
- **Source:** events joining Task 5 (checking `Events.changes.leadParts.*` in both locales).
