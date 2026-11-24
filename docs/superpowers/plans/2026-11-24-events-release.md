# Events Release (branch 2b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open Events to the club, show a safe teaser of rides to everyone else (on `/events`, the home page and a
shared event link), and give shared event links a per-event WhatsApp preview with a generated image.

**Architecture:** The gate opens by replacing one SQL function body. Two new security-definer RPCs, callable by
`anon`, return only teaser-safe fields (the day, never the time). The app reads them through a cookie-less Supabase
client inside `"use cache"` functions tagged `events-public`; the organiser actions expire that tag with `updateTag`.
Non-members on `/events` and `/events/[id]` get teaser views instead of "Çok yakında" / sign-in / 404; the event page
gets per-event metadata and an `opengraph-image.tsx` (`ImageResponse`, Saira TTFs).

**Tech Stack:** Next.js 16.4 App Router (Cache Components, `"use cache"`, `cacheTag`, `cacheLife`, `updateTag`,
`next/og`), Supabase Postgres + pgTAP, next-intl, Tailwind 4 / shadcn (Base UI), puppeteer E2E.

**Spec:** `docs/superpowers/specs/2026-11-24-events-release-design.md` (builds on
`docs/superpowers/specs/2026-11-20-events-design.md`). Read both.

## Global Constraints

- Every rule in `CLAUDE.md` applies; read `docs/learnings/` files for the area before each task (nextjs, supabase,
  seo, ui, testing, next-intl).
- Never discard working-tree changes you didn't make: no `git checkout -- .`, `git restore .`, `git reset --hard`,
  `git stash`, `git clean`. Stage files by path; never `git add -A` / `commit -a`. No co-author trailers.
- Public data (RPCs, teaser, home section, preview card, metadata, OG image) never contains a time, place name,
  coordinates, description, counts, ids (teaser list) or anyone's name. The day is computed in SQL:
  `(starts_at at time zone 'Europe/Istanbul')::date`.
- The teaser list filters on the Istanbul day (`day >= today in Istanbul`), never `starts_at` against `now()`.
- List teaser and home section: scheduled **rides** only. Per-event preview/card: any event (meet-ups, past,
  cancelled → "İptal edildi").
- `deleting` accounts are treated like signed-out visitors (no "Giriş yap" though: they are signed in).
- Copy: Turkish first, "sen", every key also in `messages/en.json`; 2–3 options for new headlines in the task report
  for iltan; never CSS-uppercase Turkish/brand words.
- No new npm packages. Saira TTF files are assets (OFL; add `OFL.txt` beside them).
- Before every code commit: `pnpm lint && pnpm exec tsc --noEmit && pnpm test && pnpm build` (+ `pnpm db:test` for
  schema tasks). `pnpm build` needs the local Supabase running (the home page now prerenders data).
- Cached public reads and E2E: rows planted by psql never expire the `events-public` cache. Scripts that check the
  teaser or the home page plant their fixtures before `pnpm build && pnpm start`, or change data through the
  organiser UI (which calls `updateTag`); say which in the script header.
- Learnings: every non-obvious finding (first `"use cache"` use, `ImageResponse` fonts, metadata under Cache
  Components) gets an entry in the matching `docs/learnings/*.md` in the same commit.
- Follow-ups: anything deferred goes into `docs/follow-ups.md` in the same commit.

## Review Focus

1. A title with Turkish capitals and 80 characters ("İSTANBUL ŞİLE AĞVA …") in the OG image: glyphs render (no
   tofu), the title wraps to two lines then ellipsis. → Task 5 E2E/pixel check.
2. A cancelled ride and a meet-up never appear in the home section or the `/events` teaser, but a cancelled event's
   own link shows "İptal edildi". → Task 1 pgTAP + Task 6 E2E.
3. Malformed id (`/events/abc`) and unknown uuid on the page, its metadata and its `opengraph-image`: a 404 page,
   generic metadata, a generic club image — never a 500. → Tasks 4, 5.
4. A Supabase error while the cached teaser is filled must not cache an empty list for hours: the cached reader
   throws on error. → Task 2 unit test.
