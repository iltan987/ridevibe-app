# Events: Joining (behind the gate) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Members join meet-ups and rides as rider or passenger with up to 3 guests, under the event's limits and
requirements. Everyone sees counts. Rosters depend on the viewer. Organisers see the change log, the safety-card links
and who has no emergency contact. All of this still sits **behind the release gate** until iltan's full check.
After that check, branch 2b opens the gate.

**Architecture:** The gate moves into one database function, `private.can_see_events()`. In this branch it returns
`private.has_permission('events.manage')`; the release replaces its body with `private.is_club_member()`. The RLS
policies, the new RPCs and the app (through `public.can_see_events()`) all ask that one function, so the release
changes one function body instead of every page.

New pieces:
- A table, `public.event_signups`, written only by `join_event` / `leave_event`. These are security definer and lock
  the event row, so two people can't take the last place.
- Read RPCs for counts, the roster per viewer, the authors and the change log.
- `save_event` writes `public.event_changes` when the event already has sign-ups.
- Pages: `/events/[id]` gets the join panel, counts, roster and change box; `/events` gets counts and
  "Katıldıklarım".

**Tech Stack:** Supabase Postgres (declarative schemas, pgTAP), Next.js 16 App Router (Cache Components, Server
Actions, Suspense), next-intl, shadcn/ui (Base UI), Zod, `node --test`, puppeteer E2E.

**Spec:** `docs/superpowers/specs/2026-11-20-events-design.md` §3, §5, §6, §8, §9 item 2 (joining part). The release
part (visitor teaser, home section, hero button, SEO, privacy notice, `InstallBanner`, share link) is **branch 2b**,
planned after iltan's full check (`docs/follow-ups.md` "Next up").

## Global Constraints

- **Git:** branch `feat/events-joining`. No worktrees. Stage by path; never `git add -A`, `git commit -a`,
  `git stash`, `git checkout -- .`, `git restore .`, `git reset --hard` or `git clean`. No co-author trailers. Local
  `.claude/settings.json` changes: never commit, revert or mention.
- **DB workflow (CLAUDE.md):**
  - Edit `supabase/schemas/*.sql` → `pnpm db:migration <name>` → review (delete any `cron.unschedule(...)` line) →
    `pnpm db:reset` → `pnpm db:test` → `pnpm db:types`.
  - Commit schema + migration + types + consumers together.
  - `db:reset` wipes auth users.
  - Changed RPC arguments: drop the old signature (pgTAP: one row in `pg_proc`).
- **Every commit passes** `pnpm lint && pnpm exec tsc --noEmit && pnpm test && pnpm build`.
- **pgTAP:**
  - New file `supabase/tests/database/event_signups.test.sql`. Fixture ids `00000000-0000-0000-0000-000000000761` …
    `0789` (unused), emails `pgtap-ej-…@pgtap.invalid`.
  - Scope every assertion to fixture ids; never update real rows (the suite runs on production).
  - Tests for viewers the gate refuses today (active member without a role, ön alım member) open the gate **inside
    the test transaction**: `create or replace function private.can_see_events() … as $$ select
    private.is_club_member() $$` as postgres, after the gate assertions. The rollback restores it; other sessions never
    see the uncommitted definition. Comment this at the swap.
- **Release gate in this branch:**
  - Only `events.manage` holders read events, sign-ups, counts, rosters and the change log, and only they can
    join/leave.
  - Everyone else keeps "Çok yakında" on `/events` and a 404 on the other event routes.
  - No change to `/events` metadata, the sitemap, the home page, the privacy notice or the share text's missing link.
- **Who counts:** only sign-ups of `active` and `probation` profiles. Sign-ups of `inactive` / `pending` /
  `deleting` profiles are kept but ignored by limits, counts, rosters and "has sign-ups". They come back if the status
  does. Deleting an account removes its sign-ups (FK cascade).
