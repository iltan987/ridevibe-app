# Events: Organiser Side Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Organisers (`events.manage`) create, edit, cancel and delete meet-ups and rides with places that open in
Google Maps, Apple Maps or Yandex, see them listed (upcoming and past) and share them to WhatsApp — visible only to
organisers until the joining branch releases Events to everyone.

**Architecture:** Two tables (`public.events`, `public.event_places`) readable only by `events.manage` holders (the
release gate, enforced by RLS) and written only through three security-definer RPCs (`save_event`, `cancel_event`,
`delete_event`) so an event and its places change atomically and the place rules (meet-up: one place, ride: start +
stops + finish) hold. Pure TS modules parse pasted map links, build the navigation URLs, convert Istanbul wall time and
validate the form; a server action resolves short links through an allow-list. Pages: `/events` (upcoming, chips in the
browser), `/events/past` (server-paged), `/events/[id]`, `/events/new`, `/events/[id]/edit`.

**Tech Stack:** Supabase Postgres (declarative schemas, pgTAP), Next.js 16 App Router (Cache Components, Server
Actions, Suspense), next-intl, shadcn/ui (Base UI), Zod, `node --test`, puppeteer E2E.

**Spec:** `docs/superpowers/specs/2026-11-20-events-design.md` (§9 branch 1 and the release gate).

## Global Constraints

- Branch `feat/events-organizer` (exists, spec committed). No worktrees. Stage files by path; never `git add -A`,
  `git commit -a`, `git stash`, `git checkout -- .`, `git restore .`, `git reset --hard`, `git clean`. No co-author
  trailers. `.claude/settings.json` local changes: never commit, revert or mention.
- DB workflow per CLAUDE.md: edit `supabase/schemas/*.sql` → `pnpm db:migration <name>` → review (a new enum value
  is split into `_1`/`_2`, keep both; delete any `cron.unschedule(...)` line) → `pnpm db:reset` → `pnpm db:test` →
  `pnpm db:types` → commit schema + migration + types (+ consumers) together. `db:reset` wipes auth users.
- Every commit passes `pnpm lint && pnpm exec tsc --noEmit && pnpm test && pnpm build`.
- pgTAP: fixture ids `00000000-0000-0000-0000-000000000741`…`0759` (unused), emails `pgtap-ev-…@pgtap.invalid`;
  every assertion scoped to fixture ids (the suite runs on production); never update real rows. Count permissions
  with `array_length(enum_range(null::public.permission), 1)`, never a literal.
- **Release gate (spec §9):** in this branch only `events.manage` holders read events (RLS) and see the pages;
  everyone else gets the existing "coming soon" `/events` page and a 404 on the other event routes. `/events` stays
  `noindex`, out of the sitemap; no home-page changes; no privacy-notice change.
- Rights are `active`-only (`private.has_permission`); an ön alım member holding an organiser role has no rights.
- Time zone `Europe/Istanbul`, permanently UTC+03:00 (no DST since 2016): form wall time ↔ ISO by fixed offset.
- Field limits (DB checks = Zod): title 1–80 chars trimmed; area 1–80 trimmed (rides: required; meet-ups: null);
  description ≤ 2,000 trimmed or null; place name 1–80 trimmed; lat −90…90, lng −180…180 (stored `numeric(9,6)`);
  `limit_people`, `limit_bikes` 1–500 or null; `min_cc` 50–3000 or null; `cancel_reason` ≤ 200 trimmed or null;
  `ends_at > starts_at` when set; ride places 2–12 (start, ≤ 10 stops, finish), meet-up exactly 1.
- Navigation URLs (verify on a phone in review; spec §4): Google open `https://www.google.com/maps/search/?api=1&query={lat},{lng}`,
  route `https://www.google.com/maps/dir/?api=1&destination={lat},{lng}`; Apple open
  `https://maps.apple.com/?ll={lat},{lng}&q={name}`, route `https://maps.apple.com/?daddr={lat},{lng}`; Yandex open
  `https://yandex.com.tr/maps/?pt={lng},{lat}&z=16&l=map`, route `https://yandex.com.tr/maps/?rtext=~{lat},{lng}&rtt=auto`;
  Yandex Navi (route only) `yandexnavi://build_route_on_map?lat_to={lat}&lon_to={lng}`. Coordinates printed with 6
  decimals.
