# Ön Alım (Probation) and Staff Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New members start in an "ön alım" status that can't see other members (only a crowd view of initials),
staff promote or remove them with one click, and staff with `members.notes` keep dated, append-only notes on members.

**Architecture:** A new `probation` value in `public.member_status`: everything that already checks `active` keeps
meaning "full member" (closed by default); a new helper `private.is_club_member()` (`active` or `probation`) opens only
own-row writes. Notes are a new RLS-protected table `public.member_notes` behind a new `members.notes` permission. The
app gets an "Ön alım" tab and status buttons on `/admin/members`, a notes dialog per row, a crowd view on `/members`
and an ön alım card on `/account`.

**Tech Stack:** Supabase Postgres (declarative schemas, pgTAP), Next.js 16 App Router (Server Actions, Suspense),
next-intl, shadcn/ui (Base UI), Zod, `node --test`, puppeteer E2E.

**Spec:** `docs/superpowers/specs/2026-11-18-probation-and-member-notes-design.md`

## Global Constraints

- Branch `feat/probation-notes` (exists, spec committed). No worktrees. Stage files by path; never `git add -A`,
  `git commit -a`, `git stash`, `git checkout -- .`, `git restore .`, `git reset --hard`, `git clean`. No co-author
  trailers. `.claude/settings.json` local changes: never commit, revert or mention.
- DB workflow per CLAUDE.md: edit `supabase/schemas/*.sql` → `pnpm db:migration <name>` → review the file(s) (a new
  enum value is split into `_1`/`_2` migrations, `docs/learnings/supabase.md`; delete any `cron.unschedule(...)` line)
  → `pnpm db:reset` → `pnpm db:test` → `pnpm db:types` → commit schema + migration + types (+ consumers) together.
- Every commit passes `pnpm lint && pnpm exec tsc --noEmit && pnpm test && pnpm build` (a task that changes a type
  updates its consumers in the same commit).
- pgTAP: fixture ids `00000000-0000-0000-0000-000000000701`…`0729` (unused today), emails `pgtap-…@pgtap.invalid`;
  every assertion scoped to fixture ids (the suite also runs on production); never update real rows.
- Statuses: `pending`, `probation`, `active`, `inactive`, `deleting`. TR label **"Ön alım"**, EN **"Probation"**.
  Staff never set `deleting`; staff never take `pending → active` (DB refuses, `42501`).
- Rights stay `active`-only: `private.has_permission`, `private.is_admin`, `getCurrentUser().access` unchanged.
- Notes: body trimmed, 1–2,000 characters; no update by anyone; delete by admins only, never a note about oneself;
  nobody reads notes about themselves; only admins read/add/delete notes about an admin; `deleting` targets hidden.
- Crowd view: only `active` members counted/shown; initials only (first letter of first and last word, Turkish
  upper-case), random order, computed in SQL; no names, photos, districts or bikes reach the browser.
- Copy: UI "sen", privacy notice "siz"; Turkish must read native; no CSS `uppercase` on Turkish text. No hard-coded UI
  strings; every key in `messages/tr.json` and `messages/en.json`.
- Lint rules (CLAUDE.md "Write it so lint passes"): no `as` casts, `!`, `any`, `@ts-*`; Zod for FormData/RPC JSON.

## Review Focus

1. **An ön alım account reading other members by any path** (direct `profiles` select, `member_directory`,
   `member_safety_card`, `member_details`/`member_motorcycles` selects) gets nothing or `42501`; a full member can't
   see ön alım rows either. Pinned in Task 2's pgTAP.
2. **Names leaking through the crowd view**: the `/members` HTML/RSC payload of an ön alım user contains no full
   name of a fixture member. Pinned in Task 8's E2E (`page.content()` + the RSC response text).
3. **Odd names in initials**: one-word name (`"Ayşe"` → `"A"`), extra spaces (`"  ali   veli "` → `"AV"`), lower-case
   `i` (`"irem işık"` → `"İİ"`), empty name (skipped from the initials, still counted). Pinned in Task 2's pgTAP.
4. **Deletion round trip during ön alım**: request + cancel returns to `probation` with the same
   `status_changed_at`. Pinned in Task 1's pgTAP.
