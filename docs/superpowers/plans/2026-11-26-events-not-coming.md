# Events "Gelmiyorum" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Club members can answer an event with "Gelmiyorum"; organisers see who said no and how many haven't answered.

**Architecture:** A new table `public.event_declines` beside `event_signups`, written only by `decline_event` (replaces
`leave_event`) and `join_event`, which keep the two tables mutually exclusive under the event-row lock. Two
organiser-only read RPCs (`event_decliners`, `event_unanswered`). The join panel gets the third state, `/events` cards a
badge, the event page an organiser section.

**Tech Stack:** Supabase Postgres (declarative schemas, RLS, pgTAP), Next.js 16 App Router (Server Actions,
`cacheComponents`), next-intl, shadcn/Base UI, puppeteer E2E.

**Spec:** `docs/superpowers/specs/2026-11-26-events-not-coming-design.md` (read it first; it wins on any doubt).

## Global Constraints

- Read CLAUDE.md (Database, Events, Stack, Git) and `docs/learnings/supabase.md`, `testing.md`, `ui.md` before coding.
- Never discard changes you didn't make (no `git checkout -- .`, `restore .`, `reset --hard`, `stash`, `clean`); stage by
  path; never commit `.claude/settings.json`; no `Co-Authored-By` or other attribution trailers.
- Before `pnpm db:migration` / `migration up`: `node scripts/dev/worktree.mts db-check`; another branch listed → stop
  and ask iltan. Apply locally with `pnpm exec supabase migration up` (keeps the E2E fixture users), not `db:reset`.
- This worktree: dev on the next free port, E2E on `pnpm start -p 3124` with `BASE_URL=http://localhost:3124`.
- Only active and ön alım people's no's show anywhere (mirrors `private.counted_event_signups`).
- A no never counts: `event_counts`, `event_roster`, `delete_event`'s `has_signups`, the change-log trigger and limits
  stay reading `private.counted_event_signups` only, unchanged.
- Who sees the no's is decided in exactly one place: `public.event_decliners` (organisers = `events.manage`).
- pgTAP runs on production: assert only on fixture ids; the unanswered count only as differences around fixture
  actions, never an absolute number.
- Copy (Turkish source, "sen"; notice "siz"): button "Gelmiyorum", declined heading "Gelmiyorsun", done "Gelmeyeceğini
  kaydettik.", dialog "Gelmiyor musun?" / "Yerin boşalır. Etkinlik başlayana kadar fikrini değiştirebilirsin; yer
  kalmışsa yeniden katılırsın." / "Hayır, geliyorum" / "Evet, gelmiyorum", organiser heading "Gelmeyenler", "{count}
  kişi henüz yanıt vermedi", card badge "Gelmiyorsun". Alternatives from the spec go to follow-ups (Task 5).
- Before each code commit: `pnpm lint && pnpm exec tsc --noEmit && pnpm test && pnpm build`; after: `git show --stat`.

## Review Focus

- A full event (people or bike limit reached): a member with no answer can still say no → pgTAP in Task 1; the panel
  keeps "Gelmiyorum" enabled when `closed` is a limit reason → E2E in Task 4.
- An event whose only answers are no's: `delete_event` deletes it and the no's go with it (cascade) → pgTAP in Task 1.
- Two tabs: decline in one, join in the other (stale panel) → the last call wins and never both rows → pgTAP
  exclusivity both ways in Task 1.
- An ön alım member who said no before the organiser ticked "Sadece tam üyeler": heading "Gelmiyorsun", no buttons,
  their no stays in the organiser list → pgTAP (re-decline refused, row kept) in Task 1.
- After the start: organiser still sees "Gelmeyenler", the unanswered line is gone; members see the closed panel with
  "Gelmiyorsun" → E2E in Task 4 (plant a started event by SQL).

---

### Task 1: Database: `event_declines`, `decline_event`, organiser reads