5. English: `/en/events/<id>` gives English metadata, image text and day format. → Tasks 4, 5 E2E.

---

### Task 1: Open the gate and add the public RPCs (database)

**Files:**
- Modify: `supabase/schemas/40_events.sql` (gate body + header comments; two new functions after `can_see_events`)
- Create: `supabase/migrations/<generated>_events_release.sql` via `pnpm db:migration events_release`
- Create: `supabase/tests/database/events_public.test.sql`
- Modify: `supabase/tests/database/events.test.sql:2-3,98-147`, `supabase/tests/database/event_signups.test.sql`
  (header lines 2-7, GATE CLOSED section, the GATE SWAP block ~449-461)
- Modify: `src/lib/supabase/database.types.ts` (`pnpm db:types`)

**Interfaces:**
- Produces (SQL, both `stable security definer set search_path = ''`, `revoke all … from public`, `grant execute …
  to anon, authenticated`):
  ```sql
  public.event_teasers()
    returns table (day date, title text, area text, side public.istanbul_side)
    -- kind = 'ride', status = 'scheduled', (starts_at at time zone 'Europe/Istanbul')::date
    --   >= (now() at time zone 'Europe/Istanbul')::date; order by starts_at, id
  public.event_preview(p_id uuid)
    returns table (kind public.event_kind, title text, day date, area text, cancelled boolean)
    -- any event by id; zero rows when unknown
  ```
- Gate: `private.can_see_events()` body becomes `select private.is_club_member()`.

- [ ] **Step 1: Write `events_public.test.sql`** (fixture ids `…0790`–`…0799`, planted as postgres, `plan(n)`):
  rides today-earlier (started 1 h ago), today-later, tomorrow, yesterday; a cancelled ride tomorrow; a meet-up
  tomorrow. Assertions:
  - `has_function_privilege('anon', 'public.event_teasers()', 'execute')` and for `event_preview(uuid)`; same for
    `authenticated`.
  - Column sets pinned: `select array_agg(attname order by attnum)` over the functions' result types, or
    `results_eq` on `select * from public.event_teasers() where title like 'pgTAP%'` returning exactly the columns
    `(day, title, area, side)`; `event_preview` exactly `(kind, title, day, area, cancelled)`.
  - As `anon`: teasers for the fixtures = the three rides (today-earlier, today-later, tomorrow) in start order;
    not yesterday's, not the cancelled one, not the meet-up.
  - As `anon`: `event_preview(<meet-up>)` = `('meetup', title, day, null, false)`; preview of the cancelled ride has
    `cancelled = true`; preview of yesterday's ride returns its row; an unknown uuid returns 0 rows.
  - `day` of a fixture starting `2026-12-01 23:30+03` reads `2026-12-01` (Istanbul day, not UTC).
  - Gate open: as an active member and an ön alım member `public.can_see_events()` is true and they read the fixture
    rows from `public.events`; pending, inactive, deleting: false and 0 rows; `anon` still gets `42501` on
    `select 1 from public.events`.
