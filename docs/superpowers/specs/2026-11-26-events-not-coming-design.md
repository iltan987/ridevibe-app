# Events: "Gelmiyorum" (I'm not coming) — design

Status: approved by iltan (2026-11-26). Branch `feat/events-not-coming`.

## Why

In iltan's production check (2026-11-26): members can only join an event or leave it, and leaving deletes the
sign-up, so a member who said no looks exactly like one who never answered. Organisers plan rides from the club's
WhatsApp polls today, where they see the no's; the app has to give them the same. Follow-up item "Events: I'm not
coming" (`docs/follow-ups.md`); it comes before member conduct 2b (both change the database).

## Goals

- A club member (active or ön alım: the events gate, `private.can_see_events()`) can answer an upcoming event with
  "Gelmiyorum", and switch between coming and not coming freely until the event starts.
- Organisers (`events.manage`) see who said no, by name, and how many club members haven't answered yet.
- A "no" never counts anywhere a sign-up counts.

## Non-goals

- A "hasn't answered" **list** (names): only the number for now. Most members don't use the app yet, so the list
  would mostly name people who never opened it (iltan, 2026-11-26). Goes to follow-ups.
- Showing the no's to anyone but organisers. iltan may ask to widen it to "everyone who sees the roster" after member
  feedback (follow-ups); the design keeps that a one-place change.
- Clearing an answer back to "no answer". Like most polls, once you've answered you switch between yes and no only.
- Reasons for a no, reminders, notifications (Web Push is events iteration 3).
- Reconstructing past "leaves": they were deletions; existing sign-ups stay as they are, no data migration.

## Anti-goals (a failure even if it works)

- A "no" leaking into a limit, a count, "Katıldıklarım", the "Katılıyorsun" badge, the "has sign-ups" check that
  blocks `delete_event`, or the change-log trigger.
- A member ending up both coming and not coming for the same event.
- Members (non-organisers) learning who said no.

## Approaches (iltan picked 1)

1. **A separate table for the no's (picked).** `event_declines` next to `event_signups`. `event_signups` keeps
   meaning "coming", so every existing reader, rule and test stays as it is; the two tables are kept mutually
   exclusive by the only two functions that write them, under the event-row lock they already take. Trade-off: two
   tables to keep exclusive (manageable: no other writer exists).
2. **An answer column on `event_signups`** (yes/no, role null for a no). One row per person, switching is one update.
   Rejected: every reader has to learn to skip the no's; the counted view covers most, but `getMySignups` (join panel,
   "Katıldıklarım", the card badge) reads the table directly, so one missed place silently turns a no into a yes, and
   most existing pgTAP tests need rework.

## Decided (iltan, 2026-11-26)

- Organisers only see the no's (names); members see only their own answer.
- Organisers see the number of club members who haven't answered; no list.
- Storage: approach 1.

## Design

### Database (`supabase/schemas/42_event_signups.sql`)

- **Table `public.event_declines`** (`event_id` → `events` on delete cascade, `profile_id` → `profiles` on delete
  cascade, `created_at`, primary key `(event_id, profile_id)`, index `(profile_id, event_id)`). RLS on; `revoke all`
  from anon/authenticated, `grant select` to authenticated; policy: own rows of visible events (same shape as
  `event_signups`). No direct writes.
- **Only active and ön alım people's no's show anywhere**, mirroring `private.counted_event_signups` (others' rows are
  kept and come back with the status). Whether that is a second view or a join in the one read function is the
  builder's call.
- **`public.decline_event(p_event uuid)`** replaces `leave_event`: gate (42501), club member (42501), lock the event
  row (`for update`), unknown event P0002, started P0001 hint `started`; a cancelled event is allowed (as `leave_event`
  was). Deletes the caller's sign-up and inserts the decline (`on conflict do nothing`). No limit or `min_cc` rule
  applies to a no. **"Sadece tam üyeler"** (Claude's call: those events don't invite ön alım members, so their no
  would only mislead organisers): an ön alım member without a sign-up is refused, P0001 hint `full_members_only`
  (same hint as `join_event`); one who signed up before the organiser tightened the rule may still back out, which
  records the no ("don't make it worse", as with leaving today).
- **`join_event`** additionally deletes the caller's decline for that event, after its rules pass, in the same call
  (an upsert that refuses leaves the no in place).
- **`leave_event` is dropped** (dead once the app calls `decline_event`; CLAUDE.md "Remove dead code"). pgTAP: no
  `leave_event` in `pg_proc`, exactly one `decline_event`.
- **Organiser read:** one function returns who said no (`profile_id`, `full_name`, `avatar_url`, ön alım flag;
  Turkish name order, then id) for `events.manage`, and **no rows for everyone else**. This function is the one place
  that decides who sees the no's (the later "everyone who sees the roster" switch changes only it, and the notice).
  42501 without the gate, P0002 for an unknown event.
- **Unanswered count** (organisers only; null or a refusal for others: builder's call, the UI shows nothing):
  people who could join the event and have neither a counted sign-up nor a decline. "Could join" = active members,
  plus ön alım members unless the event is "Sadece tam üyeler". The UI shows it only before the event starts and
  while it isn't cancelled (not through the 12-hour "upcoming" grace after the start: answering is closed by then).
- `event_counts`, `event_roster`, `delete_event`'s `has_signups`, the change-log trigger: unchanged (they read
  `counted_event_signups` only).

### App

