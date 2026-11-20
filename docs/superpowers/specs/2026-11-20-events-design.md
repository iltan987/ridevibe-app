# Events (core) — design

Date: 2026-11-20. Status: approved by iltan (2026-11-20). PLAN.md MVP step 3. Decisions below marked **(iltan)** were made
in the brainstorming conversation; **(Claude)** marks calls made by Claude that iltan can still correct.

## 1. Intent

Ride & Vibe organises everything in WhatsApp today. Nothing is badly broken, but a ride is a short message:
people struggle to find the meeting point, changes to the route or time get lost in the chat, and upcoming rides with
requirements (e.g. "400+ cc only") will be hard to announce to a group where most people can't join them. The app
should become the one place where an event's details live, always current, with a one-tap way to get there.

Success: organisers post their meet-ups and rides in the app instead of (or linked from) WhatsApp; members find the
place with their own navigation app; a changed time is visible on the event; the organiser knows roughly who is
coming, on how many bikes.

## 2. Goals, non-goals, anti-goals

**Goals (this design, "Events core")**
- Organisers create, edit, cancel events of two kinds: **Buluşma** (meet-up) and **Sürüş** (ride).
- Every place opens in the member's own navigation app ("open the place" and "route there").
- Members join as rider or passenger, may bring non-member guests; optional limits on people and bikes;
  requirements (minimum cc, full members only).
- Changes are visible on the event; the organiser can share an event or a change to WhatsApp in one tap.
- Visitors see a teaser of upcoming rides; members see everything.

**Non-goals (later iterations, in this order)**
1. A real map (MapLibre + tiles, picking points on a map, place search) — iteration 2; the coordinates stored now
   feed it.
2. Notifications (Web Push: service worker, opt-in, reminders via pg_cron) and the **waiting list** (it only makes
   sense when the person who moves up is told) — iteration 3. No paid service needed (Web Push, VAPID keys, the
   `web-push` package after iltan approves it; iOS 16.4+ home-screen apps only).
3. Attendance (who actually came), ride counts — PLAN Phase 2.
4. GPX upload, recurring events, events created by regular members ("no personal events", iltan).

**Anti-goals**
- Publishing exact meeting points, times or names of participants to people who are not members (safety: where a
  group of bikes is parked and when).
- A hard rule that keeps members away from the first rides in the app (no required emergency contact, iltan).
- A silent waiting list that moves people up without telling them.
- Personal data in anything shared outside the app (WhatsApp texts carry the event, never the roster).

## 3. Who can do what