- WhatsApp: `whatsAppUrl()` is for a phone number; group sharing uses `https://api.whatsapp.com/send?text=…` (no
  phone) — add `whatsAppShareUrl(text)` next to it, never `wa.me`. Share texts hold no personal data (no roster).
- Copy: UI "sen"; Turkish first and native; no CSS `uppercase` on Turkish; every key in `messages/tr.json` and
  `messages/en.json`. Labels: kinds "Buluşma"/"Meet-up", "Sürüş"/"Ride"; sides reuse the existing side labels.
- Lint rules (CLAUDE.md): no `as` casts, `!`, `any`, `@ts-*`; Zod for FormData/RPC JSON; `Date.now()` after a session
  read needs the named disable.
- Next 16: read `node_modules/next/dist/docs/` for dynamic `[id]` routes under Cache Components (params behind
  Suspense) before Task 6.

## Review Focus

1. **Server-side request forgery through the link resolver**: a pasted `https://maps.app.goo.gl.evil.com/…`,
   `http://169.254.169.254/`, a redirect from an allowed host to a disallowed one, or a redirect loop must be refused
   without fetching the disallowed URL. Pinned in Task 1 (`isAllowedMapUrl` cases) and Task 4 (resolver with an
   injected fetch).
2. **Yandex's longitude-first order**: `pt=29.0154,41.0255` must give lat 41.0255, lng 29.0154 (a swapped point lands
   in Somalia). Pinned in Task 1.