5. **Notes rules at the edges**: a non-admin notes holder on an admin target, an admin deleting a note about
   themselves, an UPDATE by the author — all refused. Pinned in Task 3's pgTAP.

---

### Task 1: `probation` status, transitions and `status_changed_at`

**Files:**
- Modify: `supabase/schemas/10_profiles.sql` (enum, column, trigger, `set_member_status`)
- Modify: `supabase/schemas/20_applications.sql:284-290` (`activate_from_approved_application`)
- Create: `supabase/migrations/<generated>_probation_status*.sql`
- Create: `supabase/tests/database/probation.test.sql`
- Modify: `src/lib/supabase/database.types.ts` (generated)
- Modify (compile-only consumers): `src/lib/access/members-view.ts`, `src/lib/access/members-view.test.ts`,
  `src/components/admin/member-row.tsx` (`NEXT_STATUS` gets a `probation` entry: `{ status: "active", label:
  "promote" }` placeholder until Task 4), `src/lib/applications/apply-view.ts` (+ test), `messages/tr.json`,
  `messages/en.json` (status labels wherever `statuses.*` exist: `Account.statuses`, `Admin.members.statuses`, …)

**Interfaces:**
- Produces: enum value `'probation'`; column `profiles.status_changed_at timestamptz null`; `MEMBER_STATUSES =
  ["pending", "probation", "active", "inactive"]` (`StaffStatus` includes `"probation"`); `applyView("probation", …)
  === "alreadyMember"`; message keys `statuses.probation` = "Ön alım" / "Probation"; `Admin.members.promote` = "Tam
  üye yap" / "Make full member".

- [ ] **Step 1: Write `probation.test.sql`** (`pg_temp.login` helper as in `member_directory.test.sql`). Fixtures:
  0701 admin (built-in admin role, active), 0702 staff with a role holding `members.manage` (active), 0703 pending
  with an approved application on the same email, 0704 pending without application, 0705 inactive, 0706 probation
  member holding a role with `members.manage`. Assertions:

```sql
-- approval path
update public.applications set status = 'approved' where id = <0703's application>;
select is((select status from public.profiles where id = '…0703'), 'probation'::public.member_status, 'approval starts ön alım');
select isnt((select status_changed_at from public.profiles where id = '…0703'), null, 'approval stamps status_changed_at');
-- staff transitions (as 0702)
select throws_ok($$ select public.set_member_status('…0704', 'active') $$, '42501', null, 'pending cannot become active directly');
select lives_ok($$ select public.set_member_status('…0704', 'probation') $$, 'pending → probation');
select lives_ok($$ select public.set_member_status('…0704', 'active') $$, 'probation → active');
select lives_ok($$ select public.set_member_status('…0705', 'probation') $$, 'inactive → probation');
-- (second inactive fixture or reset) inactive → active still allowed
-- rights stay active-only (as 0706)
select is(private.has_permission('members.manage'), false, 'a probation member has no staff rights');
-- deletion round trip keeps the stamp (as 0706): request, cancel
select is(<status_changed_at after cancel>, <before request>, 'deleting round trip keeps status_changed_at');
select is((select status from public.profiles where id = '…0706'), 'probation'::public.member_status, 'cancel restores probation');
```

  Also: a status change stamps `status_changed_at` (set it to a fixed past value first, change status, assert
  `> past`); `set_member_status` on oneself still `42501`.

- [ ] **Step 2: Run `pnpm db:test`** — expected FAIL (invalid enum value `probation`).

- [ ] **Step 3: Schema.** Add `'probation'` to `member_status` (after `'pending'`), update the status column comment.
  Add `status_changed_at timestamptz` (comment: when the status last changed; moves into/out of `deleting` keep it;
  null = before 2026-11-18). Trigger `private.profiles_stamp_status_change()` (security definer, `before update of
  status`): sets `new.status_changed_at = now()` when `old.status is distinct from new.status` and neither side is
  `'deleting'`. In `set_member_status`: after the existing checks, `if target_status = 'pending' and new_status =
  'active' then raise … errcode '42501'`. In `activate_from_approved_application`: `set status = 'probation'`.
  Generate: `pnpm db:migration probation_status`, review, `pnpm db:reset`.

- [ ] **Step 4: Run `pnpm db:test`** — expected PASS (all files, not only the new one).