**Files:**
- Modify: `supabase/schemas/42_event_signups.sql`
- Create: `supabase/migrations/<timestamp>_events_not_coming.sql` (generated, reviewed)
- Create: `supabase/tests/database/event_declines.test.sql`
- Modify: `supabase/tests/database/event_signups.test.sql` (every `leave_event` → `decline_event`)
- Modify: `src/lib/supabase/database.types.ts` (`pnpm db:types`)
- Modify: `src/lib/events/actions.ts` (`leaveEvent` → `declineEvent`), `src/components/events/join-panel.tsx` (the one
  call), `src/lib/events/join.ts` (doc comment of `joinResult`)

**Interfaces:**
- Produces (SQL):
  - table `public.event_declines (event_id uuid → events on delete cascade, profile_id uuid → profiles on delete
    cascade, created_at timestamptz not null default now(), primary key (event_id, profile_id))`, index
    `(profile_id, event_id)`; RLS on; `revoke all … from anon, authenticated`; `grant select … to authenticated`;
    policy `"event_declines: read own declines of visible events"` = `profile_id = (select auth.uid()) and (select
    private.can_see_events())`.
  - `public.decline_event(p_event uuid) returns void`, security definer, `search_path = ''`; granted to authenticated
    only. Order: gate (42501) → caller active/ön alım (42501) → lock event `for update` (P0002 unknown) → started
    (`now() >= starts_at`: P0001 hint `started`) → if `full_members_only` and caller is ön alım and has no sign-up:
    P0001 hint `full_members_only` → delete own sign-up → insert decline `on conflict do nothing`. Cancelled: allowed.
  - `public.join_event` (same signature): after the upsert, `delete from public.event_declines where event_id =
    p_event and profile_id = uid`.
  - `public.leave_event` dropped.
  - `public.event_decliners(p_event uuid) returns table (profile_id uuid, full_name text, avatar_url text, probation
    boolean)`, stable, security definer: gate 42501, unknown event P0002; not `events.manage` → zero rows; else
    declines of profiles with status active/probation, `probation = status = 'probation'`, ordered `full_name collate
    "tr-x-icu", profile_id`. Header comment: "THE place that decides who sees the no's".
  - `public.event_unanswered(p_event uuid) returns integer`, stable, security definer: gate 42501, unknown P0002; not
    `events.manage` → null; else count of profiles with status `active`, or `probation` when the event isn't
    `full_members_only`, having neither a row in `private.counted_event_signups` nor in `event_declines` for it.
- Produces (TS): `declineEvent(id: string): Promise<JoinActionResult>` in `src/lib/events/actions.ts` (same body shape
  as `leaveEvent`, RPC `decline_event`, log label `"declineEvent failed"`).

