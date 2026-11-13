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

### `useLinkStatus` with partial prefetching: pending works for same-route taps, not inside dropdown menus (2026-11-10)
- **Test:** production build, 390×844, throttled (400 kbps / 400 ms), a throwaway client child in each `Link` logging
  `useLinkStatus().pending`; tapped after prefetches settled and immediately after load (same result both times).
  Also with every RSC request delayed 2.5 s to emulate a slow server.

  | link kind | `pending true` logged? | notes |
  |---|---|---|
  | filter chip (same route, other `searchParams`) | yes (~30 ms after tap) | stays true until the new page swaps in, even though the route was prefetched |
  | pager "Next" (same route, `cursor`) | yes | same |
  | bottom tab (other route) | yes | static shell prefetched, so true only ~100 ms |
  | user-dropdown item (other route) | yes, but not visible | the menu closes ~120 ms after the tap and unmounts its items, so the child unmounts while still pending (never `pending false`); navigation kept going for 3 s |
- **Cause:** likely: prefetching only covers the static shell, so a dynamic `searchParams` page still fetches on tap
  and pending is reported for same-route navigations (observed, not verified in Next internals). Dropdown content lives
  in a portal that unmounts on close.
- **Do:** a `useLinkStatus` indicator is enough for chips, pager and tabs (no extra fallback needed). For dropdown
  items pass `keepMounted` to the menu portal (`DropdownMenuContent keepMounted`): the closed popup stays in the DOM
  (positioner `hidden`, zero size, not focusable), so the item's `LinkPending` stays mounted and `pending` stays true
  until the page changes. Verified: pending span present 1.2 s after the tap, Escape/arrow keys still work.
- **Not tested:** the locale switcher (`router.replace` in a transition, no `Link`): see the next entry.
- **Gotcha (E2E):** `a[href*="/admin/applications"]` also matches the filter chips; match the menu item inside `[role=menu]`.
- **Source:** found by testing.

### Pending-navigation bar: hidden old route, prefetched tabs, locale switcher (2026-11-10)
- **Symptom:** list card -> detail on a slow server: `[data-link-pending]` stays in the DOM and `useLinkStatus` says
  pending, but no bar and no dim. Prefetched bottom tabs never show the bar either.
- **Cause:** the repo has no `loading.tsx`; the skeleton is the page's own `<Suspense fallback>` (e.g.
  `src/app/[locale]/admin/applications/[id]/page.tsx`) inside the prefetched App Shell.
  *Observed:* on tap the URL changes and the fallback shows at once (~30 ms), the old page's link has zero size
  (hidden), the marker span stays in the DOM, the bar and the dim never appear, and everything is clear after the
  data renders. Prefetched static tabs commit within ~100 ms, under the 150 ms delay.
  *Inferred, not verified in Next internals:* the old page is kept hidden in an `<Activity>`, its effects are cleaned
  up, so `beginNavigation()`'s cleanup runs and the store drops to 0; the stale marker's dim animation cannot run on a
  hidden element.
  The locale switcher uses `router.replace` in a transition (no `Link`), so it shows neither bar nor dim; it still
  switches and re-enables its button.
- **Do:** treat the page's Suspense fallback (skeleton) as the feedback for routes whose shell is prefetched; the bar
  covers un-prefetched / same-route navigations. In E2E count only visible markers and, to test the bar on a tab,
  abort requests with the `next-router-prefetch` header and delay the `rsc` ones. Re-tapping the active tab refetches
  the URL, so the bar can show for about its latency.
- **Source:** found by testing (throttled puppeteer E2E in the session scratchpad).

### Instant-navigation dev check: nothing flagged, so no `loading.tsx` (2026-11-10)
- **Symptom:** unclear whether `cacheComponents` + `partialPrefetching` still need `loading.tsx` for instant navigations.
- **Cause:** Next 16 validates every Page segment in `next dev` (`validationLevel: 'warning'`, see
  `node_modules/next/dist/docs/01-app/02-guides/instant-navigation.md` "Validate instant navigation") for both page
  loads and client navigations, reporting blocking data / missing `<Suspense>` in the dev overlay and terminal.
  *Checked:* every `page.tsx` under `src/app/[locale]` (home, events, gallery, privacy, sign-in, apply, account,
  admin applications / detail / members / roles, unknown path), signed out and as admin, by direct load and by
  `window.next.router.push` from `/events`. *Result:* no instant-navigation message for any real route, no overlay
  issue, no console error. Only output (dev server terminal and overlay, unknown path only):
  `Error: Route "/[locale]/[...rest]": Could not validate `instant` because an error prevented the target segment from
  rendering.` (cause `NEXT_HTTP_ERROR_FALLBACK;404`: the catch-all page calls `notFound()` by design). (A
  `ThemeScript` "Encountered a script tag" error on unknown paths was fixed 2026-11-11, see `docs/learnings/ui.md`.)
