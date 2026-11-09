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

### Root params (and so `getLocale()`) don't work in Server Actions / Route Handlers (2026-11-08)
- **Symptom:** risk of a hard-coded, non-localized redirect (`/sign-in?error=oauth` sent English users to Turkish).
- **Do:** derive the locale from data you already have (e.g. the locale-prefixed `next` path) and build URLs with
  `getPathname({ href, locale })` — see `src/lib/auth/sign-in-error.ts`.
- **Source:** `02-guides/internationalization.md` ("not in Client Components, Server Actions, or Route Handlers").

### A dev session killed mid-write leaves corrupt `.next/dev/types` that break `tsc` and `next build` (2026-11-08)
- **Symptom:** `TS1005`/`TS1002` errors in `.next/dev/types/routes.d.ts` / `validator.ts` (half-written files);
  `pnpm build` fails at "Running TypeScript".
- **Do:** with no dev server running, `rm -rf .next/dev` (regenerated by `pnpm dev`). tsconfig includes that folder.
- **Source:** found by testing.

### Server Actions: `refresh()` after a mutation (2026-11-08)
- **Do:** call `refresh()` from `next/cache` at the end of a successful Server Action to re-render the current page
  with fresh data (our pages read request-time data, nothing to revalidate). Only callable in Server Actions.
- A client form keyed by its data remounts after `refresh()` and loses local state (e.g. a "Saved" message) → key by
  id and let the inputs keep what the user just saved.
- **Source:** `03-api-reference/04-functions/refresh.md`; found by testing.

### `metadataBase` is intentionally unset (2026-11-09)
- **Symptom:** `og:image` / icon URLs are absolute; locally (`pnpm start`) they point at `http://localhost:3000`.
- **Cause:** without `metadataBase` Next falls back to `VERCEL_PROJECT_PRODUCTION_URL` in production and
  `VERCEL_BRANCH_URL` on previews (`node_modules/next/dist/lib/metadata/resolvers/resolve-url.js`), so each deployment
  already gets the right origin.
- **Do:** leave it unset; set it only if a custom canonical origin is needed that differs from the Vercel production URL.
- **Source:** Next source, above.

### Error page: `[locale]/error.tsx`, no `global-error.tsx` (2026-11-09)
- **Do:** `src/app/[locale]/error.tsx` catches page errors below the locale layout, so header, nav, theme and language
  stay. It does **not** catch errors in the layout itself; those would need `global-error.tsx`, which renders its own
  `<html>` without our CSS, fonts, theme script or messages. Skipped on purpose: the layout path doesn't throw
  (`getCurrentUser()` maps Supabase errors to `null`). Revisit if the layout starts awaiting something that can throw.
- **Props (16.3+):** `{ error: unknown, retry }` — `retry()` re-fetches and re-renders (prefer it over `reset`). Server
  errors arrive with a generic message plus `error.digest` (matches the Vercel log entry); we show the digest.
- **Gotchas:** don't name the component `Error` (shadows the global, breaks `instanceof Error`). To test, a temporary
  client page that throws after mount works with a static build; delete it and re-run `pnpm build` before `tsc`
  (stale `.next/types` still reference the deleted page).
- **Source:** `03-api-reference/03-file-conventions/error.md`; found by testing.

### Catching errors around data calls in Server Components: `unstable_rethrow` first (2026-11-09)
- **Need:** `/apply` and `/account` fall back (form / generic card) when `getMyApplicationStatus()` fails instead of
  showing the error page.
- **Cause:** a bare `catch` also swallows Next's control-flow errors (`notFound()`, `redirect()`, and request-time API
  bailouts such as `cookies()`/`headers()` during prerendering) — our Supabase client awaits `connection()`/`cookies()`.
- **Do:** `.catch((error) => { unstable_rethrow(error); console.error(<code only>); return fallback; })`
  (`unstable_rethrow` from `next/navigation`, first statement in the catch). Our query helpers throw
  `Error("<name> failed: <code>")`, so logging `error.message` contains no personal data.
- **Source:** `03-api-reference/04-functions/unstable_rethrow.md`.