- [ ] **Step 1: Write the failing pgTAP file `event_declines.test.sql`**

  Same scaffolding as `event_signups.test.sql` (`begin`, `plan(N)`, `pg_temp.login`, `pg_temp.last_error`,
  `rollback`). Fixtures in the unused `…0801`–`…0819` range: 0801 organiser (role 0809 with only `events.manage`),
  0802 and 0805 active members, 0803 ön alım, 0804 inactive, 0806 deleting; events 0811 upcoming meet-up with
  `limit_people = 1` and 0805 signed up (full), 0812 upcoming `full_members_only` with 0803 signed up, 0813 started
  (`starts_at = now()`), 0814 cancelled with 0802 signed up, 0815 upcoming with only a decline of 0802 (delete case),
  0816 upcoming with planted declines of 0803 (ön alım), 0804 (inactive) and 0806 (deleting), 0817 upcoming
  `full_members_only` without rows, 0818 upcoming plain without rows; 0819 is never inserted (unknown). Assertions
  (one `ok`/`is`/`throws_ok` each):
  - grants: authenticated may select `event_declines`, no insert/update/delete; anon no select; anon can't execute
    `decline_event`, `event_decliners`, `event_unanswered`; authenticated can; exactly one `decline_event` and zero
    `leave_event` in `pg_proc` (public).
  - RLS: as 0802 after declining 0816, `select count(*) from event_declines where event_id = 0816` = 1 (own only;
    the planted declines are invisible); the inactive 0804 gets 42501 from `decline_event`.
  - `decline_event`: unknown 0819 → P0002; started 0813 → hint `started`; cancelled 0814 → lives, 0802's sign-up gone,
    decline present; full 0811 as 0802 → lives (no limit applies); 0803 on 0812 with a sign-up → lives (backs out),
    then 0803 again on 0812 → hint `full_members_only`, the decline row still there; 0803 on 0817 (no rows) → hint
    `full_members_only`, no row written; 0802 (active) on 0817 → lives.
  - exclusivity: 0802 joins 0816 → sign-up yes, decline gone; declines → sign-up gone, decline present; a refused join
    (0802 on full 0811 after declining it) keeps the decline.
  - no's never count: `event_counts` for 0816 unchanged by 0802's decline; `event_roster(0816)` has no 0802 row;
    `delete_event(0815)` as 0801 lives and `event_declines` has no 0815 row afterwards.
  - `event_decliners(0816)`: as 0801 returns 0802 (and the planted 0803 decline with `probation = true`), not 0804 /
    0806 (planted declines); as 0802 and as 0803 returns zero rows; unknown 0819 → P0002; anon → 42501.
  - `event_unanswered` (differences only, real members make up the totals): as 0802 → null. As 0801 on 0818: store
    `n`; plant a decline of 0805 (active) as postgres → `n - 1`; plant one of 0803 (ön alım) → `n - 2`. As 0801 on
    0817 (fmo): store `m`; plant a decline of 0803 → still `m` (ön alım isn't invited); plant one of 0805 → `m - 1`.
    Unknown 0819 → P0002.
  - cascade: deleting 0802's `auth.users` row removes its declines.

- [ ] **Step 2: Run `pnpm db:test` and see the new file fail** (missing table/functions).

- [ ] **Step 3: Implement the schema in `42_event_signups.sql`** per the Interfaces block; update the file's header
  comments (`join_event / decline_event`, the error table: `decline_event` adds `full_members_only`) and the
  "Leaves an event" comment. Replace every `leave_event` in `event_signups.test.sql` with `decline_event` (behaviour
  for those assertions is the same: the sign-up disappears) and rename the two grant/`pg_proc` assertions.

- [ ] **Step 4: Generate and review the migration**

  `node scripts/dev/worktree.mts db-check`, then `pnpm db:migration events_not_coming`. The file must contain `drop
  function public.leave_event(uuid)`, the table, policy, grants, index and the three functions; delete any
  `cron.unschedule(...)` line. Then `pnpm exec supabase migration up`.

- [ ] **Step 5: Run `pnpm db:test`** — expected: all files pass.

- [ ] **Step 6: Types and consumer**: `pnpm db:types`; replace `leaveEvent` with `declineEvent` in `actions.ts` and the
  panel's `leave()` call (UI otherwise unchanged in this task); update `joinResult`'s comment to `join_event /
  decline_event`. Run `pnpm lint && pnpm exec tsc --noEmit && pnpm test && pnpm build` — all pass.

- [ ] **Step 7: Commit**

  ```bash
  git add supabase/schemas/42_event_signups.sql supabase/migrations/*_events_not_coming.sql \
    supabase/tests/database/event_declines.test.sql supabase/tests/database/event_signups.test.sql \
    src/lib/supabase/database.types.ts src/lib/events/actions.ts src/lib/events/join.ts \
    src/components/events/join-panel.tsx
  git commit -m "feat(events): decline_event records a no; organiser-only decliners and unanswered count"
  ```

### Task 2: Member side: the panel's third state and the card badge

**Files:**
- Modify: `src/lib/events/queries.ts` (`getMyDeclines`), `src/components/events/join-panel.tsx`,
  `src/app/[locale]/events/[id]/page.tsx` (props + skeleton), `src/app/[locale]/events/page.tsx`,
  `src/components/events/events-list.tsx`, `src/components/events/event-card.tsx`, `messages/tr.json`,
  `messages/en.json`

**Interfaces:**
- Consumes: `declineEvent` (Task 1), table `event_declines`.
- Produces: `getMyDeclines(): Promise<Set<string>>` (event ids of the caller's own declines; `readAll` chunks ordered
  by `event_id`, RLS gives own rows only); `JoinPanel` prop `declined: boolean`; `EventsList` prop `declined:
  string[]`; `EventCard` prop `declined?: boolean`.

- [ ] **Step 1: Messages** (`Events.join`, tr then en; remove `leave`, `leaveDialog`, `done.left`):
  - tr: `decline` "Gelmiyorum", `headingDeclined` "Gelmiyorsun", `declineDialog` {title "Gelmiyor musun?", body "Yerin
    boşalır. Etkinlik başlayana kadar fikrini değiştirebilirsin; yer kalmışsa yeniden katılırsın.", dismiss "Hayır,
    geliyorum", confirm "Evet, gelmiyorum"}, `done.declined` "Gelmeyeceğini kaydettik."; `Events.declinedBadge`
    "Gelmiyorsun" (next to `joinedBadge`).
  - en: "I'm not coming", "You're not coming", {"Not coming after all?", "Your place is freed. You can change your mind
    until the event starts; you're back in if there's still room.", "No, I'm coming", "Yes, I'm not coming"}, "Got it:
    you're not coming.", badge "Not coming".

- [ ] **Step 2: Panel** (`join-panel.tsx`), keeping the focus rescue and the doc comment current:
  - heading: `mine` → `headingJoined`; else `declined` → `headingDeclined`; else `heading` (also in the closed state).
  - buttons: `mine` → "Güncelle" + "Gelmiyorum" (opens `declineDialog`, as the leave dialog did); no `mine` →
    "Katılıyorum" and, unless `declined` or `closed === "fullMembersOnly"`, "Gelmiyorum" (outline) that calls
    `decline()` directly, no dialog. A limit reason in `closed` keeps "Gelmiyorum" enabled.
  - `Outcome["what"]`: `"joined" | "updated" | "declined"`; `decline()` = the old `leave()` with `"declined"`.

- [ ] **Step 3: Wire it**: event page reads `getMyDeclines()` in its `Promise.all` and passes `declined={myDeclines.has(event.id)}`;
  `/events` page reads it too and passes `declined={[...myDeclines]}`; `EventsList` passes `declined` per card;
  `EventCard` shows `<Badge variant="outline">{t("declinedBadge")}</Badge>` where the joined badge sits (never both).
  "Katıldıklarım" stays sign-ups only (no change to `eventsView`).

- [ ] **Step 4: Skeleton**: the join panel's button row in `EventSkeleton` gets a second `Skeleton className="h-8
  w-28"` in a `flex gap-2` row (the common viewer has no answer: two buttons). Measure with `scripts/e2e/skeletons.mjs`
  (member, organiser, signed out) as `docs/learnings/testing.md` describes; widths follow the measurement.

- [ ] **Step 5: Verify**: `pnpm lint && pnpm exec tsc --noEmit && pnpm test && pnpm build` (messages parity included);
  click through on `pnpm dev` as member@test.local (`node scripts/dev/login-as.mjs`): no answer → Gelmiyorum →
  "Gelmiyorsun"; Katılıyorum → joined; Gelmiyorum → dialog; `/events` badge.

- [ ] **Step 6: Commit** (`feat(events): "Gelmiyorum" in the join panel and a badge on declined events`).

### Task 3: Organiser side: "Gelmeyenler" and the unanswered count

**Files:**
- Modify: `src/lib/events/signup-rows.ts`, `src/lib/events/signup-rows.test.ts`, `src/lib/events/queries.ts`,
  `src/app/[locale]/events/[id]/page.tsx`, `messages/tr.json`, `messages/en.json`
- Create: `src/components/events/event-decliners.tsx`

**Interfaces:**
- Consumes: RPCs `event_decliners`, `event_unanswered` (Task 1).
- Produces: `type DeclinerRow = { profileId: string; fullName: string | null; avatarUrl: string | null; probation:
  boolean }`, `parseDeclinerRows(data: unknown): DeclinerRow[]` (signup-rows.ts); `getDecliners(id: string):
  Promise<{ rows: DeclinerRow[]; overCeiling: boolean }>` and `getUnanswered(id: string): Promise<number | null>`
  (queries.ts; `uniqueByProfile` becomes generic over `{ profileId: string }`); `EventDecliners({ rows, overCeiling,
  unanswered }: { rows: DeclinerRow[]; overCeiling: boolean; unanswered: number | null })`.

- [ ] **Step 1: Failing unit tests** in `signup-rows.test.ts`: `parseDeclinerRows` maps `{profile_id, full_name: null,
  avatar_url: null, probation: true}` to `{ profileId, fullName: null, avatarUrl: null, probation: true }`, and
  throws on a row missing `probation`. Run `pnpm test` → fails.

- [ ] **Step 2: Implement** the parser and the two queries (`readAll` for the list, P0002 → treat like `getRoster`;
  `event_unanswered` parsed with `z.number().nullable()`). `pnpm test` → passes.

- [ ] **Step 3: Messages** `Events.decliners` (tr / en): `heading` "Gelmeyenler" / "Not coming", `total` "{count} üye"
  / "{count, plural, one {# member} other {# members}}", `empty` "Henüz gelmeyeceğini bildiren yok." / "Nobody has
  said no yet.", `unanswered` "{count} kişi henüz yanıt vermedi" / "{count, plural, one {# member hasn't} other {#
  members haven't}} answered yet", `range` "{from}–{to} / {total} üye" / as `roster.range` in en, `ceiling` as
  `roster.ceiling` with "gelmeyeceğini bildiren" for "katılan".

- [ ] **Step 4: Component** `event-decliners.tsx`: same section/list/pager structure as `EventRoster` (own `useId`,
  `slicePage`, `PagerButtons`, `CeilingNotice`, `data-skeleton-result="event-decliners"`), each row avatar + name +
  "Ön alım" badge when `probation`; no role line, no safety card. `unanswered !== null` → the line under the heading.

- [ ] **Step 5: Page**: in `EventContent`'s `Promise.all` add `organiser ? getDecliners(id) : null` and `organiser ?
  getUnanswered(id) : null`; render `<EventDecliners>` right after the roster when `organiser`, with `unanswered` only
  when `!cancelled && now < Date.parse(event.startsAt)`, else `null`. No skeleton (the shell can't know the role;
  update the `EventSkeleton` comment to say organisers also get this section).

- [ ] **Step 6: Verify** (`pnpm lint && pnpm exec tsc --noEmit && pnpm test && pnpm build`; on `pnpm dev` as
  admin@test.local after a member declined: name listed, the line shows) and **commit** (`feat(events): organisers see
  who isn't coming and how many haven't answered`).

### Task 4: Browser E2E

**Files:**
- Modify: `scripts/e2e/events-join-e2e.mjs` (header comment, `clean()`, a new `declineScenario(width, height)` run per
  viewport after `joinScenario`), `scripts/e2e/README.md` if fixtures change (they don't: admin, member, member2,
  probation).

- [ ] **Step 1: Write `declineScenario`**. Plant by SQL (titles `E2E Katılım Gelmiyorum <width>` so `clean()` already
  removes them; real v4 ids like `plantFullMembersOnly`): an upcoming meet-up with `limit_people = 1` and member2
  signed up (full), and a started one (`starts_at = now() - 1 hour`) where member has declined. Checks:
  - member, full event: heading "Katılıyor musun?", "Gelmiyorum" enabled; click → heading "Gelmiyorsun", status
    "Gelmeyeceğini kaydettik.", SQL: one `event_declines` row, no sign-up.
  - `/events`: that card has "Gelmiyorsun", not "Katılıyorsun".
  - organiser on the full event: "Gelmeyenler" lists `NAME.member`; the line matches `/^\d+ kişi henüz yanıt
    vermedi$/` and its number equals the SQL count (active + ön alım profiles without a sign-up or decline there).
  - member2 (active, no role) on the same event: no "Gelmeyenler" heading.
  - organiser raises `limit_people` by SQL; member reloads, joins as Artçı → "Katılıyorsun", SQL: decline gone;
    "Gelmiyorum" → dialog "Gelmiyor musun?"; "Hayır, geliyorum" keeps the sign-up; "Evet, gelmiyorum" → declined.
  - started event: member sees "Gelmiyorsun" and the started reason, no buttons; organiser sees the member under
    "Gelmeyenler" and no "henüz yanıt vermedi" line.
  - probation on the "Sadece tam üyeler" event (`plantFullMembersOnly`): no "Gelmiyorum" button.

- [ ] **Step 2: Run** against `pnpm build && pnpm start -p 3124` with email sign-in on (recipe:
  `docs/learnings/testing.md`): `BASE_URL=http://localhost:3124 PUPPETEER_DIR=~/e2e-tools node
  scripts/e2e/events-join-e2e.mjs` → all PASS at 390 and 1280; also `events-e2e.mjs`, `events-public-e2e.mjs` and
  `skeletons.mjs` still pass. Restart Supabase normally and delete the test rows afterwards (CLAUDE.md).

- [ ] **Step 3: Commit** (`test(events): E2E for "Gelmiyorum" and the organiser's no list`).

### Task 5: Privacy notice and docs

**Files:**
- Modify: `src/app/[locale]/privacy/content-tr.tsx`, `content-en.tsx`, `src/lib/applications/options.ts`, `CLAUDE.md`,
  `docs/PLAN.md`, `docs/follow-ups.md`, `docs/learnings/*.md` (only if something non-obvious came up)

- [ ] **Step 1: Notice** ("siz"):
  - "Etkinlik bilgileri": after the guests parenthesis add "veya bir etkinliğe gelmeyeceğinizi bildirmeniz" / en "or
    your answer that you won't come to an event".
  - Events visibility paragraph, after the organisers' sentence: "Bir etkinliğe gelmeyeceğini bildirenleri yalnızca
    organizatörler görür." / "Only organisers see who has said they won't come to an event."
  - Retention: "Etkinlik katılımları ve gelmeyeceğinizi bildirdiğiniz yanıtlar: …"; "katılım kayıtlarınız ve
    yanıtlarınız da silinir" / "Event sign-ups and 'not coming' answers: …"; "your sign-ups and answers are deleted
    too".
  - `PRIVACY_NOTICE_VERSION = "2026-11-26-draft-11"`; `docs/PLAN.md` "Privacy notice" line to the same version.

- [ ] **Step 2: Docs**: CLAUDE.md Events bullet: sign-ups only via `join_event` / `decline_event`; no's in
  `event_declines`, organiser-only via `event_decliners` (the one place that decides), `event_unanswered`; never
  counted. `docs/PLAN.md` status: "Gelmiyorum" built (date). `docs/follow-ups.md`: remove the "Events: I'm not
  coming" item and its mention in "Member conduct, rest of step 2b"; add: widen the no list to everyone who sees the
  roster on member feedback (change `event_decliners` + notice); the "hasn't answered" list (names); copy alternatives
  ("Gelmeyeceksin", "Yanıtın kaydedildi.", "Gelmiyor") for iltan's production check; update the "Events joining: small
  features left out" item (a): leaving a cancelled event is now "Gelmiyorum" in the DB, the panel still offers none.

- [ ] **Step 3: Verify and commit**: `pnpm format:check && pnpm lint && pnpm exec tsc --noEmit && pnpm test && pnpm
  build`; commit (`docs(events): notice draft-11, CLAUDE.md, plan and follow-ups for "Gelmiyorum"`).

## After the tasks

`verification-before-completion` (format, lint, tsc, test, db:test, build, browser E2E), `requesting-code-review` and
`/security-review` (new table, grants, RLS, security-definer RPCs), then iltan reviews. Rollout after the merge:
`pnpm db:push`, then push `main` at once (`leave_event` is dropped and the deployed app calls it;
`docs/runbooks/production-checks.md`).
