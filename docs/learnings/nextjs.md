# Next.js 16 learnings

Bundled docs are the source of truth: `node_modules/next/dist/docs/` (grep them before writing code).

### create-next-app 16 enables Cache Components by default (2026-11-07)
- **Symptom:** fresh `next.config.ts` has `cacheComponents: true`, `partialPrefetching: true`, `reactCompiler: true`.
- **Do:** treat request-time data (`cookies()`, `headers()`, `searchParams`, session) as needing `<Suspense>`; read
  `01-app/01-getting-started/08-caching.md` and `02-guides/authentication-with-cache-components.md`.
- **Source:** scaffold output.

### A cookie-based locale would make every page dynamic (2026-11-07)
- **Cause:** reading `cookies()` in the root layout blocks the static shell for the whole app.
- **Do:** keep the locale in the URL (`app/[locale]`) and read it with `next/root-params` (`src/i18n/request.ts`) +
  `generateStaticParams` in the layout.
- **Source:** `02-guides/internationalization.md`, `03-api-reference/04-functions/next-root-params.md`.

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
