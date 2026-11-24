# Ride & Vibe Platform — Plan

Living document. Update it when decisions change.

## Goal

A web app (installable on Android & iOS as a PWA) for an Istanbul motorcycle club (~150 members):
take applications, manage members, publish events/announcements, share event photos, take attendance.

## Decisions

| Topic | Decision | Reason |
|---|---|---|
| Framework | Next.js 16 (App Router), TypeScript, React Compiler | One codebase for public site, member area and admin panel |
| UI | Tailwind CSS 4 + shadcn/ui | Accessible components, fast to build, easy to theme |
| Backend | Supabase (Postgres + Auth), provisioned via Vercel Marketplace | Auth and DB in one service; Row Level Security enforces permissions in the DB |
| Media storage | Cloudflare R2 (photos + a few curated videos) | 10 GB free, then $0.015/GB-month; downloads (egress) always free, unlike Supabase Storage (1 GB / 5 GB egress on Free) |
| Region | Supabase `eu-central-1` (Frankfurt) | Closest region to Istanbul; there is no Turkey region (see KVKK) |
| Hosting | Vercel | Native Next.js hosting, preview deployments per branch |
| Login | Google sign-in (Supabase OAuth) | Works on Android & iOS, needs no email sending |
| i18n | next-intl, TR at `/`, EN at `/en` (`localePrefix: "as-needed"`), no browser-language detection (`/` is Turkish on a first visit); the explicit choice is remembered in `NEXT_LOCALE` for 1 year (2026-11-13, SEO) | URL-based locale keeps pages statically prerendered with Next 16 Cache Components (a cookie-only locale would make every page dynamic); easy to add languages later |
| Mobile | PWA (manifest + service worker + Web Push) | Android & iOS (16.4+, from Home Screen) without App Store fees |
| Domain | `ridevibe.com.tr`, DNS on Vercel nameservers | All DNS records (site, email) managed from the Vercel CLI |
| Email | Deferred until a feature needs it; then Resend on `ridevibe.com.tr` | Resend's test sender can only mail the account owner |
| Accounts | All services under iltan's personal accounts (2FA on) | iltan administers the software; no shared passwords |
| Member messaging | WhatsApp deep links (`api.whatsapp.com/send`, not `wa.me`: see learnings/domain.md) + Web Push | The club already lives in a WhatsApp group |

## Who sees what

| Area | Access |
|---|---|
| Landing page, public events teaser, apply form, KVKK texts | Public (no login) |
| Events, RSVP, announcements, galleries, own profile, check-in | Approved members (login) |
| Member directory (`/members`) | Full members; **ön alım** members see only a crowd view (counts + initials) |
| Staff notes on members (`/admin/members`) | Staff with `members.notes` (notes about admins: admins only) |
| Applications, member list, event/announcement management, attendance | Staff roles with the matching permission |

Roles (decided 2026-11-08): admins create custom roles (e.g. "Organizatör", "Ride captain", "Membership team") and
pick each role's permissions in the app (`/admin/roles`); each member has at most one role, assigned at
`/admin/members`. Built-in **Admin** (Samet, iltan) has everything and is the only one who can edit/assign roles.
Members without a role are regular members. Approve/reject is its own permission (approval grants membership).

**Ön alım (decided and built 2026-11-18)** — spec `docs/superpowers/specs/2026-11-18-probation-and-member-notes-design.md`:
approval and staff manual activation put an account into the status `probation` ("Ön alım"), not `active`. Staff
(`members.manage`) promote it ("Tam üye yap") or remove it ("Pasifleştir"); the database refuses pending → active.
Ön alım members may edit their own safety data and bikes but see no other members (only the crowd view), and regular
members don't see them; staff see them with a badge. Events will get a "full members only" flag (Events step).

Intended staff roles (2026-11-08, iltan):

| Role | Permissions | Who |
|---|---|---|
| Yönetici (built-in admin) | everything, incl. editing/assigning roles | iltan (app manager), Samet (founder/owner) |
| Başvuru Sorumlusu | applications: view, review, approve/reject | people who check and approve applications |
| Üye Sorumlusu | members.manage + `members.notes` (built 2026-11-18; `members.discipline` once built) | people responsible for members' conduct |
| Organizatör | `members.safety` ("Güvenlik bilgilerini görme": safety cards, blood-type filter); event permissions once Events exist | ride organizers / captains: they need the safety data at the roadside (set 2026-11-13; no separate safety role) |