| Who | Can |
|---|---|
| Visitor / pending / inactive account | `/events` teaser and the home section: upcoming **rides** only — day, title, kind and the ride's **public area line** (§4, e.g. "Üsküdar → Ağva"). Never place names, coordinates, stops, time, description, counts or names. Meet-ups are never shown. A button to apply (or the usual sign-in). |
| Ön alım (`probation`) member | All upcoming events and details; join every event not marked "sadece tam üyeler" (they see such events with that label and can't join). Rosters show **counts only**, no names (they see no other members, CLAUDE.md "ön alım"). They do see the organisers' names ("Düzenleyen: …"): staff acting for the club, whom they already meet in the ön alım WhatsApp group; who changed what in the change log is shown to organisers only **(Claude)**. |
| Active member | All events and details; join; the roster with names of active participants **while the event is upcoming**; after it, counts only (the names served coordinating the ride; KVKK minimisation) **(Claude)**. Ön alım participants appear only as a count ("+2 yeni üye") **(Claude: regular members don't see ön alım members today)**. |
| Organiser = new permission **`events.manage`** ("Etkinlikleri yönetme") | Create, edit, cancel any event (not only their own) **(iltan)**; delete an event only while nobody has joined **(Claude)**; the full roster incl. ön alım participants (with badge) and guests; share to WhatsApp. |
| `members.safety` holder | On the roster, open each participant's existing safety card (`member_safety_card`, logged as today). Organisers have this through the Organizatör role (PLAN), so no new safety access rule is needed. |

Who gets which role stays iltan's/Samet's decision (PLAN). One role per person stays; combinations are made as
combined roles (iltan asked; several roles per person → follow-up).

Profiles in `deleting` are hidden everywhere (rosters, counts shown to members and staff) like every other staff read
path (CLAUDE.md).

## 4. The event

| Field | Notes |
|---|---|
| kind | `meetup` (Buluşma) / `ride` (Sürüş) |
| title | required, short (e.g. "Ağva kahvaltı sürüşü", "Moda akşam buluşması") |
| side | `asian` / `european` / null (both or outside the city) — list filter, same enum as profiles **(Claude)** |
| starts_at | date + time, Europe/Istanbul |
| ends_at | optional; rides may run a half day, a full day or several days |
| places | meet-up: exactly one place. Ride: start, 0–n stops, finish (finish may equal the start for a loop) |
| description | optional free text (what to bring, pace, paid stop) |
| limit_people / limit_bikes | optional, each independent **(iltan)** |
| min_cc | optional; requirement for riders **(iltan)** |
| full_members_only | default false; true closes joining for ön alım members (PLAN) |
| area | rides only, required: a district-level line visitors see ("Üsküdar → Ağva", "Şile"); the form says it is public and must not name the exact spot **(Claude: place names are often exact cafés; a café + a date is an exact meeting point)** |
| status | `scheduled` / `cancelled` (+ optional cancel reason) |
| created_by / updated_by | shown as "Düzenleyen: …" on the event |

**Place:** a name ("Moda Sahili", "Ağva — Rıva yolu kahvaltıcı") plus coordinates. The organiser pastes a map link or
coordinates; the server extracts latitude/longitude. Accepted input: Google Maps links (long URLs with `@lat,lng` or
`!3d…!4d…`, and short `maps.app.goo.gl` links — the server follows the redirect), Yandex Maps links, Apple Maps links,
plain "41.0255, 29.0154". A link that yields no coordinates is refused with a hint to paste coordinates instead.
**Risk:** the short-link format is not documented by Google; the first task of the build is a spike that tries real
links and fixes the parser rules (and records them in `docs/learnings/`).

**Opening a place (every place, iltan):** two actions, "Konumu aç" (show the spot) and "Yol tarifi" (navigate there),
each offering Google Maps, Apple Maps and Yandex (Navi app when installed, Yandex Maps web otherwise), plus
"Koordinatları kopyala". Exact URL schemes are left to the builder (verify on Android and iPhone).

**Route display:** the design-system strip (`docs/superpowers/specs/2026-11-09-design-system-design.md` §6: start
ring, stop dots, orange finish, no map base) with the place names; each place tappable for the open/route actions.
Event card as in that spec: route strip on top, date block, title, "08:30 · Üsküdar → Ağva", capacity bar when a
limit is set, status pill.

## 5. Joining

- "Katılıyorum" → choose **Sürücü** (own bike) or **Artçı** (on someone's bike), and **misafir** 0–3 (non-members,
  always passengers) **(iltan: guests allowed; Claude: max 3, passengers only)**.
- Counts: people = members joined + guests; bikes = riders. Shown as "18 kişi · 12 motor", with limits
  "18 / 20 kişi · 12 / 15 motor".
- Limits **(iltan)**: joining (or raising one's guests, or switching to rider) is refused when it would exceed either
  limit. A passenger can still join when only the bike limit is reached.
- `min_cc`: a rider needs at least one bike in their profile with `cc >= min_cc` (bikes without a cc don't count);
  otherwise the join screen says why and links to `/account` to add the bike. Passengers and guests are not checked
  **(Claude)**.
- `full_members_only`: refuses ön alım members, rider or passenger.
- Joining closes at `starts_at`; also refused for cancelled events. Leaving/editing one's sign-up: until `starts_at`.
- No emergency contact required **(iltan)**: the join confirmation nudges members without one ("Acil durum kişisi
  ekle"), and the organiser's roster marks "acil durum kişisi yok".
- When an organiser later lowers a limit or raises `min_cc` below/above existing sign-ups, nobody is removed; the
  event shows "over the limit" to the organiser **(Claude)**.
- All join rules are enforced in the database (a security-definer RPC that locks the event row, so two people can't
  take the last seat), the UI only explains them.

## 6. Changes, cancelling, sharing

- **Change log:** when an event with at least one sign-up changes its time, places, limits or requirements, a row is
  recorded (what changed, old → new, when, by whom). The event shows a "Güncellendi" box: newest on top, e.g.
  "Başlangıç 08:30 → 09:00 · Cumartesi 21:14". Title/description edits are not logged **(Claude)**.
- **Cancel:** status "İptal edildi" + optional reason; the event stays listed (struck through) until its date
  passes; joining closes.
- **Share to WhatsApp** (organiser): a ready text with title, date/time, start place and the event link; after a
  change or cancel, the text leads with it ("Saat değişti: 09:00"). Uses `whatsAppUrl()` (never `wa.me`).
  Members get a plain "share" of the event link too **(Claude)**. Never the roster.

## 7. Pages

- **`/events`** (the existing tab): members — upcoming events (soonest first), filter chips Tümü / Anadolu / Avrupa
  and Buluşma / Sürüş, "Katıldıklarım"; a "Geçmiş" tab with past events (newest first, server-paged like
  `/admin/applications`, it grows without bound). Upcoming events are few: load them fully with the usual ceiling
  rule (CLAUDE.md lists). Visitors — the ride teaser (cards without links into details, plus apply/sign-in).
- **`/events/[id]`** — members: details, route strip with place actions, counts, join/leave, the change box, roster
  (per §3). Visitors/pending → sign-in or the teaser, never details.
- **Organiser:** "Etkinlik oluştur" on `/events`; create/edit form on its own page (kind switches between one place
  and the start/stops/finish list); cancel and delete (only without sign-ups) on the event.
- **Home page:** a section with the next few rides (teaser data, same for everyone — keeps the page static); the
  "Etkinlikleri Gör" hero button comes back (follow-up).
- **SEO:** `/events` becomes indexable with an intro text and the teaser (sitemap entry); event detail pages stay
  `noindex`; no `Event` JSON-LD (members-only details, no public venue; follow-up stays).
- Skeletons per the loading-states rules; `InstallBanner` on `/events` for members **(Claude)**.

## 8. Privacy (KVKK)

- New personal data: who joined which event as rider/passenger, how many guests, and who created/changed an event.
  Guests: only a count, never names.
- Purpose: organising the club's events; legal basis: legitimate interest (club operation) **(Claude decides, no
  lawyer — confirm against KVKK m.5/2-f when writing the notice)**.
- Retention **(Claude)**: deleting an account deletes only that person's own sign-ups (cascade); events they created
  stay, with `created_by` / `updated_by` / change-log authors set to null ("Düzenleyen" then shows nothing). Otherwise
  sign-ups follow "1 year after membership ends" (general retention job, follow-ups). After an event, members see
  counts only; organisers keep the roster (attendance and ride counts build on it later).
- Privacy notice: a short events section + bump `PRIVACY_NOTICE_VERSION`.
- WhatsApp share texts contain no personal data.

## 9. Delivery

Two branches, one plan each, same spec:
1. **Organiser side:** `events.manage`, schema (events, places), RLS + pgTAP, link parser (spike first),
   create/edit/cancel/delete, `/events` list (+ past) and detail without joining, place actions, WhatsApp share.
2. **Joining:** sign-ups, the join RPC (limits, `min_cc`, full members only, closing time), counts, rosters per role,
   safety-card links, "Katıldıklarım", emergency-contact nudge, the change log (it records only events with sign-ups,
   so it needs them); then the release: visitor teaser, home section, hero button, SEO, notice.
   (Sequencing changed while planning branch 1, 2026-11-20: the teaser, home section and change log would have been
   hidden or inert code until branch 2.)

**Release gate (iltan, option A):** after branch 1 is merged and deployed, only `events.manage` holders see events
(the list, details and the teaser); everyone else, visitors included, still gets the "coming soon" page, the home
section and the "Etkinlikleri Gör" hero button stay hidden, `/events` stays `noindex` and out of the sitemap.
Organisers can post real upcoming events on production meanwhile. Branch 2 opens everything at once: members and
visitors per §3, `/events` indexable + sitemap, home section + hero button, and the privacy notice changes once
(one `PRIVACY_NOTICE_VERSION` bump). The gate must be enforced in the database too (members can't read events
through the API before the release), and removed in branch 2 without leftovers (dead-code rule).

Each branch: pgTAP first for every permission rule (incl. must-fail cases, `deleting` excluded, ön alım rules),
browser E2E (create → join → change → cancel; visitor teaser shows no time/place details; probation sees counts only).

## 10. Left to the builder

Table and column names, RPC shapes, the exact link-parsing rules (after the spike), navigation URL schemes,
component structure, copy (Turkish first, "sen", 2–3 options for headlines), skeleton measurements.