- **Do:** pages own their `<Suspense>` boundaries (skeleton = the page's fallback); add a `loading.tsx` only for a
  segment the dev check flags. Re-run the check (visit each route, direct and client-side, watch overlay + terminal)
  when adding a page.
- **Source:** found by running the dev check on `feat/loading-states`.

### `history.pushState` updates `useSearchParams` one render later: focus the new view in an effect (2026-11-11)
- **Symptom (risk):** focusing the next step's heading/field right after `window.history.pushState(…?step=N)` would hit
  an element that is still `hidden` (the old step is on screen).
- **Cause:** Next patches `pushState`/`replaceState` and syncs the router via `navigator.restore`, whose state update
  runs in `startTransition` (`next/dist/client/components/app-router.js`, `app-router-instance.js`), so it commits
  after the component's own (sync) state updates from the same event. No server request is made.
- **Do:** store a focus request in state and act in a `useEffect` keyed on the URL-derived value once it matches
  (`goToStep` in `src/components/apply/apply-form.tsx`; back/forward hit the same effect with no request). Read the
  current params from `window.location.search` when building the next URL (fresh even before the re-render).
- **Source:** Next source above; behaviour verified in the browser (heading focused after "Devam", no POST).

### `router.refresh()` follows a Server Component's `redirect()` (2026-11-12)
- **Need:** a tab that learns "the session changed" (cross-tab sync) must land where a fresh load would: private page
  → `/sign-in?next=…`, `/sign-in` → its `next`, public page → re-rendered header.
- **Cause:** the refresh re-runs the page's server code; a `redirect()` there turns into a client navigation (one RSC
  request for the refresh, one for the target). Client state of unaffected components is kept. Works in hidden tabs.
- **Do:** let the server decide: `router.refresh()` and no routing logic in the tab (`src/components/auth/auth-sync.tsx`).
- **Source:** found by testing (two Puppeteer tabs, production build); `use-router.md` describes `refresh()` but not
  redirects.

### URL as list state: `pushState`/`replaceState` + `useSearchParams`, and the render in between (2026-11-13)
- **Need:** `/members` filters in the browser with the state in the URL (`?q=…&side=…&page=…`), no server request.
- **Cause:** Next's patched `history.pushState`/`replaceState` call `navigator.restore`, whose reducer
  (`router-reducer/reducers/restore-reducer.js`) re-uses the current tree and the old `renderedSearch` — no RSC fetch
  (verified in the browser: 0 document/RSC requests while typing, tapping chips and pages, and on back/forward;
  `scripts/e2e/members-e2e.mjs`, `lists-e2e.mjs`). The router update runs in a transition, so it reaches the screen
  **one frame after** the tap (measured: the frame painted right after a chip tap still showed the old list), and a
  sync `setState` from the same event (the search box) renders once more with the old search params first. After
  fast writes the router may also catch up one write at a time (`q=a` while the box already says `ab`).
- **Do:** (1) read the list state through `useListParams`, which shows its own last write (`shownSearch` /
  `addWrite` in `src/lib/list-url.ts`) while the router's URL is still one the write passed through, and drops it
  when the router catches up, moves elsewhere, or on `popstate` (back before the router caught up would otherwise
  land on a URL the write started from and keep showing the write); (2) keep the box text in state and let
  `syncedInput` follow the URL only when it differs from the typed text (keeps a trailing space); (3) correct a bad
  `?page=` in an effect with `replaceState` only (no `setState`). Read repeated keys as arrays (`rawParam`), like the
  page's `searchParams`, so `?page=2&page=3` is corrected as on the server. `useSearchParams` works in SSR here (the
  client list renders inside the page's request-time `<Suspense>`), so a shared `?q=çel&page=2` arrives filtered.
- **Source:** `src/components/lists/use-list-params.ts`, `use-list-search.ts` (shared by `/members` and
  `/admin/members`); Next source above; `04-linking-and-navigating.md` ("Native History API"); per-frame logs in the
  list-UX E2E (2026-11-13).

## A page's `openGraph` drops the layout-level `opengraph-image` file

- **Symptom:** after a page (e.g. `/apply`) set `openGraph` in `generateMetadata`, its `og:image` and `twitter:image`
  vanished and `twitter:card` fell back to `summary`; pages without `openGraph` kept the image.
- **Cause:** nested metadata objects overwrite the parent's, file-based images included (the file image is attached
  at the segment that holds the file; its hashed URL can't be hardcoded).
- **Do:** pass the parent's images on: `generateMetadata(_props, parent: ResolvingMetadata)` and
  `images: (await parent).openGraph?.images` into `openGraph` (`pageMetadata` in `src/lib/seo/metadata.ts`).
- **Source:** found by curl-testing the built site; `generate-metadata.md` ("Extending or overwriting parent images").