- **Join rules** (spec §5), enforced in `join_event`:
  - The caller must pass the gate **and** be `active` or `probation`.
  - Role is `rider` | `passenger`; guests 0–3 (a guest is always a passenger).
  - people = 1 + guests per sign-up; bikes = 1 per rider.
  - **"Don't make it worse":** a limit, `min_cc` or `full_members_only` refuses a change only if it raises the
    caller's own footprint on that rule:
    - people limit: own people goes up;
    - bike limit: switching to rider or joining as a rider;
    - `min_cc`: becoming a rider (new sign-up or switch);
    - `full_members_only`: a new sign-up by an ön alım member.

    So someone already signed up when the organiser tightened a rule can still lower their guests or switch to
    passenger.
  - Refused at or after `starts_at` (join, edit, leave) and for a cancelled event (join, edit; leaving a cancelled
    event is allowed).
  - `min_cc`: at least one own bike with `cc >= min_cc` (null cc doesn't count).
- **Error contract** for the new RPCs. The action maps `hint` to a reason; never parse messages.

  | Case | errcode | hint |
  |---|---|---|
  | Gate refuses, or the caller is not active/probation | `42501` | — |
  | Unknown event | `P0002` | — |
  | Malformed input (guests out of range, unknown role) | `22023` | — |
  | Rule refusal | `P0001` | one of `started`, `cancelled`, `people_limit`, `bike_limit`, `min_cc`, `full_members_only`, `has_signups` |

- **Roster visibility** (spec §3):

  | Viewer | Sees |
  |---|---|
  | `events.manage` | Everyone counted, with an ön alım flag, guests, role and "has an emergency contact". The flag and the contact field are null for everyone else. |
  | Active member while the event is upcoming | Active participants' name, avatar, role and guests. |
  | Ön alım member, or anyone once the event is past | No rows. |

  - Counts are the same for every viewer who passes the gate: `people, bikes, members, guests, probation`.
  - Upcoming = `starts_at >= now() - interval '12 hours' or ends_at >= now()`, the rule `listUpcomingEvents` already
    uses. Put it in SQL once as `private.event_is_upcoming(starts_at, ends_at)`.
- **Change log:**
  - When an event with at least one counted sign-up is saved, `save_event` appends one row listing every changed
    field among `starts_at, ends_at, places, limit_people, limit_bikes, min_cc, full_members_only`, each as
    `{ "field", "old", "new" }`.
  - Places are compared as the ordered list of `{name, lat, lng, venue_url}`; `old`/`new` hold the ordered names.
  - Title, description, kind, side and area are not logged.
  - Authors (`changed_by`) are shown to organisers only; null after the author's account goes (FK `on delete set
    null`).
- **Organiser names for ön alım viewers:** "Düzenleyen" comes from `public.event_authors(p_event)` (security
  definer, null for `deleting` profiles), not from a `profiles` join. Ön alım members can't read `profiles`.
- **Pagination (CLAUDE.md lists):**
  - Rosters and the change log load fully with `readAll` up to `LIST_CEILING` (`CeilingNotice` above).
  - The roster pages in the browser by `PAGE_SIZE` with `PagerButtons` and shows its total.
  - `event_counts` for the list goes through `readAll` too (one row per upcoming event, can pass `max_rows`).
- **KVKK:** no personal data in logs. Guests are a count only. The share text never carries names.
- **Copy:**
  - UI "sen"; Turkish first and native; every key in both message files; no CSS `uppercase` on Turkish.
  - Labels: "Katılıyorum", "Sürücü" (own bike), "Artçı" (passenger), "Misafir" (non-member guest), "Katıldıklarım",
    "Katılmaktan vazgeç", "Güncellendi".
  - Offer iltan 2–3 options for each headline in the task report.
- **Lint (CLAUDE.md):**
  - No `as` casts, `!`, `any` or `@ts-*`.
  - Zod for FormData / RPC `jsonb`.
  - `Date.now()` after a session read needs the named disable.
  - Every promise awaited or `void`ed.

## Review Focus

1. **Two people taking the last place at once:** two concurrent `join_event` calls for one remaining place → exactly
   one succeeds. pgTAP runs in one session and can't race, so Task 1 locks the event row `for update` before
   counting (reviewers check the order), and Task 6's E2E sends two joins in parallel and expects one refusal.
2. **An organiser tightens a rule after people joined:** lowering `limit_people` below the count, raising `min_cc`,
   or setting `full_members_only` must not lock existing participants. They can still lower guests, switch to
   passenger and leave; nobody is removed; organisers see "over the limit". Pinned in Task 1 (pgTAP "don't make it
   worse" cases) and Task 4 (over-limit flag in `countsLine`).
3. **Data leaking to the wrong viewer:**
   - An ön alım member or an active member after the event gets no names.
   - A non-organiser gets no ön alım flag, emergency-contact field or change-log author.
   - A `deleting` / `inactive` participant appears nowhere and in no count.

   Pinned in Task 2's pgTAP per viewer.
4. **Closing at `starts_at`:** join/edit/leave at `starts_at` exactly is refused (`now() >= starts_at`), one second
   before is allowed. Pinned in Task 1 with events planted at `now() ± interval`.
5. **Gate bypass through the new RPCs:** an active member, ön alım member or anon calling `join_event`,
   `event_counts`, `event_roster`, `event_change_log`, `event_authors` or reading `event_signups` before the release
   gets `42501` / no rows. Pinned in Task 1 and Task 2, before the in-transaction gate swap.

---

### Task 1: Gate function, sign-ups, join/leave, delete rule

**Files:**
- Modify: `supabase/schemas/40_events.sql`
  - `private.can_see_events()` and `public.can_see_events()`.
  - The two select policies use the private one.
  - `delete_event` refuses with `has_signups`.
  - Header comment updated (gate lives in one function).
- Create: `supabase/schemas/42_event_signups.sql`, `supabase/tests/database/event_signups.test.sql`
- Modify: `supabase/tests/database/events.test.sql`
  - Gate assertions keep passing.
  - Add a `can_see_events()` assertion per fixture.
- Create: the generated migration `<ts>_event_signups.sql`
- Modify: `src/lib/supabase/database.types.ts`

**Interfaces:**
- Produces:
  - `private.can_see_events() returns boolean` (stable, security definer, `search_path = ''`). Execute is granted to
    `authenticated` (policies call it); body in this branch: `select private.has_permission('events.manage')`.
  - `public.can_see_events() returns boolean`, which wraps it and is granted to `authenticated` only.
  - `public.event_role` enum `('rider','passenger')`.
  - Table `public.event_signups`:
    - Columns: `event_id → events on delete cascade`, `profile_id → profiles on delete cascade`,
      `role event_role not null`, `guests smallint not null default 0 check (guests between 0 and 3)`,
      `created_at`, `updated_at`.
    - Primary key `(event_id, profile_id)`; index `(profile_id, event_id)`.
    - RLS select policy: `profile_id = (select auth.uid()) and (select private.can_see_events())`.
    - Grants: `select` to `authenticated`; nothing else.
  - `public.join_event(p_event uuid, p_role public.event_role, p_guests integer default 0) returns void`: an upsert
    of the caller's sign-up, under the rules and errors in Global Constraints.
  - `public.leave_event(p_event uuid) returns void`: deletes the caller's sign-up; a no-op when not signed up;
    `started` after start.
  - `delete_event` raises `P0001` / `has_signups` when any counted sign-up exists.

- [ ] **Step 1: Write `event_signups.test.sql`.**
  - Fixtures:
    - 0761 organiser (active, role 0769 holding only `events.manage`); 0762 second organiser (same role).
    - 0763 active member, no role; 0764 ön alım member; 0765 `deleting` organiser; 0766 `inactive` organiser.
    - 0767 organiser with a 400 cc bike; 0761 has a 250 cc bike; 0762 has a bike without cc.
  - Events planted as postgres:
    - 0771 ride, starts `now() + 2 days`, `limit_people 3`, `limit_bikes 2`.
    - 0772 meet-up, starts `now() + interval '1 second'`; 0776 meet-up, starts exactly `now()`. `now()` is fixed
      for the whole test transaction and the RPC reads the same value, so 0776 is "started" and 0772 is open; no
      `pg_sleep`.
    - 0773 ride, `min_cc 400`, `full_members_only`.
    - 0774 cancelled meet-up.
    - 0775 meet-up, starts `now() - 1 hour`.
  - Assertions (login helper as in `events.test.sql`):

```sql
-- gate: 0763, 0764 call join_event / leave_event → 42501; select from event_signups → 0 rows; can_see_events() false
select throws_ok($$ select public.join_event('…0771', 'passenger') $$, '42501', null, 'member refused before the release');
-- organiser joins as rider with 1 guest; own row readable; counts per the limit rules
select lives_ok($$ select public.join_event('…0771', 'rider', 1) $$, 'organiser joins as rider with a guest');
-- people limit 3: 0761 rider+1 guest (2 people), 0762 passenger+1 guest → P0001 people_limit; 0762 passenger alone → ok
select throws_ok($$ select public.join_event('…0771', 'passenger', 1) $$, 'P0001', null, 'third and fourth person refused');
select is((select hint from pg_temp.last_error), 'people_limit', 'hint names the people limit');  -- helper catching the hint
-- bike limit 2: with 2 riders a third rider → bike_limit, as passenger → ok (when people allow)
-- don't make it worse: postgres lowers limit_people to 1 → 0761 lowers guests 1→0 ok; raises 0→1 → people_limit;
--   switching rider→passenger ok; passenger→rider with bikes full → bike_limit
-- min_cc 400 (0773): 0761 (250 cc) as rider → min_cc; as passenger → full_members_only only for ön alım, so ok;
--   0762 (cc null) as rider → min_cc; 0767 (400 cc) as rider → ok
-- guests: -1 and 4 → 22023; unknown role → 22P02 (enum cast)
-- cancelled 0774: join → cancelled; leave on a cancelled event → ok
-- started 0775 and 0776 (starts_at = now()): join, edit, leave → started; 0772 (now() + 1 s): join ok
-- unknown event → P0002; deleting 0765 and inactive 0766 (both hold the role) → 42501
-- delete_event with a counted sign-up → P0001 has_signups; after the only sign-up is an inactive profile's → deletes
-- account goes: delete auth user 0762 → its sign-ups gone (cascade)
-- after the gate swap (comment why): 0763 joins 0771 as passenger ok; 0764 (ön alım) joins 0773 → full_members_only;
--   0764 joins 0771 ok; setting full_members_only on 0771 afterwards → 0764 can still lower guests and leave
-- pg_proc: exactly one join_event, one leave_event
```

  `pg_temp.last_error` is a small helper that runs a statement in a `begin … exception when others then get stacked
  diagnostics …` block and returns `sqlstate` and `hint`. It sits next to the login helper. `throws_ok` can't read
  hints.

- [ ] **Step 2: Run `pnpm db:test`.** Expected: FAIL (missing table and functions).
- [ ] **Step 3: Implement the schema and RPCs.**
  - Lock the event `for update`, then check, in order:
    1. gate;
    2. caller status;
    3. `p_guests` range;
    4. event exists;
    5. cancelled;
    6. started;
    7. `full_members_only` (new sign-up by an ön alım member);
    8. `min_cc` (becoming a rider);
    9. people limit, then bike limit (counted sign-ups of others + the new own footprint, only when the own footprint
       rises).
  - Then `insert … on conflict (event_id, profile_id) do update`.
  - Run `pnpm db:migration event_signups`, review it, then `pnpm db:reset`.
- [ ] **Step 4: Run `pnpm db:test`.** Expected: PASS on all files.
- [ ] **Step 5: Run `pnpm db:types`.**
  - Update `src/lib/events/actions.ts` for `delete_event`'s new refusal: `P0001` + `has_signups` → status
    `hasSignups`.
  - Add the message `Events.errors.hasSignups`: "Bu etkinliğe katılan var; silmek yerine iptal edebilirsin."
  - Run the full check line.
- [ ] **Step 6: Commit:** `feat(db): event sign-ups with join rules, gate in one function`.

### Task 2: Counts, roster, authors and the change log

**Files:**
- Modify: `supabase/schemas/42_event_signups.sql` (read RPCs), `supabase/schemas/40_events.sql`
  - `event_changes` table.
  - `save_event` writes it.
  - Since this file sorts before `42_…`, the sign-up check inside `save_event` is plpgsql (resolved at call time,
    fine).
- Modify: `supabase/tests/database/event_signups.test.sql`
- Create: the generated migration `<ts>_event_reads.sql`
- Modify: `src/lib/supabase/database.types.ts`

**Interfaces:**
- Produces:
  - `private.event_is_upcoming(starts_at timestamptz, ends_at timestamptz) returns boolean` (`stable`: it reads
    `now()`), used by `event_roster`.
  - `public.event_counts(p_events uuid[]) returns table (event_id uuid, people integer, bikes integer, members
    integer, guests integer, probation integer)`. One row per visible event in the array (zeros included); ordered by
    `event_id`; `42501` without the gate.
  - `public.event_roster(p_event uuid) returns table (profile_id uuid, full_name text, avatar_url text, role
    public.event_role, guests integer, probation boolean, has_emergency_contact boolean)`.
    - Rows follow the visibility table in Global Constraints.
    - Order: `full_name collate "tr-x-icu", profile_id`.
    - `probation` / `has_emergency_contact` are null for non-organisers.
    - `42501` without the gate; `P0002` for an unknown id.
  - `public.event_authors(p_event uuid) returns table (created_by_name text, updated_by_name text, edited_by_other
    boolean)`: names null when the profile is gone or `deleting`.
  - Table `public.event_changes`:
    - Columns: `id uuid pk`, `event_id → events on delete cascade`, `changed_by → profiles on delete set null`,
      `changed_at timestamptz default now()`, `changes jsonb not null`.
    - Check: `jsonb_typeof(changes) = 'array' and jsonb_array_length(changes) > 0`.
    - Index `(event_id, changed_at desc, id)`.
    - RLS on; no grants to `anon` / `authenticated`.
  - `public.event_change_log(p_event uuid) returns table (id uuid, changed_at timestamptz, changes jsonb,
    changed_by_name text)`.
    - Newest first (`changed_at desc, id desc`).
    - `changed_by_name` only for `events.manage`, else null.
    - `42501` without the gate.
  - All `stable`, security definer, `search_path = ''`, `revoke … from public, anon`, `grant execute … to
    authenticated`.

- [ ] **Step 1: Extend the test file.**
  - Per viewer, before the gate swap:
    - organiser sees every counted participant, with `probation` true for 0764's row and `has_emergency_contact`
      matching a planted contact;
    - 0763 / 0764 get `42501` from each read RPC.
  - After the swap:
    - 0763 sees only active participants' names on an upcoming event, with `probation` and `has_emergency_contact`
      null, and no rows on 0775 (past);
    - 0764 sees no rows;
    - counts are identical for 0761, 0763 and 0764;
    - a `deleting` and an `inactive` participant (planted sign-ups) appear in no row and no count.
  - `event_authors` returns the organiser's name to 0764, and null after the author is set to `deleting`.
  - Change log:
    - saving 0771 with a new `starts_at` and the same places while it has sign-ups adds exactly one row whose
      `changes` = `[{"field":"starts_at","old":…,"new":…}]`;
    - a title-only edit adds none;
    - an edit of an event without counted sign-ups adds none;
    - changing a place's point with the same name logs `places` with equal name lists;
    - `changed_by_name` is null for 0763 and set for 0761;
    - after deleting 0761's auth user, `changed_by` is null.
- [ ] **Step 2: Run `pnpm db:test`.** Expected: FAIL.
- [ ] **Step 3: Implement the read RPCs and the change table.**
  - In `save_event` (edit path only), before replacing, read the old row and places, compare, and insert one
    `event_changes` row when the list is non-empty and a counted sign-up exists.
  - Run `pnpm db:migration event_reads`, review it, then `pnpm db:reset`.
- [ ] **Step 4: Run `pnpm db:test`.** Expected: PASS.
- [ ] **Step 5: Run `pnpm db:types` and the full check line.**
- [ ] **Step 6: Commit:** `feat(db): event counts, rosters per viewer, authors and change log`.

### Task 3: Join rules, counts line and share lead in TypeScript

**Files:**
- Create: `src/lib/events/join.ts`, `src/lib/events/join.test.ts`
- Modify: `src/lib/events/places.ts` (+ `places.test.ts`): `shareText` lead line

**Interfaces:**
- Produces (dependency-free, so `node --test` runs them):
  - `type JoinRole = "rider" | "passenger"`; `type Signup = { role: JoinRole; guests: number }`;
    `type Counts = { people: number; bikes: number; members: number; guests: number; probation: number }`.
  - `type JoinReason = "started" | "cancelled" | "peopleLimit" | "bikeLimit" | "minCc" | "fullMembersOnly"`.
  - `joinSchema` (Zod): `{ role: z.enum(["rider","passenger"]), guests: z.int().min(0).max(3) }`;
    `MAX_GUESTS = 3`.
  - `checkJoin(input: { event: { status; startsAt: string; limitPeople: number | null; limitBikes: number | null;
    minCc: number | null; fullMembersOnly: boolean }; counts: Counts; mine: Signup | null; next: Signup; probation:
    boolean; maxCc: number | null; now: number }): JoinReason | null`.
    - The same rules and order as `join_event`, including "don't make it worse".
    - `counts` include `mine`, so subtract the own footprint first.
    - The UI uses it to explain and to disable options; the DB still decides.
  - `reasonFromHint(hint: string | undefined): JoinReason | "hasSignups" | null`: maps the DB hints (`people_limit` →
    `peopleLimit`, …).
  - `countsLine(counts: Counts, limits: { people: number | null; bikes: number | null }): { people: string; bikes:
    string; over: boolean }`:
    - Numbers only: `"18"` or `"18 / 20"`.
    - `over` is true when either count exceeds its limit.
    - Messages wrap these strings.
  - `shareText(event, { when, cancelledTitle, changeLead })`: gains `changeLead: string | null`. When it is set and
    the event isn't cancelled, it is the first line. The page builds it from the newest change-log entry.

- [ ] **Step 1: Write the failing tests.**
  - `checkJoin`:
    - each reason with the boundary values: people 3/3 refuses one more; a passenger with full bikes passes; a rider
      with 250 cc under `minCc` 400 refuses, 400 passes, null refuses;
    - `now === startsAt` is `started`; 1 ms before passes;
    - the "don't make it worse" cases from Task 1 (lowering guests over the limit passes; switching
      passenger → rider when bikes are full refuses);
    - `fullMembersOnly` refuses a new ön alım sign-up but not an existing one's edit.
  - `reasonFromHint` for every hint plus `undefined` → null.
  - `countsLine` for no limits, with limits and over a limit.
  - `shareText` with a lead line, with a lead line on a cancelled event (the cancel line wins), and without one.
- [ ] **Step 2: Run `node --test src/lib/events/join.test.ts src/lib/events/places.test.ts`.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests.** Expected: PASS. Then run the full check line.
- [ ] **Step 5: Commit:** `feat(events): join rules, counts line and change lead for sharing`.

### Task 4: Queries, actions and the gate on the pages

**Files:**
- Create: `src/lib/events/access.ts`
- Modify: `src/lib/events/queries.ts`, `src/lib/events/actions.ts`
- Modify: `src/app/[locale]/events/page.tsx`, `src/app/[locale]/events/past/page.tsx`,
  `src/app/[locale]/events/[id]/page.tsx`
  - The gate checks call `canSeeEvents` / `requireEventsAccess`.
  - Organiser-only controls keep `can(…, "events.manage")`.

**Interfaces:**
- Consumes: Task 1–3 RPCs and types.
- Produces:
  - `canSeeEvents = cache(async (): Promise<boolean>)`: `rpc("can_see_events")`; false when signed out or on error
    (log the code only).
  - `requireEventsAccess(returnTo: Href): Promise<CurrentUser>`: signed out → sign-in with `?next`; no access →
    `notFound()`. Same shape as `requireAccess` in `src/lib/auth/require-access.ts`; reuse that by exporting it, not
    by copying.
  - `getEvent` drops the `profiles` join and reads names from `event_authors`. Its type is unchanged.
  - New queries:
    - `getEventCounts(ids: string[]): Promise<Map<string, Counts>>` (`readAll` over the RPC, `.order("event_id")`);
    - `getRoster(id): Promise<{ rows: RosterRow[]; overCeiling: boolean }>` with `type RosterRow = { profileId;
      fullName; avatarUrl; role: JoinRole; guests: number; probation: boolean | null; hasEmergencyContact: boolean |
      null }`;
    - `getChangeLog(id): Promise<{ entries: ChangeEntry[]; overCeiling: boolean }>` with `type ChangeEntry = { id;
      changedAt: string; changes: { field: ChangeField; old: Json; new: Json }[]; changedByName: string | null }`
      (Zod-parse `changes`);
    - `getMySignups(): Promise<Map<string, Signup>>` (own rows, `readAll`);
    - `getMyJoinContext(): Promise<{ probation: boolean; maxCc: number | null; hasEmergencyContact: boolean }>` (own
      bikes and contacts via RLS, status from `getCurrentUser`).
  - Actions:
    - `joinEvent(id: string, input: unknown): Promise<JoinActionResult>`;
    - `leaveEvent(id: string): Promise<JoinActionResult>`;
    - `type JoinActionResult = { status: "ok" } | { status: "refused"; reason: JoinReason } | { status: "invalid" |
      "forbidden" | "notFound" | "error" }`.
    - Map `P0001` through `reasonFromHint`, the rest as `fail()` does today.
    - `refresh()` after success.

- [ ] **Step 1: Implement the queries, actions and access helper.**
  - Keep `fail()` shared.
  - Add a small `joinResult(error)` mapper to `join.ts` with unit tests: `P0001` + each hint → `refused`; `42501`,
    `P0002`, `22023`; unknown → `error`.
- [ ] **Step 2: Swap the page gates.**
  - `/events`: `canSeeEvents()` replaces `can(…, "events.manage")` for the list; the create button stays
    organiser-only.
  - `/events/past` and `/events/[id]`: `requireEventsAccess`.
  - Behaviour is unchanged in this branch, because the function still says "organisers only".
- [ ] **Step 3: Run `pnpm test` and the full check line.** Expected: PASS.
- [ ] **Step 4: Commit:** `feat(events): sign-up queries and actions; pages ask the database gate`.

### Task 5: Event page and list: join, counts, roster, change box

**Files:**
- Create in `src/components/events/`:
  - `join-panel.tsx` (client), `event-counts.tsx`, `event-roster.tsx` (client: paging), `change-log.tsx`
- Modify: `src/app/[locale]/events/[id]/page.tsx`, `src/components/events/event-card.tsx`,
  `src/components/events/events-list.tsx`, `src/components/events/delete-event-dialog.tsx`,
  `src/components/events/events-skeleton.tsx`, the event page's `EventSkeleton`,
  `src/lib/events/events-view.ts` (+ test)
- Modify: `src/components/profile/motorcycles-section.tsx` (`id="motorcycles"` + `scroll-mt-20` on its `Card`, for
  the `min_cc` link)
- Modify: `messages/tr.json`, `messages/en.json` (`Events.join.*`, `Events.roster.*`, `Events.changes.*`,
  `Events.counts.*`)

**Interfaces:**
- Consumes: Task 3 and Task 4 exports; `SafetyCardDialog` (`src/components/members/safety-card-dialog.tsx`),
  `slicePage`, `PagerButtons`, `CeilingNotice`.
- Produces:
  - `eventsView` gains a `mine` filter: `{ side, kind, mine: boolean, page }`, where `mine` keeps the ids in a set
    passed in; `counts.mine`.

- [ ] **Step 1: Write the failing `events-view.test.ts` cases for `mine`.** Run them and see them fail, implement,
  then see them pass.
- [ ] **Step 2: Event page.** Under the header, in this order:
  - **Counts:** "18 / 20 kişi · 12 / 15 motor" via `countsLine`.
    - Active members (not organisers) also get "+2 yeni üye" when `probation > 0`, because their roster hides ön alım
      participants.
    - Organisers get a red "Sınır aşıldı" when `over`.
  - **Join panel:** Sürücü / Artçı radio, guests stepper 0–3 ("Misafir: yanında gelen üye olmayan kişi, motorda
    artçı olur").
    - Buttons: "Katılıyorum" or, when signed up, "Güncelle" plus "Katılmaktan vazgeç" (confirm in an `AlertDialog`).
    - Options `checkJoin` refuses are disabled, with the reason in text. For `minCc`, link to `/account#motorcycles`.
    - Started or cancelled events show the state instead of the panel.
    - After a successful join with no emergency contact, show the nudge "Acil durum kişisi ekle" →
      `/account#emergency`.
    - Refusals from the server show the same reason texts.
  - **Change box "Güncellendi":** newest first, one line per field ("Başlangıç 08:30 → 09:00", "Rota: A → B ⇒ A → C",
    "Kişi sınırı 20 → 15", …) and the time. Organisers also see "· {name}".
  - **Roster:**
    - Organisers: everyone, with an "Ön alım" badge, "+N misafir", Sürücü/Artçı, "Acil durum kişisi yok", and a
      `SafetyCardDialog` per row when `can(…, "members.safety")`.
    - Active members: names while upcoming.
    - Ön alım members and past events: counts only (no roster section).
  - **Delete:** disabled when `counts.members > 0`, with the hint "Katılan var; iptal edebilirsin" (the DB refuses
    anyway).
  - **Share:** `changeLead` from the newest change entry ("Güncellendi: saat 09:00", the copy decided in the task).
- [ ] **Step 3: List.**
  - Each card gets the counts line and a capacity bar when a limit is set (design-system §6), plus a "Katılıyorsun"
    badge when signed up.
  - `EventsList` gets the "Katıldıklarım" chip (URL key `mine=1` via `useListParams`, counts shown like the other
    chips).
- [ ] **Step 4: Skeletons.** Extend `EventSkeleton` with the counts line and the join panel (Sürücü/Artçı + button
  row), and the card skeleton with the counts line. Mark the new blocks with `data-skeleton` / `data-skeleton-result`.
- [ ] **Step 5: Copy.** Both message files. Offer headline options in the task report.
- [ ] **Step 6: Run the full check line.**
- [ ] **Step 7: Commit:** `feat(events): join panel, counts, rosters per role and the change box`.

### Task 6: Browser E2E, skeleton measurements, docs

**Files:**
- Create: `scripts/e2e/events-join-e2e.mjs`
- Modify:
  - `scripts/e2e/README.md`.
  - `CLAUDE.md`: E2E list in Commands; one Database line on sign-ups, the gate function and the hint contract.
  - `docs/follow-ups.md`: deferred items from this branch; the "Next up" 2b item gains anything the release must do.
  - `docs/learnings/*`: anything found.
  - The spec: §9 records the 2a/2b split and the Claude calls made here (counted statuses, "don't make it worse",
    hints).

- [ ] **Step 1: E2E** against the local stack and `pnpm start -p 3123`.
  - Fixtures: `admin@test.local` (admin), `member@test.local` (active), `probation@test.local` (ön alım),
    `member2@test.local` (active).
  - The script opens the gate locally by replacing `private.can_see_events()` via `docker exec -i … psql` and
    restores the organiser-only body in `finally`. It prints a warning when the restore fails; `pnpm db:reset` also
    restores it.
  - Scenarios:
    1. With the gate closed, the member gets "Çok yakında" and a 404 on the event (gate check).
    2. With the gate open:
       - the organiser creates a ride with `limit_people 3`, `limit_bikes 1`, `min_cc 400`;
       - the member with no 400 cc bike sees Sürücü disabled with the `/account#motorcycles` link, joins as Artçı
         with 1 guest, and sees the emergency nudge;
       - member2 and the organiser send joins **in parallel** for the last place: exactly one wins and the other sees
         "Kontenjan dolu";
       - the organiser's roster shows the probation badge, "acil durum kişisi yok" and a safety-card button;
       - the member's roster shows names without the badge;
       - the probation member sees counts and no names, and on a `full_members_only` event sees the reason;
       - the organiser changes the start time: the change box shows "Başlangıç … → …" and the share href's text
         starts with the lead line;
       - delete is disabled with sign-ups; cancel works; join closes;
       - "Katıldıklarım" filters the list with no request.
  - Run at 390px and 1280px. Fixture rows are cleaned before and after.
- [ ] **Step 2: Skeletons.** Measure the event page and the list with `scripts/e2e/skeletons.mjs` (JS off) as an
  organiser who is signed up and as one who is not; adjust; note the states the fallback can't know in follow-ups.
- [ ] **Step 3: Docs.** Update the files listed above.
- [ ] **Step 4: Verify.**
  - Full check line and `pnpm db:test`.
  - The new E2E plus `events-e2e.mjs` (organiser flow unchanged), `nav-e2e.mjs` and `apply-nav-e2e.mjs`.
  - Check that the gate body is back to organisers-only:
    `select prosrc from pg_proc where proname = 'can_see_events'`.
- [ ] **Step 5: Commit:** `test(e2e): events joining flow; docs`.
