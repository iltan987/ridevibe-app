# Events release (branch 2b) — design

Date: 2026-11-24. Status: approved by iltan (2026-11-24). Builds on `2026-11-20-events-design.md` (the "events spec"; its
§3 roles, §6 sharing, §7 pages, §8 privacy and §9 delivery stay valid unless this document changes them). Backlog
source: `docs/follow-ups.md`, "Next up" → "Events branch 2b: the release". **(iltan)** marks iltan's decisions,
**(Claude)** calls iltan can still correct.

## 1. Intent

Branches 1 and 2a built Events behind a gate: only organisers (`events.manage`) see them, so iltan could try
everything on production. The release opens Events to the club and shows a safe teaser to everyone else, so the app
becomes the one place where an event lives (events spec §1) and a shared event link works for whoever receives it.

iltan's production check (in progress, "so far good") found one thing: the WhatsApp share is a bare text. It should
carry the event link **(iltan)**, and the link's preview in WhatsApp should show that event, not the club's general
card, as a generated image **(iltan: worth it; the club already posts an AI-made poster per event in its WhatsApp
channel)**.

Success: an organiser shares a ride to the WhatsApp group; the message shows a card with the ride's title, day and
area; members tap it and land on the event (signed in) or on sign-in that returns them to it; a forwarded non-member
sees the same card and a way to apply; visitors find upcoming rides on `/events` and the home page.

## 2. Goals, non-goals, anti-goals

**Goals**
- Open the gate: active and ön alım members see and join events per the events spec §3.
- Visitor teaser on `/events` and a home section with the next rides; "Etkinlikleri Gör" back in the hero.
- Event link in the share text; a plain share for members; a per-event link preview with a generated image.
- A non-member opening an event link sees that event's teaser card, not a 404 **(iltan, option B)**.
- `/events` indexable and in the sitemap; privacy notice events section with one version bump.
- The leftovers the backlog item lists (gate code and comments, E2E gate swaps, skeletons per viewer, install banner,
  `refresh()` after refusals, join-panel focus, navigation check).

**Non-goals**
- Branch-1/2a details waiting for iltan's production check ("Event card / page / form details to settle", "Events
  joining: small features left out"): only what iltan raises from the check joins this branch, and only when it
  belongs to this release's work (§6).
- Uploading the organisers' own poster as the cover (follow-up "Event poster upload": needs image storage).
- Map, notifications, waiting list (events spec non-goals).

**Anti-goals**
- Anything public (teaser, home section, preview card, preview image, page metadata) showing a time, a place name or
  coordinates, the description, counts, or anyone's name (events spec §2: where and when a group of bikes is parked).
- A public read that returns more than it shows (e.g. the full `starts_at` "because the page only formats the day").
- The home page becoming slow or request-time for everyone because of the rides list.

## 3. Who sees what (changes to the events spec §3)

| Viewer | `/events` | `/events/[id]` | Link preview (anyone holding the URL) |
|---|---|---|---|
| Signed out, pending, inactive | Teaser: upcoming **rides**, not cancelled: day, title, kind, area. Cards don't link anywhere (events spec §7). | **Teaser card of that event** (§5) | title, kind, day, area line, "İptal edildi" |
| Ön alım, active, organiser | As built in 2a | As built in 2a | same |

- The preview and the per-event teaser card show **meet-ups too** (title, kind, day; a meet-up has no area line),
  unlike the list teaser: the link reaches only those it was shared with **(iltan, 2026-11-24)**. The list teaser and
  the home section stay rides-only (events spec §3).
- Past and cancelled events: the per-event card and preview still show (day + "İptal edildi" when cancelled); the list
  teaser and the home section show only upcoming, scheduled rides **(Claude: a cancelled ride is no invitation)**.
- `deleting` accounts are treated like signed-out visitors (no rights, CLAUDE.md) **(Claude)**.

## 4. Approaches

**Public read** (the teaser, the home section, the card, metadata and image all need event data without a session):
1. *Chosen:* two `public` security-definer RPCs granted to `anon` and `authenticated` that return only the safe
   fields, with the day computed in SQL (`(starts_at at time zone 'Europe/Istanbul')::date`), so the time never
   leaves the database. Matches the project's pattern (`club_overview()` for ön alım members) and keeps the table
   policies members-only.