- **Join panel** (`src/components/events/join-panel.tsx`); text sketch, ~390 px:

  ```text
  No answer                      Declined                       Joined
  ┌──────────────────────────┐   ┌──────────────────────────┐   ┌──────────────────────────┐
  │ Katılıyor musun?         │   │ Gelmiyorsun              │   │ Katılıyorsun             │
  │ [Sürücü] [Artçı]         │   │ [Sürücü] [Artçı]         │   │ Sürücü · 1 misafir       │
  │ Misafir   − 0 +          │   │ Misafir   − 0 +          │   │ [Sürücü] [Artçı] …       │
  │ [Katılıyorum][Gelmiyorum]│   │ [Katılıyorum]            │   │ [Güncelle] [Gelmiyorum]  │
  └──────────────────────────┘   └──────────────────────────┘   └──────────────────────────┘
  ```

  - No answer: "Gelmiyorum" (outline) next to "Katılıyorum", no dialog (nothing is lost).
  - Declined: heading "Gelmiyorsun", the join form stays so they can switch with "Katılıyorum" (the rules still
    apply: if the event filled up meanwhile, the usual refusal shows).
  - Joined: "Katılmaktan vazgeç" becomes "Gelmiyorum" and keeps its confirm dialog (they give up their place, which
    may be gone when they come back).
  - Started or cancelled: the closed state as today; a declined member's heading says "Gelmiyorsun".
  - "Sadece tam üyeler" seen by an ön alım member without a sign-up: the closed state as today, no "Gelmiyorum".
  - Done texts for the new action; the existing focus rescue covers the new button too.
- **Own answers:** the detail page and `/events` read the caller's declines next to `getMySignups` (RLS own rows, the
  same chunked `readAll`).
- **Event card** (`/events`): a declined event gets a muted "Gelmiyorsun" badge where "Katılıyorsun" sits (Claude's
  call: members see at a glance what they haven't answered). "Katıldıklarım" stays sign-ups only.
- **Organiser section** on the event detail page, below the roster: heading "Gelmiyor" with its total; rows with
  avatar, name and the "Ön alım" badge (no role, no safety-card button: they aren't coming); pages like the roster
  (`slicePage`, `PagerButtons`, up to `LIST_CEILING` with `CeilingNotice`). While the event is upcoming and not
  cancelled, a line "N kişi henüz yanıt vermedi". Empty list: a short empty text. Visible to organisers on past
  events too (like their roster). Skeleton: the organiser-only parts follow the existing rule for the detail shell
  (it can't know the role).
- **Server action** `declineEvent` (replaces `leaveEvent`), mapping errors like `leaveEvent` did (`src/lib/events/join.ts`),
  `refresh()` on success.
- **Messages** tr + en. Copy proposals (iltan picks in review; options go to follow-ups if left open):
  - button: "Gelmiyorum" (en "I'm not coming", already the leave label)
  - declined heading: "Gelmiyorsun" / "Gelmeyeceksin"
  - done text: "Gelmeyeceğini kaydettik." / "Yanıtın kaydedildi."
  - dialog from joined: title "Gelmiyor musun?", body "Yerin boşalır. Etkinlik başlayana kadar fikrini
    değiştirebilirsin; yer kalmışsa yeniden katılırsın.", buttons "Hayır, geliyorum" / "Evet, gelmiyorum"
  - organiser section: "Gelmiyor" / "Gelmeyenler"; "{n} kişi henüz yanıt vermedi"
  - card badge: "Gelmiyorsun"

### Privacy notice (KVKK)

A "no" is new personal data of the same kind as a sign-up (legitimate interest, art. 5/2-f, already stated for event
participation). Update `privacy/content-tr.tsx` / `content-en.tsx`: "Etkinlik bilgileri" also lists telling the club
you won't come; the events visibility paragraph says only organisers see who won't come; the retention line for
event participation covers the no's too. Bump
`PRIVACY_NOTICE_VERSION` to `2026-11-26-draft-11` (draft-10 is deployed).

### Tests

- pgTAP (`supabase/tests/database/event_signups.test.sql` or a new file; fixture ids only): grants and RLS on
  `event_declines` (own row only, no direct writes, anon nothing); `decline_event` gate/status/unknown/started/
  cancelled; join ↔ decline exclusivity both ways; a refused join keeps the no; no's don't change `event_counts`,
  `event_roster`, `delete_event`'s refusal or limits; organiser read: organisers get names, active members and ön
  alım members get no rows; inactive/pending/deleting people's no's don't show; unanswered count (full-members-only
  case included; asserted as changes around fixture actions, never an absolute number: pgTAP also runs on
  production); ön alım and "Sadece tam üyeler" (refused without a sign-up, may back out with one); cascade on
  account and event delete; `leave_event` gone.
- Unit tests for the new action-result mapping and any pure helper.
- E2E `scripts/e2e/events-join-e2e.mjs`: decline from no answer, switch to joining and back (dialog), the card badge,
  organiser sees the name and the unanswered number, an active member sees neither.

### Rollout

`leave_event` disappears with the migration and the deployed app calls it: `pnpm db:push` then push `main`
immediately (CLAUDE.md rollout; `docs/runbooks/production-checks.md` RPC compatibility). No data rewrite.

### Docs

CLAUDE.md "Events" bullet (`decline_event` instead of `leave_event`, the no's table and who sees it), `docs/PLAN.md`
status, follow-ups: widen no-visibility on feedback, the unanswered list, copy options left open; the specs README row
at merge.

## Left to the builder

RPC names and return shapes for the organiser read and the count (one function or two), the view-vs-join choice for
counting only active/ön alım no's, how the organiser section shares code with `EventRoster`, the skeleton details,
and the exact test split.
