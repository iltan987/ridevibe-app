# Next.js 16 learnings

Bundled docs are the source of truth: `node_modules/next/dist/docs/` (grep them before writing code).

### create-next-app 16 enables Cache Components by default (2026-11-07)
- **Symptom:** fresh `next.config.ts` has `cacheComponents: true`, `partialPrefetching: true`, `reactCompiler: true`.
- **Do:** treat request-time data (`cookies()`, `headers()`, `searchParams`, session) as needing `<Suspense>`; read
  `01-app/01-getting-started/08-caching.md` and `02-guides/authentication-with-cache-components.md`.
- **Source:** scaffold output.

### Locale strategy: URL prefix (chosen) vs cookie (2026-11-08, corrected)
- **Precise claim:** *reading* `cookies()` during render (next-intl "without i18n routing" setup) blocks prerendering
  of every page under Cache Components (`cookies.md`: "calling cookies() outside of <Suspense> prevents the route
  from being prerendered"). A cookie-based locale **can** stay static if the proxy reads the cookie and rewrites
  internally to `/[locale]/…` (next-intl `localePrefix: "never"`).
- **Why we keep URL prefixes (`as-needed`: TR `/`, EN `/en`):** it is what both Next.js
  (`02-guides/internationalization.md`: sub-path or domain routing) and Google recommend — Google Search Central:
  "use different URLs for each language version rather than cookies or browser settings", plus hreflang (next-intl
  middleware emits alternate links). `never` loses unique per-language URLs and alternates; shared links show the
  recipient's language.
- **Do:** keep `[locale]` + `next/root-params`; never read the locale from `cookies()` in render.
- **Source:** next-intl routing/configuration docs (`localePrefix`), Next.js bundled docs, Google Search Central
  "Managing multi-regional and multilingual sites".

### "Next.js encountered the unstable value `Date.now()` while prerendering" from Supabase auth (2026-11-07)
- **Cause:** auth-js compares token expiry with `Date.now()`; during (runtime) prerender cookies may be available but
  the current time is not allowed.
- **Do:** call `await connection()` (from `next/server`) at the start of `createClient()` in
  `src/lib/supabase/server.ts` — every Supabase consumer becomes request-time.
- **Source:** `08-caching.md` → "Random values and timestamps".

### `usePathname()` in layout client components breaks routes with unknown dynamic params (2026-11-07)
- **Symptom:** dev overlay "N Issues": `encountered URL data usePathname() in a Client Component outside of
  <Suspense>` — appeared only once the first `[id]` route without `generateStaticParams` existed.
- **Do:** wrap pathname-dependent components in `<Suspense>` with a fallback that renders the same UI without active
  state (pattern: `DesktopNav`, `BottomNav`, `LocaleSwitcher`). `useSearchParams()` always needs `<Suspense>`.
- **Source:** `03-api-reference/04-functions/use-pathname.md`.

### `redirect()` inside a Suspense boundary is a streamed client redirect (2026-11-07)
- **Symptom:** `curl /account` (signed out) returns **200**, not 307; body contains `NEXT_REDIRECT;replace;/sign-in…`.
- **Do:** that's expected; verify redirects in a real browser, not with curl. Same for the catch-all 404 page (rendered
  client-side via resume; HTML shell is empty).
- **Source:** found by testing.

### Route-aware types (`PageProps<"/[locale]/x">`) need regeneration for new routes (2026-11-07)
- **Symptom:** `TS2344 … does not satisfy the constraint 'AppRoutes'` after adding a page.
- **Do:** `pnpm exec next typegen` (also runs during `dev`/`build`).

### Dev server serves stale `messages/*.json` after edits (2026-11-07)
- **Symptom:** `MISSING_MESSAGE: Could not resolve 'Apply'…` / raw keys like `Admin.applications` in the UI, while the
  JSON file is correct.
- **Cause:** Turbopack dev keeps the dynamically imported message module cached.
- **Do:** restart `pnpm dev` after adding message keys; verify with `pnpm build && pnpm start` if in doubt.
- **Source:** found by testing (twice).

### Proxy file convention (2026-11-07)
- **Do:** `src/proxy.ts` (not `middleware.ts`), default export or named `proxy`. Our proxy runs next-intl, skips it for
  `/auth/*` route handlers, then refreshes the Supabase session only if an `sb-…-auth-token` cookie exists.
- **Source:** `03-api-reference/03-file-conventions/proxy.md`.