- [ ] **Step 5: `pnpm db:types`, compile-only consumers.** Add `probation` to `MEMBER_STATUSES` / `counts`, the
  placeholder `NEXT_STATUS.probation`, `applyView` returns `"alreadyMember"` for `probation` (add a case to
  `apply-view.test.ts` and a `probation` count case to `members-view.test.ts`), the status labels in both message
  files. Run `pnpm test` (PASS), then the full check line from Global Constraints.

- [ ] **Step 6: Commit** — `feat(db): probation status, status_changed_at and activation into ön alım`.

### Task 2: Ön alım rights, staff visibility and the crowd RPC

**Files:**
- Modify: `supabase/schemas/10_profiles.sql` (helper), `12_member_details.sql` (`set_my_birth_date`),
  `14_member_motorcycles.sql` (insert/update/delete policies), `16_member_safety.sql` (contacts insert/update
  policies, `set_my_blood_type`, any other `is_active_member()` own-row check, `member_safety_card` target check),
  `30_member_directory.sql` (`member_directory`, new `club_overview`), `20_applications.sql` (`link_application` line
  ~436, `linkable_accounts` line ~507)
- Create: migration `<generated>_probation_access.sql`, `supabase/tests/database/probation_access.test.sql`
- Modify: `src/lib/supabase/database.types.ts`, `src/lib/members/queries.ts` (`DirectoryMember.probation`,
  widened-row type), `src/lib/applications/review-actions.ts:113,158` (`LinkableAccount.status` keeps
  `"pending" | "active"`: map `probation` to `"active"`, same attach-only behaviour)

**Interfaces:**
- Produces: `private.is_club_member() returns boolean` (granted to `authenticated`, like `is_active_member`);
  `member_directory(...)` returns an extra `probation boolean` column (true only for probation rows, which only
  `members.manage`/`members.safety` callers receive); `public.club_overview() returns table (total integer, asian
  integer, european integer, initials text[])`, `probation` callers only, else `42501`; `DirectoryMember.probation:
  boolean`.

- [ ] **Step 1: Write `probation_access.test.sql`.** Fixtures 0711 probation (has a bike, an emergency contact),
  0712 active full member, 0713 active with a `members.safety` role, 0714 active with a `members.manage` role, 0715
  pending, plus active name fixtures for initials: 0716 `'Ayşe'`, 0717 `'  ali   veli '` (set by postgres after insert,
  bypassing the tidy trigger), 0718 `'irem işık'`, 0719 `''` (empty). Sides: 0712 asian, 0716 european. Assertions:

```sql
-- 0711 (probation) own rows
select lives_ok($$ insert into public.member_motorcycles (profile_id, brand, model) values ('…0711', 'Honda', 'PCX') $$, 'probation adds own bike');
select lives_ok(<insert own emergency contact>, 'probation adds own emergency contact');
select lives_ok($$ select public.set_my_birth_date('1990-01-01') $$, 'probation sets own birth date once');
select lives_ok($$ select public.set_my_blood_type('A+', 'v') $$, 'probation sets own blood type');
-- 0711 can't see others
select is((select count(*) from public.profiles where id <> '…0711' and id::text like '00000000-0000-0000-0000-0000000007%'), 0::bigint, 'probation reads no other profiles');
select throws_ok($$ select * from public.member_directory() $$, '42501', null, 'probation cannot call member_directory');
-- crowd view
select ok((select total >= 5 from public.club_overview()), 'club_overview counts the active fixtures (real rows add more)');
select ok((select 'A' = any(initials) and 'AV' = any(initials) and 'İİ' = any(initials) from public.club_overview()), 'initials: one word, extra spaces, Turkish i');
select ok((select not ('' = any(initials)) from public.club_overview()), 'empty names have no initials');
-- 0715 pending, 0712 active: club_overview → 42501
-- 0712 (full member) can't see 0711
select is((select count(*) from public.profiles where id = '…0711'), 0::bigint, 'full member does not read a probation profile');
select is((select count(*) from public.member_directory() where id = '…0711'), 0::bigint, 'full member directory hides probation');
-- 0713 (members.safety) and 0714 (members.manage) see 0711 flagged
select is((select probation from public.member_directory() where id = '…0711'), true, 'safety holder sees probation flagged');
select is((select probation from public.member_directory() where id = '…0712'), false, 'full members are not flagged');
select lives_ok($$ select * from public.member_safety_card('…0711') $$, 'safety card opens for probation');
-- purge: a deleting account that was probation loses its approved application (status_before_deletion = 'probation' → not kept)
```

  Real-data totals are unknown on production: assert totals only relative to fixtures (e.g. `total` ≥ number of
  active fixtures) and never exact.

