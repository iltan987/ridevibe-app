# Riding Club Platform — Plan

Living document. Update it when decisions change.

## Goal

A web app (installable on Android & iOS as a PWA) for an Istanbul motorcycle club (~150 members):
take applications, manage members, publish events/announcements, share event photos, take attendance.

## Decisions

| Topic | Decision | Reason |
|---|---|---|
| Framework | Next.js 16 (App Router), TypeScript, React Compiler | One codebase for public site, member area and admin panel |
| UI | Tailwind CSS 4 + shadcn/ui | Accessible components, fast to build, easy to theme |
| Backend | Supabase (Postgres + Auth + Storage), provisioned via Vercel Marketplace | Auth, DB, file storage in one service; Row Level Security enforces permissions in the DB |
| Region | Supabase `eu-central-1` (Frankfurt) | Closest region to Istanbul; there is no Turkey region (see KVKK) |
| Hosting | Vercel | Native Next.js hosting, preview deployments per branch |
| Login | Google sign-in (Supabase OAuth) | Works on Android & iOS, needs **no email sending and no domain** |
| i18n | next-intl, TR at `/`, EN at `/en` (`localePrefix: "as-needed"`), browser-language detection + remembered choice | URL-based locale keeps pages statically prerendered with Next 16 Cache Components (a cookie-only locale would make every page dynamic); easy to add languages later |
| Mobile | PWA (manifest + service worker + Web Push) | Android & iOS (16.4+, from Home Screen) without App Store fees |
| Email | Deferred until we own a domain (Resend then) | Resend's test sender can only mail the account owner |
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

## Phase 1 (demo for Samet)

1. Landing page with ad attribution (UTM params stored with the application)
2. Application form + admin review pipeline
3. Member list & profiles (district, Asian/European side, bike)
4. Events with RSVP, capacity and waiting list; announcements
5. Event photo galleries

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

## Git workflow

- Solo project, lightweight flow: `main` = production (what Samet and members see once deployed).
- Each iteration gets a short-lived branch (`feat/…`, `fix/…`, `chore/…`); iltan reviews the diff (and the Vercel
  preview deployment), then it is merged into `main` locally with `--no-ff`. No PR ceremony needed.
- Small doc/config tweaks may go straight to `main`.
- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:` …). No co-author trailers.
- DB changes only through versioned Supabase migrations in `supabase/migrations`.