Who gets which role is decided once the site is ready (iltan, 2026-11-13). Keep Organizatör small (health data).

Application flow: public form → staff review (New → Contacted → Approved / Rejected) → on approval admin sends a
WhatsApp invite link → person signs in with Google → account is linked to the application.

**Application gaps (2026-11-09)** — spec `docs/superpowers/specs/2026-11-09-application-gaps-design.md`. Real
applicants hit mistyped phones, nicknames, apply/sign-in with different emails and in-app browsers. The form stays
open to anonymous visitors; instead:
- **Linking:** `applications.profile_id` = the account the application belongs to (set when a signed-in user applies,
  on approval, or by staff via "Link to account" on the application page, `applications.decide`). Approval activates
  the linked account by `profile_id` first, then by email, and copies the approved application's name to the profile.
  An approved application can also be linked to an *active* account without an application (staff activated it
  before the application was matched); that only attaches the application: status, name and role stay. So
  `applications.decide` also shows the sign-in email of active members without an application (accepted 2026-11-10).
- **Status / CTA:** `/account` for a pending member and `/apply` show "you haven't applied yet" (button to the form),
  "under review", or the generic pending text, based on `my_application_status()`.
- **In-app browser notice** on `/sign-in` (Instagram, Facebook, TikTok, LinkedIn): Google blocks OAuth there
  (`disallowed_useragent`); explains how to open Safari/Chrome, with a copy-link fallback.
- **Staff corrections:** edit applicant name/phone/email (review/decide); edit member name (`members.manage`).
  Correcting the email of an approved application re-runs matching.
- **Lists:** applications filter "Onaylandı, giriş yapmadı" (approved, not linked); pending members show a
  "Başvurdu" / "Başvurusu yok" badge.
- **Mobile rule:** Turkish numbers must be `+905…` (form + DB trigger).
- **Linked account check:** the application page shows the linked account's name and sign-in email to everyone with
  `applications.view` (`application_account()` RPC) and warns when it differs from the application email; the approve
  dialog names that account. Inactive members see "membership inactive" on `/apply` instead of a new form.
- Smaller deferred items, parked edge cases and polish: `docs/follow-ups.md`.
- **Follow-up (KVKK):** retention of pending accounts that never apply (minimisation: delete or anonymise after a set
  period, to be decided with the other retention periods below).
- **Follow-up:** `unlink_application` RPC (`applications.decide`, open applications only) so a wrong link can be undone
  without SQL.

## Status (2026-11-24)