- [ ] **Step 2: Run `pnpm db:test`** — expected FAIL (`club_overview` missing etc.).

- [ ] **Step 3: Schema.** `is_club_member()` next to `is_active_member()`. Switch exactly the own-row checks listed
  in Files to `is_club_member()` (leave every check that exposes other members on `is_active_member()`; delete own
  contact stays status-free). `member_directory`: the caller check stays `is_active_member()`; rows are `p.status =
  'active' or (p.status = 'probation' and (members.manage or members.safety))`; return `p.status = 'probation'` as
  `probation`. `member_safety_card`: target `status in ('active', 'probation')`. `link_application` /
  `linkable_accounts`: wherever `active` may receive an approved application, `probation` may too. `club_overview()`
  (plpgsql, `stable`, security definer, `set search_path = ''`): `42501` unless the caller's status is `probation`;
  initials via `regexp_split_to_array(btrim(full_name), '\s+')`, first and last element's first letter, upper-cased
  with `upper(... collate "tr-x-icu")` (check `upper('i' collate "tr-x-icu") = 'İ'` in a scratch query first; record
  the result in `docs/learnings/supabase.md`), order `random()`, nulls/empties dropped. Grants: revoke from public,
  anon; execute to authenticated. Generate `pnpm db:migration probation_access`, review, `pnpm db:reset`.

- [ ] **Step 4: Run `pnpm db:test`** — expected PASS.

- [ ] **Step 5: `pnpm db:types` + consumers** (`DirectoryMember.probation`, linkable status mapping), full check line.

- [ ] **Step 6: Commit** — `feat(db): ön alım rights, staff-only visibility and club_overview`.

### Task 3: `member_notes` and the `members.notes` permission

**Files:**
- Modify: `supabase/schemas/05_roles.sql` (enum value `'members.notes'` with a comment)
- Create: `supabase/schemas/18_member_notes.sql`
- Create: migration `<generated>_member_notes*.sql`, `supabase/tests/database/member_notes.test.sql`
- Modify: `src/lib/supabase/database.types.ts`, `messages/{tr,en}.json` (`Admin.permissions.members.notes` and
  whatever sibling keys the role editor reads; TR "Üye notlarını görme ve yazma")

**Interfaces:**
- Produces: table `public.member_notes (id uuid pk default gen_random_uuid(), profile_id uuid not null → profiles on
  delete cascade, author_id uuid → profiles on delete set null, body text not null check (char_length(body) between 1
  and 2000 and body = btrim(body)), created_at timestamptz not null default now())`, index `(profile_id, created_at
  desc, id desc)`. Grants: `select`, `insert (profile_id, body)`, `delete` to authenticated; RLS policies as below.
  `author_id` is forced by a before-insert security-definer trigger to `auth.uid()`.

- [ ] **Step 1: Write `member_notes.test.sql`.** Fixtures 0721 admin A, 0722 admin B, 0723 notes holder (role with
  `members.notes`), 0724 active member without the permission, 0725 subject member (active), 0726 subject in
  `deleting`, 0727 probation member holding a role with `members.notes`. Assertions (as the named caller):