3. **Istanbul wall time**: "2026-11-22T08:30" must store `2026-11-22T05:30:00Z` regardless of the server's own time
   zone (Vercel runs UTC, iltan's WSL may not). Pinned in Task 3 (`istanbulToIso`, `isoToIstanbul` round trip).
4. **A non-organiser reading events through the API during the gate** (active member, ön alım member holding an
   organiser role, anon) gets no rows and can't call the RPCs. Pinned in Task 2's pgTAP.
5. **Editing a ride into a meet-up or reordering stops** replaces the places atomically: never a ride with one place
   or a meet-up with leftovers. Pinned in Task 2's pgTAP.

---

### Task 1: Map link parsing (spike first)

**Files:**
- Create: `src/lib/events/place-input.ts`, `src/lib/events/place-input.test.ts`
- Modify: `docs/learnings/` (new entry in a fitting file, or `domain.md`) — formats found

**Interfaces:**
- Produces: `type LatLng = { lat: number; lng: number }`; `parsePlaceInput(text: string): LatLng | null` (no network);
  `isAllowedMapUrl(url: URL): boolean`; `isShortMapUrl(url: URL): boolean` (needs a redirect to learn the point).

- [ ] **Step 1: Spike.** With real links iltan provides (a Google Maps place shared from the phone app =
  `maps.app.goo.gl/…`, a dropped Google pin, a Google desktop URL, a Yandex Maps share link, an Apple Maps share
  link), follow each with `curl -sI` (only those hosts), note the final URL shapes and where the coordinates sit.
  Write the learnings entry (formats, which value is the place vs. the viewport, Yandex lng-first).
- [ ] **Step 2: Write the failing tests** — a table of `[input, expected]` built from the spike's real URLs plus:
  `"41.0255, 29.0154"` and `"41.0255,29.0154"` → `{ lat: 41.0255, lng: 29.0154 }`; Google `…/@41.01,28.97,17z/data=…!3d41.0255!4d29.0154`
  → the `!3d/!4d` pair (the place, not the `@` viewport); Google `?q=41.0255,29.0154`, `query=`, `destination=`, `ll=`;
  Apple `?ll=41.0255,29.0154` and `coordinate=`; Yandex `?pt=29.0154,41.0255`, `ll=29.0154,41.0255`,
  `whatshere%5Bpoint%5D=29.0154%2C41.0255` → lat 41.0255 / lng 29.0154; out of range (`"95, 29"`), plain words, an
  empty string, a short link → `null`. `isAllowedMapUrl`: true for https `maps.app.goo.gl`, `goo.gl/maps/…`,
  `www.google.com/maps…`, `www.google.com.tr/maps…`, `maps.google.com`, `yandex.com.tr/maps…`, `yandex.com/maps…`,
  `yandex.ru/maps…`, `maps.apple.com`, `maps.apple`; false for `http:` URLs, `maps.app.goo.gl.evil.com`,
  `evil.com/maps.app.goo.gl`, `www.google.com/search`, `169.254.169.254`, `localhost`, user-info URLs
  (`https://x@maps.apple.com`), non-default ports. `isShortMapUrl`: true for `maps.app.goo.gl/*`, `goo.gl/maps/*`,
  `yandex.*/maps/-/*`, `maps.apple/p/*`.
- [ ] **Step 3: Run `node --test src/lib/events/place-input.test.ts`** — expected FAIL (module not found).
- [ ] **Step 4: Implement** in `place-input.ts` (dependency-free; regexes over the decoded URL/text; first match in
  the order: plain pair, `!3d!4d`, query params by host, `@` pair last).
- [ ] **Step 5: Run the test** — expected PASS. Full check line.
- [ ] **Step 6: Commit** — `feat(events): parse coordinates from pasted map links`.

### Task 2: `events.manage`, tables, gate and write RPCs

**Files:**
- Modify: `supabase/schemas/05_roles.sql` (enum value `'events.manage'` + comment)
- Create: `supabase/schemas/40_events.sql`, `supabase/tests/database/events.test.sql`
- Create: migrations `<generated>_events_1.sql`, `<generated>_events_2.sql` (or as generated)
- Modify: `src/lib/supabase/database.types.ts`, `messages/tr.json` + `messages/en.json`
  (`Admin.permissions.events.manage.label` "Etkinlikleri yönetme" / "Manage events", `.description` "Buluşma ve
  sürüş oluşturur, düzenler, iptal eder." / "Creates, edits and cancels meet-ups and rides.")

**Interfaces:**
- Produces: enums `public.event_kind ('meetup','ride')`, `public.event_status ('scheduled','cancelled')`; tables
  `public.events (id, kind, title, side istanbul_side null, area, starts_at, ends_at, description, limit_people,
  limit_bikes, min_cc, full_members_only bool default false, status default 'scheduled', cancel_reason, cancelled_at,
  created_by → profiles on delete set null, updated_by → profiles on delete set null, created_at, updated_at)` and
  `public.event_places (id, event_id → events on delete cascade, position smallint, name, lat numeric(9,6), lng
  numeric(9,6), unique (event_id, position))`; RPCs:
  - `public.save_event(p_id uuid, p_event jsonb, p_places jsonb) returns uuid` — `p_id` null = create. `p_event` keys:
    `kind, title, side, area, starts_at, ends_at, description, limit_people, limit_bikes, min_cc,
    full_members_only`; `p_places`: array of `{ name, lat, lng }` in route order. Replaces all places.
  - `public.cancel_event(p_id uuid, p_reason text) returns void`
  - `public.delete_event(p_id uuid) returns void` (branch 2 adds "only without sign-ups").
  - Errors: `42501` without `events.manage`; `P0002` unknown id; `22023` invalid input (place count for the kind,
    ride without area, meet-up with area, editing a cancelled event, kind unknown); check constraints `23514`.

- [ ] **Step 1: Write `events.test.sql`.** Fixtures: 0741 admin (built-in admin role), 0742 organiser (active, role
  0749 holding only `events.manage`), 0743 active member without role, 0744 probation member holding role 0749, 0745
  organiser in `deleting`; one ride (0751, 3 places) and one meet-up (0752) planted as postgres. Assertions:

```sql
-- grants: anon has no select on events/event_places; authenticated has select only (no insert/update/delete)
select ok(not has_table_privilege('authenticated', 'public.events', 'insert'), 'no direct insert');
-- gate (RLS): 0742 and 0741 see both fixture events; 0743, 0744, 0745 see none; anon sees none
select is((select count(*)::int from public.events where id in ('…0751','…0752')), 0, 'member sees no events before release');
-- create as 0742: a meet-up with one place, a ride with start/stop/finish; created_by = updated_by = 0742
select isnt(public.save_event(null, '{"kind":"meetup","title":"Moda akşam","side":"asian","starts_at":"2026-12-01T17:00:00Z"}', '[{"name":"Moda Sahili","lat":40.98,"lng":29.02}]'), null, 'organiser creates a meet-up');
-- must fail (22023): meet-up with 2 places; ride with 1 place; ride without area; meet-up with area; 13 places
select throws_ok($$ select public.save_event(null, '{"kind":"ride","title":"Ağva","starts_at":"2026-12-06T05:30:00Z"}', '[{"name":"Üsküdar","lat":41.02,"lng":29.01}]') $$, '22023', null, 'ride needs start and finish');
-- must fail (23514): ends_at before starts_at; lat 95; limit_people 0; min_cc 40; title of 81 chars
-- must fail (42501): 0743, 0744 (probation with the role), 0745 (deleting) call save/cancel/delete
-- edit as 0742: ride 0751 → meet-up with one place: exactly 1 row left in event_places, positions 0..n-1 after a reorder
-- updated_by becomes the editor, updated_at moves
-- cancel: status cancelled, cancelled_at set, reason trimmed; save_event on a cancelled event → 22023
-- delete: rows and places gone; unknown id → P0002
-- profile delete: deleting 0742's auth user sets created_by/updated_by null, the event stays
```

- [ ] **Step 2: Run `pnpm db:test`** — expected FAIL (missing enum value / table).
- [ ] **Step 3: Schema.** Enum value in `05_roles.sql`. `40_events.sql`: enums, tables with the Global Constraints
  checks (a ride-area check: `(kind = 'ride') = (area is not null)`), index `events (starts_at, id)`; `revoke all …
  from anon, authenticated`, `grant select` on both tables to `authenticated`; RLS on both with one select policy
  each: `(select private.has_permission('events.manage'))` — comment it as the release gate branch 2 widens. RPCs:
  `security definer`, `set search_path = ''`, check `private.has_permission('events.manage')` first (else `42501`),
  validate kind/place count/area (`22023`), lock the event row `for update` on edit/cancel/delete, set
  `updated_by = auth.uid()`, `updated_at = now()`, replace places (delete + insert with `position` 0..n-1).
  `revoke all … from public, anon`, `grant execute … to authenticated`. Trimming happens in the RPC (`btrim`,
  empty → null for optional texts). Generate `pnpm db:migration events`, review, `pnpm db:reset`.
- [ ] **Step 4: Run `pnpm db:test`** — expected PASS (all files; `roles.test.sql` counts permissions dynamically).
- [ ] **Step 5: `pnpm db:types`**, permission messages, full check line.
- [ ] **Step 6: Commit** — `feat(db): events and places behind events.manage, write RPCs`.

### Task 3: Event form schema, time and navigation helpers

**Files:**
- Create: `src/lib/events/schema.ts` (+ `.test.ts`), `src/lib/events/time.ts` (+ `.test.ts`),
  `src/lib/events/nav-links.ts` (+ `.test.ts`)
- Modify: `src/lib/applications/contact.ts` (+ test): `whatsAppShareUrl`

**Interfaces:**
- Consumes: `LatLng` (Task 1).
- Produces:
  - `istanbulToIso(local: string): string | null` ("YYYY-MM-DDTHH:mm" → ISO UTC, null when malformed);
    `isoToIstanbul(iso: string): string` (inverse, for the edit form).
  - `eventInputSchema` (Zod) over `{ kind, title, side, area, startsAt, endsAt, description, limitPeople,
    limitBikes, minCc, fullMembersOnly, places: { name, lat, lng }[] }` with the Global Constraints values and the
    kind rules (meet-up: 1 place, no area; ride: 2–12 places, area required); `startsAt`/`endsAt` are Istanbul wall
    times "YYYY-MM-DDTHH:mm" (what `datetime-local` sends) and must convert with `istanbulToIso`;
    `type EventInput = z.infer<…>`; `toRpcArgs(input: EventInput): { p_event: Json; p_places: Json }` (converts the
    times to ISO UTC, maps camelCase to the RPC keys).
  - `navLinks(place: { name: string } & LatLng): { open: { google: string; apple: string; yandex: string }; route:
    { google: string; apple: string; yandex: string; yandexNavi: string }; coords: string }` (URLs exactly as in
    Global Constraints, `coords` = `"41.025500, 29.015400"`).
  - `whatsAppShareUrl(text: string): string` = `https://api.whatsapp.com/send?text=<encoded>`.

- [ ] **Step 1: Write the failing tests:** `istanbulToIso("2026-11-22T08:30") === "2026-11-22T05:30:00.000Z"`, run
  under `TZ=America/New_York` too (spawn or `process.env.TZ` before import) with the same result;
  `isoToIstanbul("2026-11-22T05:30:00.000Z") === "2026-11-22T08:30"`; `istanbulToIso("2026-02-30T08:30") === null`;
  schema accepts a valid meet-up and a valid ride; rejects ride with one place, meet-up with area, 81-char title, ends
  before starts, `limitPeople: 0`, `minCc: 40`, lat 95; `navLinks` returns the exact Global Constraints strings for
  `{ name: "Moda Sahili", lat: 40.98, lng: 29.0254 }` (Apple `q` URL-encoded); `whatsAppShareUrl("Pazar 08:30 →
  Ağva")` encodes the text and has no `phone=`.
- [ ] **Step 2: Run them** — expected FAIL.
- [ ] **Step 3: Implement** (fixed `+03:00` offset, no `Intl` time-zone math needed; validate the date round-trips).
- [ ] **Step 4: Run them** — PASS. Full check line.
- [ ] **Step 5: Commit** — `feat(events): form schema, Istanbul time and navigation links`.

### Task 4: Queries and server actions

**Files:**
- Create: `src/lib/events/queries.ts`, `src/lib/events/actions.ts`, `src/lib/events/resolve-place.ts` (+ `.test.ts`)

**Interfaces:**
- Consumes: Tasks 1–3; `readAll`, `uniqueById`, `PAGE_SIZE`, `LIST_CEILING` (`src/lib/pagination.ts`).
- Produces:
  - `type EventPlace = { name: string; lat: number; lng: number }`; `type EventSummary = { id; kind; title; side;
    area; startsAt; endsAt; status; places: EventPlace[] }`; `type EventDetail = EventSummary & { description;
    limitPeople; limitBikes; minCc; fullMembersOnly; cancelReason; createdByName: string | null; updatedByName:
    string | null; updatedAt }`.
  - `listUpcomingEvents(): Promise<{ events: EventSummary[]; overCeiling: boolean }>` — `starts_at >= now() - 12 h`
    or `ends_at >= now()` (a ride in progress stays upcoming), ordered `starts_at, id`, via `readAll`.
  - `listPastEvents(page: number): Promise<{ events: EventSummary[]; total: number }>` — the rest, newest first,
    `PAGE_SIZE` per page, `count: "exact"`.
  - `getEvent(id: string): Promise<EventDetail | null>` (null for an invalid uuid or no row).
  - `resolvePlace(text: string, fetchImpl?: typeof fetch): Promise<{ status: "ok"; point: LatLng } | { status:
    "invalid" | "unresolved" }>` — `parsePlaceInput` first; else, only for `isShortMapUrl`, follow up to 3 redirects
    manually (`redirect: "manual"`, 5 s `AbortSignal.timeout`), every hop must pass `isAllowedMapUrl` or it stops
    with `unresolved`; parse the final `Location`.
  - Actions (`"use server"`): `resolvePlaceLink(text: string)` (wraps `resolvePlace`), `saveEvent(id: string | null,
    input: unknown): Promise<{ status: "ok"; id: string } | { status: "invalid" | "forbidden" | "error" }>`,
    `cancelEvent(id: string, reason: string)`, `deleteEvent(id: string)` → `{ status: "ok" | "invalid" | "forbidden"
    | "notFound" | "error" }`. Error map: `42501` → forbidden, `22023`/`23514` → invalid, `P0002` → notFound; call
    `refresh()` after success (create returns the id; the page redirects).

- [ ] **Step 1: Write `resolve-place.test.ts`** with a fake `fetchImpl`: a direct coordinate input never fetches; a
  short link redirecting to a Google place URL resolves; a redirect to `https://evil.com/…` → `unresolved` and the
  fake records no request to evil.com; 4 chained redirects → `unresolved`; a non-map URL → `invalid` with zero
  fetches; a thrown/aborted fetch → `unresolved`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** `resolve-place.ts`, then `queries.ts` and `actions.ts`
  (validate with `eventInputSchema`, call the RPCs from Task 2 through the session client).
- [ ] **Step 4: Run** `pnpm test` — PASS. Full check line.
- [ ] **Step 5: Commit** — `feat(events): queries, actions and safe short-link resolving`.

### Task 5: `/events` and `/events/past` behind the gate

**Files:**
- Modify: `src/app/[locale]/events/page.tsx`
- Create: `src/app/[locale]/events/past/page.tsx`, `src/components/events/event-card.tsx`,
  `src/components/events/route-strip.tsx`, `src/components/events/events-list.tsx` (client: chips),
  `src/components/events/events-skeleton.tsx`
- Modify: `messages/tr.json`, `messages/en.json` (namespace `Events`)

**Interfaces:**
- Consumes: `listUpcomingEvents`, `listPastEvents`, `getCurrentUser`, `can`, `useListParams`, `PagerLinks`,
  `ComingSoon`.
- Produces: `<EventCard event={EventSummary} />` (design-system §6: route strip on top, date block, title, "08:30 ·
  Üsküdar → Ağva" from the first/last place names, status pill "İptal edildi" struck through), `<RouteStrip
  places={EventPlace[]} />` (start ring, stop dots, orange finish; place names; reused by Task 6).

- [ ] **Step 1: Page.** `/events` keeps its static metadata (`index: false`). Body: a Suspense boundary whose fallback
  is `ComingSoon` (what everyone but organisers keeps seeing during the gate); inside, `getCurrentUser()` → not
  `can(…, "events.manage")` → `ComingSoon`; else the heading, "Etkinlik oluştur" (`buttonVariants` on `Link` to
  `/events/new`), "Geçmiş" link, chips (Tümü / Anadolu / Avrupa, Buluşma / Sürüş; URL state through
  `useListParams`, keys `side`, `kind`), the total, the cards, an empty state, `CeilingNotice` above the ceiling.
- [ ] **Step 2: `/events/past`** — `requirePermission("events.manage", "/events/past")`, `?page=N` server paging
  exactly like `/admin/applications` (odd values redirect, `PagerLinks`, total shown), newest first, `noindex`.
- [ ] **Step 3: Copy** in both message files (headlines: offer iltan 2–3 options in the task report).
- [ ] **Step 4: Verify** — full check line; `pnpm build` passes the Cache Components rules.
- [ ] **Step 5: Commit** — `feat(events): organiser event lists behind the release gate`.

### Task 6: Event detail with place actions, share, cancel and delete

**Files:**
- Create: `src/app/[locale]/events/[id]/page.tsx`, `src/components/events/place-actions.tsx` (client),
  `src/components/events/share-event-button.tsx` (client), `src/components/events/cancel-event-dialog.tsx`,
  `src/components/events/delete-event-dialog.tsx`
- Modify: messages

**Interfaces:**
- Consumes: `getEvent`, `navLinks`, `whatsAppShareUrl`, `cancelEvent`, `deleteEvent`, `RouteStrip`.

- [ ] **Step 1: Page** (`requirePermission("events.manage", …)`, `notFound()` for a missing event, `noindex`): kind,
  title, date/time range (Istanbul, `getFormatter`), side, area (rides), description, limits and requirements as
  text ("En az 400 cc", "Sadece tam üyeler"), "Düzenleyen: {createdByName}" (nothing when null; "Son düzenleme:
  {updatedByName}, {date}" when someone else edited it), the route strip, per place
  "Konumu aç" and "Yol tarifi" menus (Google Maps, Apple Maps, Yandex; route also Yandex Navi) plus "Koordinatları
  kopyala"; "Düzenle" link; share; cancel (reason, optional) and delete, each confirmed in an `AlertDialog`.
  Cancelled: banner "İptal edildi" + reason; edit/cancel hidden; delete stays.
- [ ] **Step 2: Share text** (organiser): `"{title}\n{weekday date time}\n{start name}{ → finish name}\n{url}"`; for a
  cancelled event the first line is "İPTAL: {title}" + the reason. Absolute URL from the request host is not
  available in a client component: build it from `window.location.origin` + the localized path.
- [ ] **Step 3: Verify** full check line. **Step 4: Commit** — `feat(events): event page with navigation, sharing,
  cancel and delete`.

### Task 7: Create and edit form

**Files:**
- Create: `src/app/[locale]/events/new/page.tsx`, `src/app/[locale]/events/[id]/edit/page.tsx`,
  `src/components/events/event-form.tsx` (client), `src/components/events/place-field.tsx` (client)
- Modify: messages

**Interfaces:**
- Consumes: `eventInputSchema`, `istanbulToIso`, `isoToIstanbul`, `resolvePlaceLink`, `saveEvent`, `navLinks`.

- [ ] **Step 1: Form.** Kind radio (Buluşma / Sürüş) switches between one place ("Buluşma yeri") and Başlangıç /
  Duraklar (add/remove/move up/down, ≤ 10) / Varış with a "Başlangıca dönüş" checkbox that copies the start into the
  finish. Fields per Global Constraints; `datetime-local` inputs; area only for rides with the hint "Ziyaretçiler de
  görecek: tam yeri yazma (ör. Üsküdar → Ağva)". `PlaceField`: name + "Harita linki veya koordinat"; on paste/blur it
  calls `resolvePlaceLink` and shows the coordinates with a "Konumu aç" (Google) check link, or the error "Bu linkten
  konum okunamadı; koordinatı yapıştır (ör. 41.0255, 29.0154)". Save is disabled while any place is unresolved.
- [ ] **Step 2: Submit** → `saveEvent`; ok → `router.push("/events/{id}")`; errors shown inline (invalid, forbidden,
  error). Edit page prefills from `getEvent` (`isoToIstanbul`); a cancelled event redirects to its page.
- [ ] **Step 3: Verify** full check line. **Step 4: Commit** — `feat(events): create and edit form with map-link
  places`.

### Task 8: Browser E2E, skeletons, docs

**Files:**
- Create: `scripts/e2e/events-e2e.mjs`
- Modify: `scripts/e2e/README.md`, `CLAUDE.md` (E2E list in Commands; Database section: one line on events + gate),
  `docs/follow-ups.md` (deferred items from this branch), `docs/learnings/*` (anything found)

- [ ] **Step 1: E2E** (local stack, `pnpm start -p 3123`, fixtures `admin@test.local` with the admin role,
  `member@test.local` active, `probation@test.local` with an organiser role): organiser creates a ride with a pasted
  Google URL + coordinates, sees it on `/events`, filters by side and kind (no request), opens the detail, checks the
  three open URLs and the Yandex lng-first order in the hrefs, edits the start time (stored UTC = wall − 3 h, read
  back via `psql`), cancels with a reason (banner, struck card), deletes; `/events/past` paging with planted past
  events (> 25); the member and the probation organiser get the "coming soon" `/events` and a 404 on `/events/{id}`
  and `/events/new`; the WhatsApp share href has `text=` and no `phone=`. 390px and 1280px. Fixture rows cleaned
  before/after via `docker exec … psql`.
- [ ] **Step 2: Skeletons** — measure `events-skeleton` against the organiser list with `scripts/e2e/skeletons.mjs`
  (JS off), adjust.
- [ ] **Step 3: Docs** — README entry, CLAUDE.md lines, follow-ups (incl. the gate's ComingSoon fallback flash for
  organisers, to be replaced by the real skeleton logic in branch 2), learnings.
- [ ] **Step 4: Verify** — full check line, `pnpm db:test`, the new E2E plus `nav-e2e.mjs` and `apply-nav-e2e.mjs`
  (layout untouched). **Step 5: Commit** — `test(e2e): events organiser flow; docs`.