2. An `anon` select policy on `events` with column grants: can't hide the time (the day needs `starts_at`) or
   filter meet-ups out of the list per column; a policy mistake would publish everything.
3. A server-side read with the secret key: bypasses RLS entirely; one wrong select publishes the roster.

**Freshness of the public data** (the home page is static today):
1. *Chosen:* cached reads (`"use cache"` + a cache tag, a cache life of about an hour, so a passed ride drops off within about an hour after Istanbul midnight) refreshed by the
   organiser actions (save, cancel, delete) through tag invalidation. The home page and `/events` teaser stay fast.
   First use of `"use cache"` in the project: needs a cookie-less Supabase client (a cache scope can't read cookies),
   and the learnings file gets the findings.
2. A request-time hole behind `<Suspense>`: always fresh, but every visit (ads traffic) waits on the database.

**Link preview image** — iltan chose a generated image over the generic club image with per-event text.

**Non-member on an event link** — iltan chose the event's teaser card (option B) over the sign-in page (option A:
a curious non-member signs in, becomes a pending account and meets a 404).

## 5. The pieces

### 5.1 Gate
One migration replacing `private.can_see_events()`'s body with `select private.is_club_member()` (events spec §9;
2a built every read and RPC on it). pgTAP gate assertions flip (members and ön alım see and join; pending, inactive,
deleting, anon don't), their in-transaction swap goes. E2E: `events-e2e.mjs` `gateScenario` and
`events-join-e2e.mjs`'s gate open/restore change to the released rules. Comments that say "organisers only" go (list
in the backlog item).