```sql
-- 0723 notes holder
select lives_ok($$ insert into public.member_notes (profile_id, body) values ('…0725', 'Buluşmaya geç kaldı.') $$, 'holder adds a note');
select is((select author_id from public.member_notes where profile_id = '…0725'), '…0723'::uuid, 'author forced to caller');
select throws_ok($$ insert into public.member_notes (profile_id, body, author_id) values ('…0725', 'x', '…0721') $$, '42501', null, 'author_id not writable');
select is((select count(*) from public.member_notes where profile_id = '…0725'), 1::bigint, 'holder reads notes');
select throws_ok($$ update public.member_notes set body = 'y' where profile_id = '…0725' $$, '42501', null, 'nobody updates a note (no update grant)');
select throws_ok(<insert about 0726 deleting>, '42501', null, 'cannot note a deleting account');
select is_empty($$ delete from public.member_notes where profile_id = '…0725' returning 1 $$, 'non-admin cannot delete');
select throws_ok(<insert about admin 0721>, '42501', null, 'non-admin cannot note an admin');
select is((select count(*) from public.member_notes where profile_id = '…0721'), 0::bigint, 'non-admin cannot read notes about an admin');
select is(<count of notes about 0726, planted by postgres>, 0::bigint, 'notes about a deleting account are hidden');
select throws_ok($$ insert into public.member_notes (profile_id, body) values ('…0725', '  ') $$, '23514', null, 'blank body refused');
-- 0724 (no permission), 0727 (probation with the role), anon: read 0 rows, insert 42501
-- 0725 subject: reads 0 notes about themselves
-- 0721 admin A: reads/adds notes about admin B (0722); cannot read notes about 0721; cannot delete a note about 0721
--   (planted by 0722); can delete the note about 0725
```

- [ ] **Step 2: Run `pnpm db:test`** — expected FAIL.

- [ ] **Step 3: Schema** in `18_member_notes.sql` (RLS on, `revoke all … from anon, authenticated`, grants above).
  A security-definer helper `private.can_access_member_notes(target uuid) returns boolean`: caller has
  `members.notes`, `target <> auth.uid()`, target exists and isn't `deleting`, and (target isn't an active admin or
  `private.is_admin()`). Select/insert policies use it; delete policy: `private.is_admin() and
  private.can_access_member_notes(profile_id)`. Author trigger as in Interfaces. Generate `pnpm db:migration
  member_notes`, review, `pnpm db:reset`.

- [ ] **Step 4: Run `pnpm db:test`** — expected PASS.

- [ ] **Step 5: `pnpm db:types`, permission label messages** (the role editor iterates `PERMISSIONS`; confirm its
  message lookup compiles), full check line.

- [ ] **Step 6: Commit** — `feat(db): member notes with the members.notes permission`.

### Task 4: `/admin/members`: Ön alım tab, status buttons, duration, approve copy

**Files:**
- Create: `src/lib/access/status-actions.ts` + `status-actions.test.ts`
- Modify: `src/components/admin/member-row.tsx`, `src/components/admin/members-list.tsx` (tab order from
  `MEMBER_STATUSES`), `src/lib/access/queries.ts` (`AdminProfile.status_changed_at`), `src/app/[locale]/admin/members/
  page.tsx` (row `probationDays`), `messages/{tr,en}.json` (`Admin.members.*`, approve dialog texts
  `approveBody*` that say "aktif üye olur" → start ön alım)

**Interfaces:**
- Consumes: `StaffStatus` with `probation` (Task 1), `profiles.status_changed_at`.
- Produces: `statusActions(status: StaffStatus): { status: StaffStatus; label: "toProbation" | "promote" |
  "deactivate"; primary: boolean }[]`; `MemberRowData.probationDays?: number | null`.

- [ ] **Step 1: Write `status-actions.test.ts`:**

```ts
assert.deepEqual(statusActions("pending").map((a) => a.status), ["probation"]);
assert.deepEqual(statusActions("probation").map((a) => a.status), ["active", "inactive"]);
assert.deepEqual(statusActions("active").map((a) => a.status), ["inactive"]);
assert.deepEqual(statusActions("inactive").map((a) => a.status), ["probation", "active"]);
assert.ok(statusActions("pending").every((a) => a.status !== "active")); // never pending → active
```

- [ ] **Step 2: Run `pnpm test`** — expected FAIL (module missing).

