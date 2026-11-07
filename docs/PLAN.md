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
| i18n | next-intl, TR at `/`, EN at `/en` (`localePrefix: "as-needed"`), browser-language detection + remembered choice | URL-based locale keeps pages statically prerendered with Next 16 Cache Components (a cookie-only locale would make every page dynamic); easy to add languages later |
| Mobile | PWA (manifest + service worker + Web Push) | Android & iOS (16.4+, from Home Screen) without App Store fees |
| Domain | `ridevibe.com.tr`, DNS on Vercel nameservers | All DNS records (site, email) managed from the Vercel CLI |
| Email | Deferred until a feature needs it; then Resend on `ridevibe.com.tr` | Resend's test sender can only mail the account owner |
| Accounts | All services under iltan's personal accounts (2FA on) | iltan administers the software; no shared passwords |
| Member messaging | WhatsApp deep links (`wa.me`) + Web Push | The club already lives in a WhatsApp group |

## Who sees what

| Area | Access |
|---|---|
| Landing page, public events teaser, apply form, KVKK texts | Public (no login) |
| Events, RSVP, announcements, galleries, own profile, check-in | Approved members (login) |
| Applications, member list, event/announcement management, attendance | Organizer / Admin roles |

Roles: `admin` (Samet, iltan), `organizer` (ride captains), `member`.
Application flow: public form → admin reviews (New → Contacted → Approved / Rejected) → on approval admin sends a
WhatsApp invite link → person signs in with Google → account is linked to the application.

## Status (2026-11-08)

Live at https://ridevibe.com.tr: TR/EN site, Google sign-in (roles/statuses), public application form, draft privacy
notice, staff-only applications list/detail.

## MVP for Samet (agreed 2026-11-08)

Build in this order, one branch each:
1. **Applications review workflow** — status changes + notes; on approval a WhatsApp invite with sign-in link; signing
   in with the same email activates the member automatically.
2. **Members** — directory (name, district/side, bike) and "my profile" editing.
3. **Events** — organizers create rides (date, meeting point + map link, route, capacity); members RSVP with a
   waiting list; home page shows upcoming events.
4. **Announcements** — short organizer posts, pinned on the home page.
5. Right after the MVP: **event photo gallery** (Cloudflare R2).

**Design pass needed:** everything so far uses default shadcn styling. Before/while building the MVP screens, define
the visual identity (logo, colours, typography, light/dark, motorcycle "vibe") and apply it across existing pages.
Do this as its own step, early, so new screens are built in the final style.

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
- Videos: only a few curated clips per event (added by organizers, size/length limits) or a link to the event's
  Instagram reel. Full video hosting (Cloudflare Stream, ~$5–10/month) only if members ask for it after using the app.

## Running costs

Target: **$0/month** for Phase 1 (domain renewal aside).

| Service | Plan | Limits that matter | Our mitigation |
|---|---|---|---|
| Vercel | Hobby (free) | Non-commercial use only | Move to Pro ($20/mo) if the app ever takes payments |
| Supabase | Free | 500 MB DB, 50k MAU, **no backups**, pauses after 1 week of inactivity | Own nightly encrypted backup (scheduled GitHub job); daily keep-alive request (Vercel cron) |
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

## KVKK notes (not legal advice — confirm with a lawyer)

- Publish an *aydınlatma metni* (privacy notice) and get **separate** explicit consents (not bundled): photo sharing,
  any special-category data.
- Data minimisation: the application form collects only what is needed to evaluate it. Emergency contact etc. is
  collected after approval.
- Blood type is health data (special category) → optional, explicit consent, visible only to organizers.
- Data stored outside Turkey (Frankfurt) = cross-border transfer under KVKK art. 9 (amended 2024): standard contract
  with the processor and notification to the Authority within 5 business days.
- Members can download and delete their data; rejected applications are deleted after a retention period.
- Retention: instead of keeping expired records "archived" (still personal data → not allowed past the purpose),
  **anonymise** them: strip name/contact/birth date/free text, keep counts, district/side, source, dates for stats.

**Open decisions (as of 2026-11-08):**
- Ride & Vibe is an **informal group** (not a dernek) → ask **Samet** to be the data controller (veri sorumlusu) in
  the privacy notice. iltan will ask once there is an MVP to show.
- Contact email for data requests (e.g. `kvkk@ridevibe.com.tr` forwarded to a Gmail).
- Retention periods: 6 months for rejected applications, 1 year after membership ends (proposed, accepted by iltan).
- Cross-border transfer formalities (art. 9) — see the lawyer discussion; decide before public launch.

## Git workflow

- Solo project, lightweight flow: `main` = production (what Samet and members see once deployed).
- Each iteration gets a short-lived branch (`feat/…`, `fix/…`, `chore/…`); iltan reviews the diff (and the Vercel
  preview deployment), then it is merged into `main` locally with `--no-ff`. No PR ceremony needed.
- Small doc/config tweaks may go straight to `main`.
- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:` …). No co-author trailers.
- DB changes only through versioned Supabase migrations in `supabase/migrations`.