Live at https://ridevibe.com.tr: TR/EN site, Google sign-in (roles/statuses), public application form, draft privacy
notice, staff-only applications list/detail. Google OAuth app is **published** (any Google account can sign in;
new accounts start as `pending`).
Own "install the app" prompt done (2026-11-12): banner on `/account` and `/members`, avatar-menu entry, guide for
iPhone/Android-manual; no service worker (spec `docs/superpowers/specs/2026-11-12-install-prompt-design.md`).
SEO round 1 (technical) done (2026-11-13): canonical URLs (hreflang stays in next-intl's `Link` headers), Open
Graph, robots.txt, sitemap.xml, icons, structured data (spec
`docs/superpowers/specs/2026-11-13-seo-technical-design.md`); round 2 (home content) shipped 2026-11-13 (`docs/content/home-page-questions.md`, spec
`docs/superpowers/specs/2026-11-13-home-content-design.md`).
The home page was redesigned 2026-11-14 ("Rota + 34": route line, 34 plate, new hero; spec
`docs/superpowers/specs/2026-11-14-home-redesign-design.md`).
Events (MVP step 3) released 2026-11-24, pending rollout: members create, join and share events; visitors see upcoming
rides on `/events` and the home page.

## MVP for Samet (agreed 2026-11-08)

Build in this order, one branch each:
1. **Applications review workflow** ✅ (2026-11-08) — status changes + notes; on approval a WhatsApp invite with
   sign-in link; signing in with the same email (Gmail dots/+tags ignored) activates the member automatically.
   Different email → staff activate the pending sign-up on `/admin/members` (shows sign-in emails).
2. **2a Members** ✅ (2026-11-10) — member directory at `/members` (active members see name, photo, district/side,
   motorcycles; birth day/month unless the member turns it off (opt-out since 2026-11-11, iltan asked the members),
   Instagram only when the member opts in) and "my profile" on `/account` (location,
   motorcycles, visibility, photo consent). Tidy name capitalization (Turkish rules) and name lock for active members.
   Members without a birth date (activated by hand) can enter it once on `/account` (2026-11-11).
   Spec: `docs/superpowers/specs/2026-11-10-members-design.md`.
   2a′. **Safety data** (done 2026-11-13) — members enter up to 2 emergency contacts (name, relationship, phone), a
   blood type (only with a separate explicit consent, withdrawable; withdrawal deletes it) and a plate per bike
   (shown in the directory unless "Plakalarımı göster" is off) on `/account`; a gentle prompt while no contact exists.
   New permission `members.safety`: holders open a safety card (contacts with call/WhatsApp, blood type, plates) from
   `/members` and can filter by blood type (donor search) and "no emergency contact". Every blood-type operation and
   card view is logged in `safety_access_log` (admins only). Inactive members disappear from staff view. Privacy
   notice updated (version `2026-11-12-draft-3`). Spec: `docs/superpowers/specs/2026-11-12-safety-data-design.md`.
   2b. **Member conduct** — confidential staff notes ✅ (2026-11-18: `member_notes`, `members.notes`, "Notlar (n)"
   dialog on `/admin/members`, together with the ön alım stage), warnings, suspend/ban still to do (see "Member
   conduct" below). Privacy notice version `2026-11-18-draft-8`.
3. **Events** — designed 2026-11-20, spec `docs/superpowers/specs/2026-11-20-events-design.md`. Organizers
   (`events.manage`) create meet-ups (one place) and rides (start, stops, finish); every place opens in Google Maps,
   Apple Maps or Yandex; members join as rider or passenger with up to 3 guests; optional limits on people and bikes;
   requirements: minimum cc (riders) and "full members only" (ön alım stage, 2026-11-18); a change log and WhatsApp
   share instead of notifications; visitors see a ride teaser (area line only). Built in two branches (organizer
   side behind an organizers-only gate, then joining + release). **Released** 2026-11-24 (branch
   `feat/events-release`, pending rollout): the gate is open to club members (active and ön alım), visitors get the
   ride teaser on `/events` and the home page, an event link shows that event's card and a generated link preview,
   share texts carry the link; privacy notice version `2026-11-24-draft-10`. Spec
   `docs/superpowers/specs/2026-11-24-events-release-design.md`. Later: the map (iteration 2), Web Push with
   reminders and the waiting list (iteration 3).
4. **Announcements** — short organizer posts, pinned on the home page.
5. Right after the MVP: **event photo gallery** (Cloudflare R2).

**Joining after approval (decided 2026-11-08):** staff add approved people to the club WhatsApp group **manually**,
and send the sign-in invite with the one-tap WhatsApp button on the application page. No automation for now.

**Design system decided (2026-11-09):** "Gece + turkuaz" — dark default with light option, orange `#F98D2F` primary,
teal for positive/status, Saira type, traced R&V wordmark and club badge. Spec:
`docs/superpowers/specs/2026-11-09-design-system-design.md`; fallbacks and asset provenance: `docs/design/README.md`.
Built on `feat/design-system`; new screens use the tokens in `src/app/globals.css`.
Todo (manual): Samet replaces the WhatsApp group photo with `ride-vibe-whatsapp-1024.jpg` (kept outside git by iltan).

## Optional later: automatic WhatsApp messages

Possible via Meta's official **WhatsApp Business Platform (Cloud API)**: on approval the app sends a pre-approved
*utility* template (TR/EN) with the sign-in link. Cost is negligible (Turkey utility ≈ $0.001/message per third-party
sources, 2026 — verify in Meta's pricing table; free inside an open customer-service window). Needs a Meta Business
account + WhatsApp Business Account, a number for the API (the club's WhatsApp Business number can usually be shared
via "coexistence"), a payment method, and template approval. Unverified businesses: 250 new contacts/24 h.
Never use unofficial WhatsApp Web automation (Baileys, whatsapp-web.js): against the ToS, numbers get banned.

Decision (iltan, 2026-11-08): **not now** — too much setup for the benefit. If built, it must be **optional**: an
admin on/off switch in the app (plus "off" automatically when the API credentials aren't configured), with the
manual WhatsApp button always available as the fallback. KVKK: Meta as a processor abroad → privacy notice.

## Member conduct: notes, warnings, bans (notes built 2026-11-18; the rest planned, step 2b)

Requested by iltan 2026-11-08: people responsible for members must be able to record behaviour, warn, suspend or ban,
with notes only they can see.

- **Confidential notes** (built 2026-11-18, without `kind`; admin-role holders' notes admin-only, no notes about
  oneself) on a member (`member_notes`: member, author, body, created_at). Readable and writable
  only with a new permission **`members.notes`**; the member never sees them in the app. Append-only: no editing in
  place (a correction is a new note), author + time always shown; only admins can delete (e.g. KVKK erasure).
- **Warnings** = notes of kind `warning`, created with **`members.discipline`**; warning count shown in member lists.
  Warnings are **also shown to the member** on their account page (a warning they never see changes nothing); other
  notes stay staff-only. (decided 2026-11-08)
- **Suspend / ban** (`members.discipline`, reason required → stored as a note). Suspended = no access until
  reactivated. Banned = no access; optional end date (no date = permanent until an admin lifts it). Only admins can
  suspend/ban an admin; nobody acts on themselves. (decided 2026-11-08)
- **Ban evasion** (a banned person signs in/applies with another Google account): a ban is about the *person*. On ban,
  copy their identifiers from the profile and linked application(s) into a **ban list**: phone (E.164, strongest —
  Turkish lines are registered to a national ID), all known emails (Gmail normalised: dots and `+tags` ignored),
  Instagram username (lowercased), full name + birth date (weak; only as a combination). Every new application and
  new sign-in is checked; matches are **flagged for staff** with the reason (e.g. "phone matches a banned member"),
  never auto-rejected (false positives would turn away innocent people). Visible with `members.discipline`.
- **KVKK:** conduct records are personal data → mention them in the privacy notice; members can request their data
  (art. 11), so notes must be factual and professional; same retention as other member data (anonymise/delete 1 year
  after membership ends). Add to the Samet questions and the questions Claude researches (no lawyer).
- KVKK for the ban list: legitimate interest (club safety); must be in the privacy notice with a retention limit
  (e.g. while the ban lasts, max N years — Claude researches and proposes, no lawyer).

## Phase 1 (original scope)

1. Landing page with ad attribution (UTM params stored with the application)
2. Application form + admin review pipeline
3. Member list & profiles (district, Asian/European side, bike)
4. Events with RSVP, capacity and waiting list; announcements
5. Event photo galleries

## Media: photos in the app, videos stay on WhatsApp

WhatsApp stays the place for sharing videos in the moment: it compresses heavily and doesn't keep media on its servers
after delivery (members' phones pay the storage). The app does what WhatsApp can't: a lasting, organised **photo**
gallery per event, visible to members who join later.

- Photos are resized on the phone before upload (~2048 px full + small thumbnail), stored on R2.
- **Not Google Drive** (iltan's idea, 2026-11-24; Claude): the club's Google account has 15 GB, but Drive is not made to
  serve images to a website (direct-link tricks are unofficial and rate-limited), a members-only gallery would be
  either "anyone with the link" or proxied through Vercel on every view (bandwidth), and the app would hold a token
  for the whole club account (Drive, maybe Gmail) instead of a key limited to one bucket. Drive stays the club's own
  archive of originals outside the app. Re-check R2's and Google's current terms when the gallery is designed.
- Videos: only a few curated clips per event (added by organizers, size/length limits) or a link to the event's
  Instagram reel. Full video hosting (Cloudflare Stream, ~$5–10/month) only if members ask for it after using the app.

## Running costs

Target: **$0/month** for Phase 1 (domain renewal aside).

| Service | Plan | Limits that matter | Our mitigation |
|---|---|---|---|
| Vercel | Hobby (free) | Non-commercial use only | Move to Pro ($20/mo) if the app ever takes payments |
| Supabase | Free | 500 MB DB, 50k MAU, **no backups**, pauses after 1 week of inactivity | Encrypted backup before every production push (`pnpm db:push`, kept 14 days on iltan's PC; no nightly job: the repo is public and every extra copy is a KVKK cost; `docs/runbooks/database-backup.md`); keep-alive query 3×/day (Vercel cron → `/api/keep-alive`, done) |
| Cloudflare R2 | Free tier | 10 GB storage, then $0.015/GB-month; free egress | Resize photos on upload; curated videos only |

Upgrade trigger: Supabase Pro ($25/mo: daily backups, no pausing, 8 GB DB, 100 GB storage) when the club wants managed
backups or outgrows the free limits. Split across members it is negligible.

## Phase 2

- Attendance (multiple methods, see below)
- Web Push notifications
- Badges / ride counts, dues tracking, safety info (emergency contact)

### Attendance methods (planned)

1. **Self check-in via event code** — organizer shows one big QR on a phone/printout, *members* scan it with their own
   phones. Many people check in at once, no queue. A short 4-digit code (rotating, valid only during the event window)
   works as a fallback for people whose camera fails, and can be said out loud.
2. **Location guard** — self check-in only allowed within ~300 m of the meeting point during the event time window.
3. **Organizer roster** — RSVP list with search and one-tap "present"; several organizers can work in parallel.
4. **After-event fix-up** — members can claim "I was there", organizers approve; organizers can bulk-mark from the roster.

## KVKK notes (not legal advice)

No lawyer review (iltan, 2026-11-13): Claude researches and decides the open questions; remaining "lawyer" notes in this
file and in `docs/follow-ups.md` are such questions.

- Publish an *aydınlatma metni* (privacy notice) and get **separate** explicit consents (not bundled): photo sharing,
  any special-category data.
- Data minimisation: the application form collects only what is needed to evaluate it. Emergency contact etc. is
  collected after approval.
- Blood type is health data (special category) → optional, separate explicit consent (açık rıza, withdrawable; withdrawal
  deletes it), visible only to holders of `members.safety` (ride organizers / captains), per KVKK Board decision 2018/10.
  Every blood-type operation and every safety-card view is logged in `safety_access_log` (admins only). Emergency
  contacts and plates rest on legitimate interest (+ vital interest in an emergency), proposed (no lawyer: Claude decides,
  see above).
  Encryption relies on the hosted database's disk encryption (no app-level encryption); see `docs/follow-ups.md`.
- Data stored outside Turkey (Frankfurt) = cross-border transfer under KVKK art. 9 (amended 2024): standard contract
  with the processor and notification to the Authority within 5 business days.
- Members delete their own account on `/account` (done 2026-11-14: hidden at once, 14 days to restore by signing in,
  then purged by a nightly pg_cron job; rejected applications keep their 6 months, approved applications of inactive
  accounts are kept 1 year from the request; spec `docs/superpowers/specs/2026-11-14-account-deletion-design.md`).
  **Data download** (art. 11) is still open (`docs/follow-ups.md`). Deleting rejected applications after their
  retention period is **not built yet** (follow-ups, "General retention jobs").
- **Access requests and staff notes** (decided 2026-11-18, Claude, no lawyer): a note about a member is that member's
  personal data (KVKK art. 3: information relating to them, whoever wrote it; cf. CJEU *Nowak* C-434/16, examiner
  comments are the candidate's data), so an art. 11 request is answered with each note's content and date, by hand
  within 30 days. The author's name is the staff member's own personal data and is **never** shared. Members never
  see notes in the app. Notice §5 and the notes dialog hint say so.
- **Events** (decided 2026-11-24, Claude, no lawyer): sign-ups (rider/passenger, guest count, never guest names) and
  who created/changed an event rest on legitimate interest (KVKK art. 5/2-f, checked against the law text on
  mevzuat.gov.tr: art. 5 is unchanged by the 2024 amendment); kept like other member data; deleting an account deletes
  its sign-ups and nulls its authorship. Public teaser data (title, kind, day, area) is no personal data. Notice §2–§6.
- Retention: instead of keeping expired records "archived" (still personal data → not allowed past the purpose),
  **anonymise** them: strip name/contact/birth date/free text, keep counts, district/side, source, dates for stats.

**Open decisions (as of 2026-11-08):**
- Ride & Vibe is an **informal group** (not a dernek) → ask **Samet** to be the data controller (veri sorumlusu) in
  the privacy notice. iltan will ask once there is an MVP to show.
- Contact email for data requests (e.g. `kvkk@ridevibe.com.tr` forwarded to a Gmail).
- Retention periods: 6 months for rejected applications, 1 year after membership ends (proposed, accepted by iltan).
- Cross-border transfer formalities (art. 9) — Claude researches the formalities (no lawyer); decide before public launch.
- Member conduct warnings/bans and the ban list (identifiers kept to detect re-joining): wording in the privacy
  notice, retention, and how to answer access requests (notes: settled above, "Access requests and staff notes").

## Git workflow

- Solo project, lightweight flow: `main` = production (what Samet and members see once deployed).
- Each iteration gets a short-lived branch (`feat/…`, `fix/…`, `chore/…`); iltan reviews the diff (and the Vercel
  preview deployment), then it is merged into `main` locally with `--no-ff`. No PR ceremony needed.
- Small doc/config tweaks may go straight to `main`.
- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:` …). No co-author trailers.
- DB changes only through versioned Supabase migrations in `supabase/migrations`.