- [ ] **Step 2: Run `pnpm db:test`** — Expected: FAIL (functions don't exist, gate assertions fail).
- [ ] **Step 3: Implement in `40_events.sql`**: the two functions, the new gate body, header comment "RELEASE GATE"
  rewritten to say the gate is open to club members (no "organisers only"); comment above each RPC naming the
  anti-goal (no time, places, counts, names).
- [ ] **Step 4: Flip the existing tests**: `events.test.sql` "before release" assertions become released ones
  (member 0743 sees both fixture events and places; probation 0744 sees them; deleting 0745 none; anon `42501`).
  `event_signups.test.sql`: delete the GATE SWAP block and merge GATE CLOSED/OPEN into one "gate" section where
  member/ön alım pass and deleting/inactive/anon don't; the "refused before the release" assertions go. Update
  `plan(n)` counts and file headers.
- [ ] **Step 5: `pnpm db:migration events_release`**, review the file (only the gate body, the two functions, grants;
  delete any `cron.unschedule` line), `pnpm db:reset`, `pnpm db:test` — Expected: all PASS.
- [ ] **Step 6: `pnpm db:types`**, `pnpm exec tsc --noEmit` — Expected: clean.
- [ ] **Step 7: Commit** `feat(db): open the events gate; public teaser and preview reads`.

### Task 2: Public data layer and cache invalidation

**Files:**
- Create: `src/lib/supabase/public.ts` — cookie-less client
- Create: `src/lib/events/public.ts` — cached reads; `src/lib/events/public-rows.ts` + `public-rows.test.ts` — Zod
  parsers (pure, testable with `node --test`)
- Create: `src/lib/events/day.ts` + `day.test.ts`
- Modify: `src/lib/events/actions.ts` (updateTag; `refresh()` on refusals)
- Modify: `docs/learnings/nextjs.md` (first `"use cache"` use)

**Interfaces:**
- Consumes: Task 1 RPCs.
- Produces:
  ```ts
  // src/lib/supabase/public.ts — no cookies, no session; safe inside "use cache"
  export function createPublicClient(): SupabaseClient<Database>
  // src/lib/events/public-rows.ts
  export type TeaserRide = { title: string; day: string; area: string; side: Enums<"istanbul_side"> | null };
  export type EventPreview = { kind: Enums<"event_kind">; title: string; day: string; area: string | null; cancelled: boolean };
  export function parseTeaserRows(data: unknown): TeaserRide[]       // throws on a bad shape
  export function parsePreviewRows(data: unknown): EventPreview | null
  // src/lib/events/public.ts ("use cache" + cacheTag(PUBLIC_EVENTS_TAG) + cacheLife("hours"))
  export const PUBLIC_EVENTS_TAG = "events-public";
  export async function getTeaserRides(): Promise<{ rides: TeaserRide[]; total: number }>
  export async function getEventPreview(id: string): Promise<EventPreview | null>  // malformed id → null, no request
  // src/lib/events/day.ts — "YYYY-MM-DD" (Istanbul day) → Date at 12:00 UTC (same day in Istanbul)
  export function dayToDate(day: string): Date
  ```
- `getTeaserRides`: one `rpc("event_teasers", undefined, { count: "exact" })`; `total` from the count; when
  `total > rides.length` log `console.error("event teasers over max_rows", { total })` (never silent). Both readers
  **throw** on a Supabase error (an error must not be cached as "no rides").
- `cacheLife("hours")` means a passed ride can linger up to about an hour after Istanbul midnight (stale-while-
  revalidate); accepted, note it in the learnings entry.

- [ ] **Step 1: Write failing tests** `day.test.ts`: `dayToDate("2026-12-01")` formatted with
  `Intl.DateTimeFormat("tr", { timeZone: "Europe/Istanbul", day: "numeric", month: "long" })` →
  `"1 Aralık"`; invalid `"2026-13-01"` throws. `public-rows.test.ts`: a valid teaser row parses; a row with an extra
  `starts_at` key is rejected (strict object, so a widened RPC fails loudly); `parsePreviewRows([])` → `null`.
- [ ] **Step 2: Run `pnpm test`** — Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** the four files. `createPublicClient` uses `createClient` from `@supabase/supabase-js`
  with `supabaseEnv()` and `auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }`;
  `import "server-only"`.
- [ ] **Step 4: Actions**: `saveEvent`, `cancelEvent`, `deleteEvent` call `updateTag(PUBLIC_EVENTS_TAG)` after a
  successful RPC (before `refresh()`). Every action that returns `refused`, `notFound` or `hasSignups` also calls
  `refresh()` (follow-ups "Events joining app minors" (a)).
- [ ] **Step 5: Run `pnpm test`, lint, tsc** — Expected: PASS.
- [ ] **Step 6: Commit** `feat(events): cached public teaser and preview reads`.

### Task 3: Event link in the share text; members share too

**Files:**
- Modify: `src/lib/seo/site.ts` (+ its test file if one covers it; else `src/lib/seo/site.test.ts`)
- Modify: `src/lib/events/places.ts`, `src/lib/events/places.test.ts`
- Modify: `src/components/events/share-event-button.tsx` (doc comment; `label` prop)
- Modify: `src/app/[locale]/events/[id]/page.tsx` (share for every viewer)
- Modify: `messages/tr.json`, `messages/en.json` (`Events.detail.shareMember` if the label differs)

**Interfaces:**
- Produces:
  ```ts
  export function eventUrl(locale: Locale, id: string): string   // `${SITE_URL}/events/${id}`, `/en/events/${id}` for en
  shareText(event, { when, cancelledTitle, changeLead, url }): string   // url is the last line
  export function memberShareText(event: { title: string }, { day, url }: { day: string; url: string }): string
  ```
- The URL always uses `SITE_URL` (production): links are only shared from production; noted as a plan call.

- [ ] **Step 1: Failing tests**: `eventUrl("tr", "abc")` = `https://ridevibe.com.tr/events/abc`, `"en"` →
  `https://ridevibe.com.tr/en/events/abc`; existing `shareText` tests gain `url` and expect it as the last line,
  also for a cancelled event; `memberShareText({ title: "Ağva" }, { day: "29 Kasım Cumartesi", url })` →
  `"Ağva\n29 Kasım Cumartesi\n<url>"`.
- [ ] **Step 2: Run `pnpm test`** — Expected: FAIL.
- [ ] **Step 3: Implement**; on the event page every viewer gets the share button in the actions row (organisers:
  `shareText`; members and ön alım: `memberShareText`, the day formatted `{ weekday: "long", day: "numeric", month:
  "long" }`). Remove "no event link until the release" comments.
- [ ] **Step 4: Run tests, lint, tsc** — PASS. **Step 5: Commit** `feat(events): event link in shared texts`.

### Task 4: Event page for non-members and per-event metadata

**Files:**
- Create: `src/components/events/teaser-card.tsx` (shared by Tasks 4, 6, 7)
- Create: `src/components/events/event-teaser.tsx` (the non-member view of one event + CTAs)
- Modify: `src/app/[locale]/events/[id]/page.tsx` (branch on `canSeeEvents()`; `generateMetadata`; comments)
- Modify: `src/lib/events/access.ts` (comment: gate is club members), `src/lib/events/queries.ts:23` comment
- Modify: messages (`Events.teaser.*`)
- Modify: `docs/learnings/nextjs.md` if metadata under Cache Components needs a pattern

**Interfaces:**
- Consumes: `getEventPreview`, `dayToDate` (Task 2); `getApplyView` (`src/lib/applications/get-apply-view.ts`);
  `ApplyLink`.
- Produces:
  ```tsx
  // No link, no time. Date block (weekday short, day, month), title (struck through + "İptal edildi" badge when
  // cancelled), kind badge, side badge, area line.
  export function TeaserCard(props: { title: string; day: string; kind: Enums<"event_kind">; area: string | null;
    side?: Enums<"istanbul_side"> | null; cancelled?: boolean; headingLevel?: "h1" | "h2" }): JSX.Element
  export async function EventTeaser(props: { id: string; signedIn: boolean }): Promise<JSX.Element>
  ```
- Page logic inside the existing Suspense: `isUuid(id)` else `notFound()`; `canSeeEvents()` → the 2a member view
  unchanged; otherwise `EventTeaser` (preview null → `notFound()`). CTAs: signed out → "Giriş yap"
  (`/sign-in?next=<getPathname /events/id>`) + "Başvur" (`ApplyLink`); signed in → `getApplyView()`: `form` →
  "Başvur"; `underReview` → one line "Başvurun inceleniyor."; `inactive` / `deleting` / `alreadyMember` → none.
  `/events/[id]/edit`, `/events/new`, `/events/past` keep `requireEventsAccess` (now: club members).
- `generateMetadata({ params })`: preview → `title: preview.title`, `description`: kind · day (weekday long, day,
  month) · area, prefixed "İptal edildi · " when cancelled; `openGraph` with `sharedOpenGraph(locale)`, `url`,
  `title`, `description` (the colocated `opengraph-image` supplies the image — no `images` key);
  `robots: { index: false }` always. Unknown/malformed → today's generic `{ title, robots }`. If `pnpm build` rejects
  reading params/data in `generateMetadata` under Cache Components, follow the bundled docs
  (`node_modules/next/dist/docs/01-app/…/generate-metadata.md`, the cache components guide) and record the fix in
  learnings.

- [ ] **Step 1**: Write the E2E checks first in a new `scripts/e2e/events-public-e2e.mjs` (pattern: `events-e2e.mjs`
  plant/clean via psql, `e2e-lib.mjs`): signed out on a planted ride → card title + area + "Giriş yap" + "Başvur",
  HTML has no planted place name, time (`08:30`) or description; meet-up → card without area; cancelled →
  "İptal edildi"; `/events/not-a-uuid` and an unknown uuid → 404; pending fixture user (`pending-noapp@test.local`)
  → card + "Başvur", no "Giriş yap"; `fetch` of the page HTML: `og:title` = planted title, `og:description` has the
  day and area, no `08:30`; `/en/events/<id>` description is English; robots noindex.
- [ ] **Step 2: Run it** against `pnpm build && pnpm start -p 3123` — Expected: FAIL.
- [ ] **Step 3: Implement** the components, page branch and metadata.
- [ ] **Step 4: Run the E2E and `events-e2e.mjs` / `events-join-e2e.mjs`** (still pass for members/organisers;
  their gate parts are updated in Task 9 — if they fail only on gate expectations, note it and continue).
- [ ] **Step 5: lint, tsc, test, build; commit** `feat(events): event teaser for non-members and per-event metadata`.

### Task 5: Generated link-preview image

**Files:**
- Create: `src/app/[locale]/events/[id]/opengraph-image.tsx`
- Create: `src/assets/fonts/` — Saira static TTFs (one condensed bold/extra-bold for the title, one regular/semi-bold
  for text) from `github.com/google/fonts` (`ofl/sairaextracondensed`, `ofl/saira` static instances), plus `OFL.txt`
- Modify: `docs/learnings/seo.md` or `nextjs.md` (fonts, variable-font limits, caching of the image route)

**Interfaces:**
- Consumes: `getEventPreview`, `dayToDate`; the brand badge (`src/components/brand/` SVG source → inline `<img>` data
  URI or JSX `svg` that satori renders).
- Exports: `size = { width: 1200, height: 630 }`, `contentType = "image/png"`, `alt` (brand name), default
  `Image({ params })` reading `locale` and `id` from `params`.
- Layout per spec §5.7 sketch: dark "Gece" background (hex from `src/app/globals.css` dark tokens), badge + wordmark
  text top-left, kind label top-right, title (condensed, bold, max two lines then ellipsis via `lineClamp`), day in
  the accent orange, a route-strip motif + area for rides, "İptal edildi" stamp when cancelled. Text in the route's
  locale; uppercase only where the source text is written uppercase. Unknown/malformed id → a generic club card
  (badge, "Ride & Vibe", no event text), status 200.

- [ ] **Step 1**: Extend `events-public-e2e.mjs`: GET `/events/<ride>/opengraph-image` → 200, `content-type:
  image/png`, 1200×630 (read the PNG header), and the page's `og:image` points to it; unknown uuid → 200 PNG;
  save the PNGs for a 80-char Turkish-capitals title, a meet-up, a cancelled ride and the English route to the
  scratchpad and look at them (Review Focus 1, 5).
- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement.** **Step 4: Run** — PASS, and inspect the PNGs.
- [ ] **Step 5: lint, tsc, test, build; commit** `feat(events): generated link-preview image per event`.

### Task 6: `/events` for non-members, indexable

**Files:**
- Create: `src/components/events/events-teaser.tsx` (intro + teaser list + CTAs + empty state)
- Create: `src/components/events/events-teaser-skeleton.tsx`
- Modify: `src/app/[locale]/events/page.tsx` (no `ComingSoon`; `index: true`; fallback by session hint;
  `<InstallBanner />` for members)
- Modify: `src/components/events/events-skeleton.tsx` (doc comment: now the members' `/events` fallback too)
- Modify: `src/app/sitemap.ts` (+ `seo-files.test.ts`), `scripts/e2e/seo-check.mjs` (`/events` moves from the
  noindex list to the indexable list)
- Modify: `src/app/[locale]/events/past/page.tsx:21-22` comment; messages (`Events.teaser.*`, `Metadata.events*`)

**Interfaces:**
- Consumes: `getTeaserRides`, `TeaserCard`, `HomeApplyButton`, `canSeeEvents`, `hasSessionCookie` hint pattern
  (`InlineScript` + `sessionHintScript`, as `user-menu-skeleton.tsx`).
- Page: `canSeeEvents()` → 2a list (+ `<InstallBanner />`); otherwise `EventsTeaser`. Fallback: both skeletons
  rendered, the session hint shows `EventsSkeleton` (with chips) when a session cookie exists, else
  `EventsTeaserSkeleton` (signed-in non-members see the member skeleton first: accepted, noted in follow-ups).
- `EventsTeaser`: h1 "Etkinlikler", intro paragraph (what rides are, weekly, who can join → apply), total line,
  every teaser ride as a `TeaserCard` (no links), `CeilingNotice`-style loud line when `total > rides.length`, empty
  state when none, then "Başvur" (`HomeApplyButton`) and, when signed out, "Giriş yap".
- Metadata: `pageMetadata({ path: "/events", index: true, description: <events description> })`.

- [ ] **Step 1**: Extend `events-public-e2e.mjs`: signed out `/events` → h1, intro, planted rides in order, no
  meet-up, no cancelled ride, no time/place/description in the HTML, no links to `/events/<id>`; with no planted
  rides → empty state; member → the 2a list; `seo-files.test.ts` expects `/events` in the sitemap for both locales.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** E2E, `pnpm test`, `seo-check.mjs` (local) — PASS.
- [ ] **Step 5: Measure** the teaser skeleton against the result with JS off (`scripts/e2e/skeletons.mjs`
  pattern, 390 px and 1280 px, Turkish) and fix heights.
- [ ] **Step 6: lint, tsc, test, build; commit** `feat(events): public teaser on /events`.

### Task 7: Home section and hero button

**Files:**
- Create: `src/components/home/home-next-rides.tsx`
- Modify: `src/app/[locale]/page.tsx` (after `<HomeRides />` inside `<Route>`), `src/components/home/home-hero.tsx`
  (secondary "Etkinlikleri Gör" button beside `HomeApplyButton`), messages (`Home.nextRides.*`, `Home.seeEvents`)

**Interfaces:**
- Consumes: `getTeaserRides`, `TeaserCard`.
- `HomeNextRides` (async server component, no session read): first 3 rides as `TeaserCard`s + a `Link` to `/events`
  ("Tüm etkinlikler", with the total when `total > 3`); `null` when there are no rides. Styled into the route line
  (`RouteStop`) like the neighbouring sections.
- Hero button: `Link` to `/events` with `buttonVariants({ variant: "outline", size: "lg" })`, readable on the dark
  hero in both themes; E2E anchor `data-home-events`.

- [ ] **Step 1**: Extend `events-public-e2e.mjs`: home shows the planted rides (max 3, soonest first, no meet-up,
  no cancelled ride) and the link; invalidation: an organiser (`admin@test.local`) cancels one planted ride through
  the event page's cancel dialog, then a signed-out reload of `/` no longer lists it (`updateTag`; planted rows
  alone never invalidate the cache, so plant before `pnpm build` or create them through the UI); hero
  `data-home-events` links to `/events`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS; `pnpm build` output still lists `/`
  as prerendered (partial) — record the build line in the task report.
- [ ] **Step 5**: Run `nav-e2e.mjs`, `header-e2e.mjs`, `apply-nav-e2e.mjs` (hero anchors) — PASS.
- [ ] **Step 6: lint, tsc, test, build; commit** `feat(home): next rides and the events button`.

### Task 8: Members' event page polish (skeletons, focus, navigation)

**Files:**
- Modify: `src/app/[locale]/events/[id]/page.tsx` (`EventSkeleton`: signed-in shape = a member's view, signed-out
  shape = the teaser card, chosen by the session hint), `src/components/events/join-panel.tsx` (focus)
- Modify: `docs/follow-ups.md` "Loading states" items resolved or re-scoped

**Interfaces:** none new.

- Skeleton: the shell can't know member vs organiser; members are the common case after the release, so the
  skeleton mirrors a member's view of a ride (actions row with the share button only, join panel, places, roster);
  signed-out shape = the teaser card + CTAs (session hint). Measure with `scripts/e2e/skeletons.mjs` as member,
  organiser and signed out (390/1280, Turkish).
- Focus (follow-ups "Events joining UI minors" (a)): when "+"/"−" or a role button becomes disabled or unmounts,
  move focus to the next sensible control (the stepper's other button, else the panel heading with `tabIndex={-1}`).

- [ ] **Step 1**: E2E in `events-join-e2e.mjs`: press "−" to 0 guests with the keyboard → `document.activeElement`
  is the "+" button; skeleton Δh check via `skeletons.mjs` for the three viewers.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Navigation check**: screenshots of the bottom tab bar at 390 px signed out, member, ön alım (TR and EN);
  fix only real overflow/truncation; otherwise record "checked, no change" in the task report.
- [ ] **Step 6: lint, tsc, test, build; commit** `feat(events): member skeletons and join-panel focus`.

### Task 9: E2E gate parts, privacy notice, docs

**Files:**
- Modify: `scripts/e2e/events-e2e.mjs` (`gateScenario` → released rules: member and ön alım see the list and the
  event; a pending user gets the teaser), `scripts/e2e/events-join-e2e.mjs` (remove gate open/restore, `GATE_SQL`,
  `gateBody` checks and the signal-handler follow-up item (a) with them; header comments)
- Modify: `src/app/[locale]/privacy/content-tr.tsx`, `content-en.tsx` (§2 data, §3 purpose, §4 legal basis m.5/2-f,
  §6 retention per events spec §8), `src/lib/applications/options.ts` `PRIVACY_NOTICE_VERSION` → `"2026-11-24-draft-10"`
- Modify: `CLAUDE.md` Events bullet (gate open; public RPCs `event_teasers` / `event_preview`, the "no time"
  rule; `PUBLIC_EVENTS_TAG` + `updateTag`), `docs/PLAN.md` (MVP step 3 status), `docs/follow-ups.md` (remove the 2b
  item, "Etkinlikleri Gör" item, "Index /events" item, done Loading-states and minors; add anything deferred),
  `scripts/e2e/README.md` (new script), `docs/superpowers/specs/2026-11-20-events-design.md` §9 (gate released)

- [ ] **Step 1**: Update the two E2E scripts; run all events scripts + `probation-e2e.mjs` — PASS.
- [ ] **Step 2**: Write the notice sections (KVKK m.5/2-f checked against the law text; cite in the commit message
  body, not in the notice); `pnpm test` (messages parity, any notice test) — PASS.
- [ ] **Step 3**: Docs updates; grep for leftovers: `rg -n "organisers only|organizers only|Çok yakında|release gate|
  before the release" src scripts supabase/schemas` → only intended hits (explain each in the report).
- [ ] **Step 4: Full verification**: `pnpm format:check`, `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test`,
  `pnpm db:test`, `pnpm build`, every E2E script listed in CLAUDE.md Commands plus `events-public-e2e.mjs`,
  `seo-check.mjs` local.
- [ ] **Step 5: Commit** `docs: events release — notice, CLAUDE.md, plan and follow-ups`.

## Rollout (after iltan's go; not a task)

1. Merge `--no-ff` into `main`. 2. iltan ticks `events.manage` for Organizatör on production if not done.
3. `pnpm db:push` (backup, dry-run, `--yes` after iltan's go, pgTAP). 4. Push `main`, wait for Ready.
5. Read-only checks: `has_function_privilege('anon', 'public.event_teasers()', 'execute')` and `event_preview(uuid)`
   true; `BASE=https://ridevibe.com.tr node scripts/e2e/seo-check.mjs`.
6. iltan on real phones: share a ride to a WhatsApp chat (Android + iPhone): preview card and image; tap → browser
   where Google sign-in works; if a WhatsApp web view blocks sign-in, fix `detectInAppBrowser` at once.