- [ ] **Step 3: Implement** `statusActions`, replace `NEXT_STATUS` in `member-row.tsx` with it (one button per
  action; `primary` → default variant, else outline), drop the now-dead `activate`/`reactivate` message keys if
  nothing else uses them. Row badge "Ön alım · {days} gün" (ICU plural; EN "Probation · {days, plural, one {# day}
  other {# days}}") from `status_changed_at` (days = floor of elapsed days in Europe/Istanbul; no duration when
  null). Copy (TR): `toProbation` "Ön alıma al", `promote` "Tam üye yap", tab "Ön alım". Badge colour: an existing
  design token (e.g. `sun`), no new token.

- [ ] **Step 4: Run `pnpm test`** — PASS; full check line; look at `/admin/members` at 390px and 1280px in the dev
  server as the admin (all four tabs, buttons per tab).

- [ ] **Step 5: Commit** — `feat(admin): ön alım tab and status actions on the members list`.

### Task 5: Notes dialog on `/admin/members`

**Files:**
- Create: `src/lib/members/notes.ts` (Zod schema + server actions), `src/lib/members/notes-schema.test.ts`,
  `src/components/admin/member-notes-dialog.tsx`
- Modify: `src/lib/access/queries.ts` (`noteCounts()`), `src/app/[locale]/admin/members/page.tsx`,
  `src/components/admin/member-row.tsx`, `messages/{tr,en}.json` (`Admin.notes.*`)

**Interfaces:**
- Consumes: `member_notes` (Task 3), `can(access, "members.notes")`.
- Produces: `noteBodySchema` (Zod: trim, min 1, max 2000); server actions `listMemberNotes(profileId: string):
  Promise<{ status: "ok"; notes: MemberNote[] } | { status: "forbidden" | "error" }>`, `addMemberNote(profileId:
  string, formData: FormData): Promise<AccessActionResult>`, `deleteMemberNote(noteId: string):
  Promise<AccessActionResult>`; `type MemberNote = { id: string; body: string; createdAt: string; authorName: string
  | null }`; `noteCounts(): Promise<Map<string, number>>` (reads `member_notes(profile_id)` with `readAll`, counts in
  JS); `MemberRowData.notes?: { count: number } | null` (null = button hidden).

- [ ] **Step 1: Write `notes-schema.test.ts`:** `"  Geç kaldı.  "` parses to `"Geç kaldı."`; `""`, `"   "` fail;
  2,000 characters pass, 2,001 fail; Turkish characters kept.

- [ ] **Step 2: Run `pnpm test`** — FAIL.

- [ ] **Step 3: Implement.** Actions validate ids with `z.uuid()` and the body with `noteBodySchema`
  (`formDataText`), map errors like `src/lib/access/actions.ts` (`42501` → forbidden, `23514` → invalid), call
  `refresh()` after add/delete. `listMemberNotes` reads notes newest first with `readAll`, author name via the
  `author_id` → `profiles(full_name)` join (null → "Silinmiş hesap" in the UI). The page passes `notes: { count }`
  only when the viewer has `members.notes` and the row is not the viewer and (viewer is admin or the row isn't an
  admin). Dialog (shadcn `Dialog`, own close labels, no defaults): list (author, `format.dateTime` medium date +
  short time, Europe/Istanbul), textarea with hint "Kişi verilerini isterse notlar kendisine gösterilebilir; olguları
  yaz.", "Not ekle", admin-only delete with a confirm step. Loads on open (pending state while loading).

- [ ] **Step 4: Run `pnpm test`** — PASS; full check line; try the dialog in the dev server as admin and as a
  notes holder (admin rows without the button).

- [ ] **Step 5: Commit** — `feat(admin): staff notes dialog on the members list`.

### Task 6: The ön alım member's app: crowd view, account card, directory badge

**Files:**
- Create: `src/components/members/club-overview.tsx`, `src/components/account/probation-card.tsx`
- Modify: `src/lib/members/queries.ts` (`loadClubOverview()`), `src/app/[locale]/members/page.tsx`,
  `src/app/[locale]/account/page.tsx`, `src/components/members/member-card.tsx` (badge when `probation`),
  `src/components/auth/user-menu.tsx:44`, `messages/{tr,en}.json` (`Members.club*`, `Account.probation*`,
  `Members.probationBadge`)

**Interfaces:**
- Consumes: `club_overview` (Task 2), `DirectoryMember.probation`.
- Produces: `loadClubOverview(): Promise<{ total: number; asian: number; european: number; initials: string[] }>`.

- [ ] **Step 1: Implement `/members` for `probation`:** before the `status !== "active"` branch, a probation user
  gets `<ClubOverview …/>` + `<InstallBanner />`. Copy: "Kulüpte {total} üye var · Anadolu {asian} · Avrupa
  {european}", grid of initials (avatar-sized circles, `aria-hidden`, one `sr-only` sentence with the total), line
  "Üye listesi tam üyeliğe geçince açılır." No skeleton change (status is request-time; the directory skeleton stays,
  spec §5).
- [ ] **Step 2: `/account` for `probation`:** same sections as `active` (`myProfile` loaded, emergency prompt, install
  banner, delete card) plus `<ProbationCard />` at the top: "Ön alım dönemindesin" + "Kulüp seni tanıyor; birkaç gün
  içinde tam üyeliğe geçersin ve üye listesi açılır." (no date promised; refine wording, TR native). Status badge
  "Ön alım". Every `status === "active"` check on the page that means "has a member profile" becomes `active ||
  probation`. User menu install entry also for `probation`.
- [ ] **Step 3: Directory badge:** `MemberCard` shows "Ön alım" for `probation` rows (staff only receive them).
- [ ] **Step 4: Full check line**; dev server as an ön alım fixture (`/members`, `/account`, `/apply`, nav without
  "Başvur") and as a safety holder (badge).
- [ ] **Step 5: Commit** — `feat: crowd view and account card for ön alım members`.

### Task 7: Privacy notice and docs

**Files:**
- Modify: `src/app/[locale]/privacy/content-tr.tsx`, `content-en.tsx`, `src/lib/applications/options.ts`
  (`PRIVACY_NOTICE_VERSION` → `"2026-11-18-draft-8"`), `docs/PLAN.md`, `CLAUDE.md`, `docs/follow-ups.md`,
  `docs/learnings/supabase.md` (if Task 2 recorded nothing yet)

- [ ] **Step 1: Notice ("siz")**: a paragraph on the ön alım period (after approval; other members' data not shown;
  your data shown only to the club team) and on staff notes (club team members with the matching role may record
  factual notes on participation and conduct; you can request them under art. 11; deleted with the account); the
  directory paragraph mentions full members' initials shown to ön alım members; legal basis meşru menfaat
  (m.5/2-f). Bump the version.
- [ ] **Step 2: Docs:** `PLAN.md` (Who sees what, MVP list: step 2b notes part done, ön alım decided, intended roles:
  Üye Sorumlusu gets `members.notes`), `CLAUDE.md` (status list incl. `probation`, `is_club_member` rule: own-row
  writes only, new permission), `follow-ups.md` (remove the "Ön alım" open decision; add: Events "full members only"
  ride flag; notes on the application page; automatic reminder for long ön alım; anything deferred in reviews).
- [ ] **Step 3: Commit** — `docs: ön alım and staff notes in the notice, plan and project notes`.

### Task 8: Browser E2E and final verification

**Files:**
- Create: `scripts/e2e/probation-e2e.mjs`; Modify: `scripts/e2e/README.md` (fixture `probation@test.local`, recipe)

- [ ] **Step 1: Write the E2E** (style of `members-e2e.mjs`, PASS/FAIL lines, exit code): as `probation@test.local`:
  `/members` shows the overview with the fixture count and **no fixture full name** in `page.content()` nor in the
  RSC text (fetch the page with `RSC: 1`); `/account` shows the probation card and the profile sections; `/apply`
  shows "already a member"; no "Başvur" in the nav. As `admin@test.local`: "Ön alım" tab lists the fixture with "Ön
  alım · N gün"; notes dialog adds a note and shows it with the author; "Tam üye yap" moves the fixture to "Aktif"
  (then reset it by SQL to `probation`). 390px and 1280px.
- [ ] **Step 2: Run** against `pnpm build && pnpm start -p 3123` with email sign-in on: PASS. Also run
  `members-e2e`, `safety-e2e`, `apply-nav-e2e` (they touch the changed pages) and `skeletons.mjs` for `/members` and
  `/account`.
- [ ] **Step 3: Full verification:** `pnpm format:check`, `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test`,
  `pnpm db:test`, `pnpm build`; delete test rows as in CLAUDE.md.
- [ ] **Step 4: Commit** — `test(e2e): ön alım and staff notes`.

Rollout (after iltan's review and merge, not part of the tasks): `pnpm db:push` (backup, dry-run, push, pgTAP), push
`main` right after (the approval path writes `probation` at once), `has_function_privilege` checks for
`is_club_member`, `club_overview`, `can_access_member_notes`; tell iltan to tick `members.notes` on the Üye Sorumlusu
role.