### 5.2 Public RPCs (names left to the builder)
- **Teaser list:** scheduled rides whose Istanbul **day** is today or later; returns id-less rows: day, title, kind,
  area, side. The filter works on the day, never on `starts_at` against `now()`: the RPC is callable directly with the
  public key, and a ride vanishing at its start time would publish the time to anyone polling it **(Claude, builder
  check)**. A ride stays in the teaser until its day ends (members' "upcoming" keeps its own 12 h grace); cached
  pages drop it within about an hour after Istanbul midnight (hourly cache life). pgTAP: a ride later today and one that started an hour ago today are
  both listed; yesterday's is not. No id: the list cards don't link, and an id would let anyone call the per-event read for every ride
  **(Claude)**. Read fully with `readAll` under `LIST_CEILING` (CLAUDE.md lists); ordered by start then id.
- **One event:** by id (uuid; malformed → no row, never an error page): title, kind, day, area (rides only),
  cancelled flag. Any event, past or future.
- Both `stable`, `set search_path = ''`, granted to `anon, authenticated` only; pgTAP proves the exact column set
  (no time, places, description, counts, names, ids where stated) and that meet-ups never come out of the list.
- Event ids are random uuids (`gen_random_uuid()`), so the per-event read can't be walked.

### 5.3 `/events` for non-members
Intro text (SEO, what rides are like, links to apply) + the teaser cards + apply / sign-in buttons (the existing
`HomeApplyButton` logic decides whether "Başvur" shows). Empty state when no ride is upcoming. `/events` becomes
indexable (`pageMetadata` `index` true) and joins `PUBLIC_PATHS` in `src/app/sitemap.ts`. The "Çok yakında" fallback
goes: the Suspense fallback becomes the skeleton of what the viewer will see (session-cookie hint, CLAUDE.md loading
states). Copy: Turkish first, 2–3 headline options for iltan.

### 5.4 `/events/[id]` for non-members (option B)
Instead of sign-in / 404: the event's card (kind, title, day, area, "İptal edildi") and below it
- signed out: "Giriş yap" (returns to this event via the existing `?next=` path) and "Başvur";
- pending / inactive: what `/apply` would offer them (the `applyView` answer: apply, "under review", or nothing).
An unknown or malformed id: the normal 404. The page stays `noindex` **(events spec §7)**.

### 5.5 Home section and hero
A section after `HomeRides` inside the route line: the next **3** upcoming rides as teaser cards and a link "Tüm
etkinlikler" to `/events` (it shows them all, so no silent cap) **(Claude)**. No upcoming ride → the section is not
rendered **(Claude)**. "Etkinlikleri Gör" returns as the hero's secondary button (follow-up item). The home page stays
prerendered (§4 freshness).

### 5.6 Sharing
- **Organiser text** (2a `shareText`): unchanged lines + the absolute event URL last (origin + `getPathname`, the
  viewer's locale). Text first, link last, so WhatsApp builds its preview from the link.
- **Members** (ön alım too): a "Paylaş" button with title + day + link only (no time or place: the preview carries
  the safe part, the link the rest for members) **(Claude, events spec §6)**. Same `whatsAppShareUrl()`.

### 5.7 Link preview
- `generateMetadata` on `/events/[id]` reads the public one-event read: title `<event title>`, description like
  "Sürüş · 29 Kasım Cumartesi · Üsküdar → Ağva" ("İptal edildi · …" when cancelled), in the page's locale, `noindex`
  kept. Unknown id → the generic metadata.
- A generated Open Graph image per event (`opengraph-image` in `events/[id]`, `ImageResponse`), 1200×630, club style:
  ```
  ┌──────────────────────────────────────────────────────┐
  │ [badge]  RIDE & VIBE                     SÜRÜŞ        │  dark "Gece" background
  │                                                      │
  │  Ağva kahvaltı sürüşü                                │  Saira, condensed, bold
  │  29 Kasım Cumartesi                                  │  orange accent
  │  ○──────●──────●  Üsküdar → Ağva                     │  route strip motif (rides)
  │                                    [İPTAL EDİLDİ]    │  only when cancelled
  └──────────────────────────────────────────────────────┘
  ```
  Saira needs a TTF/OTF file in the repo (`ImageResponse` takes ttf/otf/woff only; OFL licence, add its notice);
  Turkish characters must render (test "İ", "ı", "ş", "ğ"). Long titles wrap to two lines, then ellipsis. Unknown id →
  the club's generic image. Uppercase only in source text, never by CSS on Turkish words (CLAUDE.md).
- WhatsApp caches previews per URL: a later edit may not change an already-posted card. Accepted.

### 5.8 Members' side
`<InstallBanner />` on `/events` for active and ön alım members; event page skeletons per viewer (organiser /
member / ön alım / non-member card) and the `/events` fallback per the backlog's "Loading states" items; `refresh()`
after `refused` / `notFound` / `hasSignups` in `src/lib/events/actions.ts`; join-panel focus when controls disable or
unmount; navigation check of the tab bar at 390 px (labels, spacing) with events live.

### 5.9 Privacy notice
A short events section: sign-ups (rider/passenger, guest count, never guest names), who created/changed an event;
purpose: organising the club's events; legal basis: legitimate interest (KVKK m.5/2-f; Claude confirms against the
law text when writing); retention per events spec §8; public teaser data contains no personal data. One
`PRIVACY_NOTICE_VERSION` bump.

## 6. Constraints

- Everything in CLAUDE.md applies (security model, pgTAP first incl. must-fail cases, scoped to fixtures for the
  production run; lists; loading states; i18n parity; lint rules; SEO helper).
- Rollout: iltan's production check first; tick `events.manage` for Organizatör; `pnpm db:push` (gate + RPCs), then
  push `main` right away (the old deploy already works for members once the gate opens, so the order is safe).
  After the push: `has_function_privilege('anon', …)` checks on the new RPCs, `seo-check.mjs` against production.
- One release, one branch **(iltan, 2026-11-24)**: the preview, the link and the gate go live together (a two-step
  rollout testing the WhatsApp preview with the gate still closed was offered and declined). So the real-phone checks
  happen right after the rollout: the preview card in a WhatsApp chat (Android, iPhone), and tapping the link opens a
  browser Google sign-in accepts (Android Custom Tab / iOS Safari); if WhatsApp uses an in-app web view somewhere, add
  it to `detectInAppBrowser` as a fix right away. Before the merge, the builder checks the image route and the
  metadata locally (fetch the HTML head and the PNG; `seo-check.mjs`-style), so only WhatsApp's own rendering is left
  for production.
- iltan's production check keeps running during the build **(iltan)**: Claude sorts each new item — part of this
  release's work (teaser cards, skeletons, sharing, the event page as members see it) → fixed in this branch; separate
  work → `docs/follow-ups.md`.

## 7. Left to the builder

RPC and component names, the cache tag and cache life, how the cookie-less client is built, exact image layout and
sizes, copy (Turkish first, "sen", 2–3 headline options), the order of tasks, skeleton measurements.
