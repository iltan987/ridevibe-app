# Self-service account deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anyone signed in can delete their account from `/account`: hidden and rightless at once, restorable by
signing in within 14 days, then deleted by a nightly `pg_cron` job (applications too, with the rejected / inactive
exceptions).

**Architecture:** A new `member_status` value `deleting` (+ `deletion_requested_at`, `status_before_deletion`) makes
every existing "active only" rule switch off; staff read paths get an explicit `status <> 'deleting'`. Two
self-service RPCs request/cancel; `private.purge_deleted_accounts(as_of)` runs daily via `pg_cron` and deletes from
`auth.users` (existing cascades do the rest). Kept applications of inactive accounts carry `retained_until`, which
every email-matching path skips.

**Tech Stack:** Supabase Postgres 17 (declarative schemas, RLS, pgTAP, pg_cron 1.6.4), Next.js 16 App Router (Server
Actions, Cache Components), next-intl 4, shadcn/ui on Base UI, puppeteer E2E.

**Spec:** `docs/superpowers/specs/2026-11-14-account-deletion-design.md` (approved 2026-11-14). Read it first; this
plan argues from it.

## Global Constraints

- Branch `feat/account-deletion`; Conventional Commits; author iltan; **no `Co-Authored-By` or other trailer**; stage
  by path, never `git add -A` / `commit -a`; never stage `.claude/settings.json`; never `git checkout -- .`,
  `restore .`, `reset --hard`, `stash`, `clean`.
- Before every code commit: `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm build`; DB tasks also
  `pnpm db:reset && pnpm db:test`. A task that changes a generated type (`pnpm db:types`) updates its consumers in
  the same commit.
- Schema workflow (CLAUDE.md "Database"): edit `supabase/schemas/*.sql` → `pnpm db:migration <name>` → review the
  generated file (security lines, DROP order) → `pnpm db:reset` → `pnpm db:test` → `pnpm db:types`. Enum `ADD VALUE`
  is split into `_1`/`_2` migrations automatically. DML (cron schedule) = hand-written migration.
- New RPCs: `security definer`, `set search_path = ''`, fully qualified names, `revoke all … from public, anon`,
  `grant execute … to authenticated`; private functions revoked from `public, anon, authenticated`. No new overloads
  left behind (`pg_proc` one row).
- pgTAP: fixtures only (`@pgtap.invalid` emails, ids `00000000-0000-0000-0000-0000000007xx` — unused range), every
  assertion scoped to fixture ids; tests also run against production. Login helper as in
  `supabase/tests/database/birth_date_once.test.sql` (`pg_temp.login(uid)`).
- Values from the spec: grace **14 days**; inactive retention **1 year from `deletion_requested_at`**; job
  `purge-deleted-accounts` at `0 2 * * *` (UTC = 05:00 Istanbul); prune `cron.job_run_details` older than **30 days**.
- Error contract (SQL → action): already deleting / cancel when not deleting → `55000`; last admin → `42501` with
  `hint = 'last_admin'`; staff RPC on a deleting target or `new_status = 'deleting'` → `42501`.
- UI copy: Turkish "sen", privacy notice "siz"; no hard-coded strings; tr/en parity (`src/app/messages-parity.test.ts`);
  copy below is final unless it reads unnatural (then offer iltan 2–3 options). Links/redirects from
  `@/i18n/navigation` (stored full paths → `next/navigation`). Mobile-first (390px).
- KVKK: never log personal data (log error codes only).

## Review Focus

1. **Two admins deleting at the same time** (each the other's "other admin") → the second must fail; Task 2 locks all
   active admin rows before counting and tests the serial case.
2. **Double click on "Hesabımı sil"** → one request, no "already deleting" error shown; Task 6 disables the button
   while pending and maps `55000` on request to the done state.
3. **Signing in during the grace period with `next=/members` (or `/en/...`)** → lands on the recovery card in the
   right language; Task 6 callback redirect + E2E.
4. **Restore racing the nightly job** → a restored account must never be deleted; Task 5 purges set-based with
   `status = 'deleting'` re-checked in the same statement (no read-then-delete across statements) and tests cancel →
   purge leaves it.
5. **A returning suspended member signing in with the same Google email** → stays pending, `/apply` does not claim
   "approved", staff see the badge; Task 4 pgTAP + Task 7 UI.

---

### Task 1: `deleting` status, columns and type consumers

**Files:**
- Modify: `supabase/schemas/10_profiles.sql`, `supabase/schemas/20_applications.sql`
- Create (generated): `supabase/migrations/*_account_deletion_status_1.sql`, `*_2.sql`
- Modify: `src/lib/supabase/database.types.ts` (generated), `src/lib/access/members-view.ts`,
  `src/lib/access/queries.ts`, `src/components/admin/member-row.tsx`, `src/components/admin/members-list.tsx`,
  `src/lib/applications/apply-view.ts`, `messages/tr.json`, `messages/en.json`
- Test: `supabase/tests/database/account_deletion.test.sql` (new), `src/lib/applications/apply-view.test.ts`

**Interfaces:**
- Produces: enum `public.member_status` = `pending | active | inactive | deleting`;
  `profiles.deletion_requested_at timestamptz null`, `profiles.status_before_deletion public.member_status null`,
  check `profiles_deletion_state` = `(status = 'deleting') = (deletion_requested_at is not null) and (status =
  'deleting') = (status_before_deletion is not null) and status_before_deletion is distinct from 'deleting'`;
  `applications.retained_until timestamptz null`. No column grants on any of the three.
- Produces (TS): `StaffStatus = Exclude<MemberStatus, "deleting">`, `MEMBER_STATUSES: readonly StaffStatus[]`;
  `ApplyView` gains `"deleting"`.

- [ ] **Step 1: Failing pgTAP** in `account_deletion.test.sql` (plan grows in later tasks): `has_column` for the three
  columns; `enum_has_labels('public','member_status', array['pending','active','inactive','deleting'])`; as postgres,
  `throws_ok` setting a fixture profile to `deleting` without the two columns (`23514`); `lives_ok` with both set;
  `ok(not has_column_privilege('authenticated','public.profiles','deletion_requested_at','update'))`.
- [ ] **Step 2:** `pnpm db:reset && pnpm db:test` → FAIL (columns missing).
- [ ] **Step 3: Schema.** Add the enum value, columns, check constraint (10_profiles), `retained_until` with a column
  comment (20_applications); update the `profiles.status` comment ("deleting = asked to delete the account; hidden,
  no rights, purged after 14 days"). `pnpm db:migration account_deletion_status`, review both files.
- [ ] **Step 4:** `pnpm db:reset && pnpm db:test` → PASS. `pnpm db:types`.
- [ ] **Step 5: Type consumers.** `members-view.ts`: `StaffStatus`, `MEMBER_STATUSES` typed with it, `counts:
  Record<StaffStatus, number>`; `listAllProfiles` adds `.neq("status", "deleting")` (RLS hides them from staff in
  Task 3; this keeps the type honest) and narrows `status` to `StaffStatus`; `member-row.tsx` / `members-list.tsx` use
  `StaffStatus`. `applyView`: `if (profileStatus === "deleting") return "deleting";` before the other cases; test in
  `apply-view.test.ts`: `applyView("deleting", null) === "deleting"` and `applyView("deleting", "approved") ===
  "deleting"`. Messages: `Account.statuses.deleting` = "Silinecek" / "To be deleted"; `Apply.deleting.title` =
  "Hesabın silinecek" / "Your account will be deleted", `Apply.deleting.body` = "Geri almak istersen Hesabım
  sayfasını aç." / "To keep it, open your account page." (`apply-gate.tsx` renders `<Notice kind={view} />`
  generically — check it needs nothing else).
- [ ] **Step 6:** lint, tsc, test, build → PASS. Commit `feat(db): deleting status and deletion columns`.

### Task 2: Request and cancel RPCs

**Files:**
- Modify: `supabase/schemas/10_profiles.sql`; generated migration `*_account_deletion_rpcs.sql`;
  `src/lib/supabase/database.types.ts`
- Test: `supabase/tests/database/account_deletion.test.sql`

**Interfaces:**
- Produces: `public.request_my_account_deletion() returns timestamptz` (= `deletion_requested_at + interval '14 days'`);
  `public.cancel_my_account_deletion() returns void`. Error contract from Global Constraints.

- [ ] **Step 1: Failing pgTAP.** Fixtures 7a1 active member, 7a2 pending, 7a3 inactive, 7a4 + 7a5 active admins
  (built-in admin role), 7a6 active member with a custom role. Assertions:
  - anon: no execute on either (`has_function_privilege`) and `throws_ok … '42501'`.
  - 7a1, 7a2, 7a3 each: request lives; then status `deleting`, `status_before_deletion` = old status,
    `deletion_requested_at` ≈ `now()`; return value = `deletion_requested_at + 14 days`.
  - second request by 7a1 → `55000`.
  - 7a6: role_id unchanged after request; `private.has_permission(...)` and `private.is_active_member()` false.
  - cancel by 7a1/7a2/7a3 restores `active`/`pending`/`inactive`, both columns null; 7a6 role works again.
  - cancel when not deleting → `55000`.
  - admins: 7a4 request lives (7a5 still active); 7a5 request → `42501` (only active admin left); hint checked with
    `throws_matching`/a `do` block reading `PG_EXCEPTION_HINT` = `last_admin`.
- [ ] **Step 2:** `pnpm db:test` → FAIL.
- [ ] **Step 3: Implement** both in 10_profiles.sql (self-service pattern: no target id, `where id = (select
  auth.uid())`, `for update`). Request: lock own row; `55000` if already deleting; if caller is an active admin, lock
  all active admin profile rows (`select … from profiles p join roles r … where r.is_admin and p.status = 'active'
  for update`) then require another one; set the three columns; return the date. Cancel: lock own row, `55000`
  unless deleting, restore.
- [ ] **Step 4:** `pnpm db:migration account_deletion_rpcs`, review, `pnpm db:reset && pnpm db:test` → PASS,
  `pnpm db:types`.
- [ ] **Step 5:** lint, tsc, test, build → PASS. Commit `feat(db): request and cancel own account deletion`.

### Task 3: Hide deleting accounts from staff

**Files:**
- Modify: `supabase/schemas/10_profiles.sql`, `12_member_details.sql`, `14_member_motorcycles.sql`,
  `20_applications.sql`; generated migration `*_account_deletion_hiding.sql`
- Test: `supabase/tests/database/account_deletion.test.sql`

**Interfaces:**
- Produces: `private.application_hidden_for_deletion(app_profile_id uuid, app_email text, app_status
  public.application_status) returns boolean` (security definer, stable): true when `app_status <> 'rejected'` and
  (the linked profile is `deleting`, or `app_profile_id is null` and a `deleting` profile's `member_contacts` email
  equals `private.normalize_email(app_email)`).

- [ ] **Step 1: Failing pgTAP.** Fixtures 7b1 deleting member (previously active, with details, bike, contact row),
  7b2 active member, 7b3 active `members.manage` + `applications.view` + `applications.decide` staff (custom role),
  7b4 active admin; applications: linked approved (7b1), linked rejected (7b1), unlinked `new` with 7b1's email.
  As 7b2: 0 rows of 7b1 in `profiles`, `member_directory()`. As 7b3: 0 rows of 7b1 in `profiles`, `member_contacts`,
  `member_details`, `member_motorcycles`; the linked approved and unlinked `new` applications invisible, the
  **rejected one visible**; `update applications set notes = … where id = <hidden>` affects 0 rows. As 7b1: own
  `profiles` row readable. As 7b4: `set_member_status(7b1, 'active')`, `set_member_role(7b1, …)`,
  `set_member_name(7b1, …)` → `42501`; `set_member_status(7b2, 'deleting')` → `42501`;
  `link_application(<unlinked app>, 7b1)` → `P0002`; `member_safety_card(7b1)` → `P0002` (already, pin it).
  Approving the unlinked `new` application as postgres does not change 7b1's status.
- [ ] **Step 2:** `pnpm db:test` → FAIL.
- [ ] **Step 3: Implement.** `members.manage` read branches become `((select private.has_permission('members.manage'))
  and <target profile> is not deleting)`: profiles (`status <> 'deleting'`), member_contacts / member_details /
  member_motorcycles (`exists` on profiles with `status <> 'deleting'` — postgres-owned subquery is fine inside the
  policy because profiles RLS already lets `members.manage` read non-deleting rows). Applications select and update
  policies add `and not private.application_hidden_for_deletion(profile_id, email, status)`. Staff RPCs: refuse a
  `deleting` target (`42501`); `set_member_status` also refuses `new_status = 'deleting'`.
- [ ] **Step 4:** `pnpm db:migration account_deletion_hiding`, review, reset, test → PASS.
- [ ] **Step 5:** lint, tsc, test, build → PASS. Commit `feat(db): hide accounts being deleted from staff`.

### Task 4: Kept applications (`retained_until`) and the former-member flag

**Files:**
- Modify: `supabase/schemas/20_applications.sql`; generated migration `*_retained_applications.sql`;
  `src/lib/supabase/database.types.ts`, `src/lib/access/queries.ts`, `src/app/[locale]/admin/members/page.tsx`
- Test: `supabase/tests/database/account_deletion_retained.test.sql` (new)

**Interfaces:**
- Produces: `public.pending_application_flags(profile_ids uuid[]) returns table (profile_id uuid, has_application
  boolean, former_member boolean)` (drop + recreate; one row in `pg_proc`);
  `getPendingApplicationFlags(ids): Promise<Map<string, { applied: boolean; formerMember: boolean }>>`.

- [ ] **Step 1: Failing pgTAP.** Fixtures: unlinked approved application 7c1 with `retained_until = now() + 1 year`
  and email `pgtap-del-kept@pgtap.invalid` (set as postgres); then sign-up of auth user 7c2 with that email.
  Assertions: 7c2 stays `pending` (sign-up trigger skipped it), application still unlinked; as 7c2
  `my_application_status()` is null; as a `members.manage` staff 7c3: `pending_application_flags(array[7c2])` →
  `has_application = false, former_member = true`; as an `applications.decide` staff: `link_application(7c1, 7c2)` →
  `P0002`; `linkable_accounts(...)` still lists 7c2 (kept rows don't block it). The normal approved-email path is
  unaffected (existing `approval.test.sql` keeps passing). `pg_proc` has one
  `pending_application_flags`.
- [ ] **Step 2:** `pnpm db:test` → FAIL.
- [ ] **Step 3: Implement** `retained_until is null` in every email/profile match of
  `activate_from_approved_application`, `link_application` (the application lookup and both `exists` checks),
  `linkable_accounts`, `my_application_status`, `pending_application_flags.has_application`; add `former_member`
  (pending account's sign-in email matches an application with `retained_until is not null`).
- [ ] **Step 4:** migration, review (drop/recreate of the RPC), reset, test → PASS, `pnpm db:types`.
- [ ] **Step 5: Consumers.** `getPendingApplicationFlags` returns the object map; admin members page sets
  `applied: flags.get(p.id)?.applied ?? false` and passes `formerMember` on rows (rendered in Task 7; add the field to
  the row type now, default false).
- [ ] **Step 6:** lint, tsc, test, build → PASS. Commit `feat(db): keep applications of deleted inactive accounts
  unmatched`.

### Task 5: Nightly purge

**Files:**
- Modify: `supabase/schemas/90_ops.sql` (function; `create extension if not exists pg_cron` here if the declarative
  diff emits it, else in the hand-written migration); generated migration `*_purge_deleted_accounts.sql`
- Create: hand-written `supabase/migrations/<timestamp>_schedule_purge_deleted_accounts.sql`
- Test: `supabase/tests/database/account_deletion_purge.test.sql` (new)

**Interfaces:**
- Produces: `private.purge_deleted_accounts(as_of timestamptz default now()) returns void` (security definer, no
  grants); cron job `purge-deleted-accounts`.

- [ ] **Step 1: Failing pgTAP.** Fixtures (requested_at set as postgres): 7d1 deleting since `now() - 14 days`,
  was active, with linked approved + linked rejected + unlinked `contacted` (same email) applications, details, bike,
  emergency contact, blood type; 7d2 deleting since `now() - 13 days`; 7d3 deleting since `now() - 14 days`, was
  inactive, linked approved application; 7d4 active; an unlinked kept application with `retained_until = now() -
  1 second` and one with `now() + 1 day`. Run `select private.purge_deleted_accounts()`. Assert: 7d1 gone from
  `auth.users` and `profiles`, its approved and contacted applications gone, rejected one kept with `profile_id` null,
  its member rows gone; 7d2 untouched; 7d3 gone, its approved application kept, unlinked, `retained_until =
  deletion_requested_at + 1 year`; 7d4 untouched; expired kept application gone, future one kept. Then 7d2 cancel (as
  7d2) and `purge_deleted_accounts(now() + interval '2 days')` → 7d2 still there. `cron.job` has `jobname =
  'purge-deleted-accounts'`, `schedule = '0 2 * * *'`. `has_function_privilege('authenticated',
  'private.purge_deleted_accounts(timestamptz)', 'execute')` false.
- [ ] **Step 2:** `pnpm db:test` → FAIL.
- [ ] **Step 3: Implement** set-based, each statement re-checking `p.status = 'deleting' and p.deletion_requested_at
  <= as_of - interval '14 days'`: (a) inactive accounts' approved applications → `retained_until`, `profile_id =
  null`; (b) delete their other non-rejected applications (linked or unlinked by normalized sign-in email, `retained_until is null`);
  (c) `delete from auth.users` for those profiles; (d) delete applications with `retained_until <= as_of`;
  (e) `delete from cron.job_run_details where end_time < as_of - interval '30 days'`.
- [ ] **Step 4:** generated migration (`pnpm db:migration purge_deleted_accounts`), then the hand-written schedule
  migration: `create extension if not exists pg_cron;` (if not generated), unschedule `purge-deleted-accounts` if it
  exists, `cron.schedule('purge-deleted-accounts', '0 2 * * *', 'select private.purge_deleted_accounts()')`.
  `pnpm db:reset && pnpm db:test` → PASS. Check the local job: `docker exec -i supabase_db_ridevibe psql -U postgres
  -c "select jobname, schedule from cron.job"`.
- [ ] **Step 5:** lint, tsc, test, build → PASS. Commit `feat(db): nightly purge of deleted accounts`.

### Task 6: Delete and restore in the app

**Files:**
- Create: `src/lib/account/deletion-actions.ts`, `src/lib/account/deletion-result.ts`,
  `src/lib/account/deletion-result.test.ts`, `src/components/account/delete-account-card.tsx`,
  `src/components/account/recovery-card.tsx`
- Modify: `src/lib/auth/user.ts` (select `deletion_requested_at`), `src/app/[locale]/account/page.tsx`,
  `src/app/auth/callback/route.ts`, `messages/tr.json`, `messages/en.json`

**Interfaces:**
- Consumes: the two RPCs (Task 2); existing `signOut()` in `src/lib/auth/actions.ts`.
- Produces: `deletionResult(error: { code?: string; hint?: string } | null): "ok" | "alreadyDeleting" | "lastAdmin" |
  "error"`; `requestAccountDeletion(): Promise<{ status: "ok"; deletesOn: string } | { status: "lastAdmin" | "error"
  }>` (ISO date); `cancelAccountDeletion(): Promise<{ status: "ok" | "error" }>`.

- [ ] **Step 1: Failing unit test** `deletion-result.test.ts`: `null → "ok"`; `{code:"55000"} → "alreadyDeleting"`;
  `{code:"42501", hint:"last_admin"} → "lastAdmin"`; `{code:"42501"} → "error"`; `{code:"PGRST301"} → "error"`.
- [ ] **Step 2:** `pnpm test` → FAIL; implement `deletion-result.ts` (relative `.ts` imports only); → PASS.
- [ ] **Step 3: Actions** (`"use server"`): `requestAccountDeletion` calls the RPC; on `alreadyDeleting` reads its
  own `deletion_requested_at` and treats it as ok (double click); on ok calls `supabase.auth.signOut({ scope:
  "global" })` (every device; default per auth-js docs, pass it explicitly) and returns `deletesOn` — **no
  `refresh()`** (it would replace the done state; same exception as `submitApplication`, comment it).
  `cancelAccountDeletion` calls the RPC then `refresh()`. Log only error codes.
- [ ] **Step 4: UI.** `DeleteAccountCard` (client): card at the very bottom of `/account` for pending/active/inactive;
  "Hesabımı sil" opens the existing `src/components/ui/alert-dialog.tsx` (destructive confirmation) with the texts
  below (the inactive line only when `status === "inactive"`), destructive confirm disabled while pending; on ok the
  dialog switches to the done state; its button does `router.replace("/")` (`@/i18n/navigation`). `RecoveryCard`
  (client): shown **instead of everything else** on `/account` when status is `deleting`; Restore →
  `cancelAccountDeletion`; "Silmeye devam et" → existing `signOut` form action. Date shown with next-intl
  `format.dateTime(date, { dateStyle: "long" })` (Istanbul time zone is global). Recovery date =
  `deletion_requested_at + 14 days` (helper in `deletion-result.ts`: `deletionDate(requestedAt: string): Date`, add a
  unit test: `deletionDate("2026-11-14T10:00:00Z")` = `2026-11-28T10:00:00Z`).
- [ ] **Step 5: Callback.** In `auth/callback/route.ts`, after a successful exchange read the user's profile status;
  if `deleting`, redirect to `/en/account` when `next` starts with `/en/` or equals `/en`, else `/account`.
- [ ] **Step 6: Messages** (`Account.delete.*`, `Account.recovery.*`), tr / en:
  - `delete.title`: "Hesabı sil" / "Delete account"
  - `delete.body`: "Hesabını ve bu uygulamadaki bilgilerini silebilirsin." / "You can delete your account and your
    data in this app."
  - `delete.open`, `delete.confirm`: "Hesabımı sil" / "Delete my account"; `delete.cancel`: "Vazgeç" / "Cancel"
  - `delete.dialogTitle`: "Hesabın silinsin mi?" / "Delete your account?"
  - `delete.removed`: "Silinecekler: profilin, iletişim bilgilerin, motosikletlerin, acil durum kişilerin, kan
    grubun, tercihlerin ve başvurun." / "What gets deleted: your profile, contact details, motorcycles, emergency
    contacts, blood type, preferences and application."
  - `delete.kept`: "Kalanlar: reddedilmiş bir başvurun varsa 6 ay dolana kadar saklanır; seni tanıtmayan erişim
    kayıtları kalır." / "What stays: a rejected application is kept until its 6 months are up; access records that
    don't identify you remain."
  - `delete.keptInactive`: "Üyeliğin sona erdiği için başvurun silme talebinden itibaren 1 yıl saklanır." / "Because
    your membership has ended, your application is kept for 1 year from this request."
  - `delete.grace`: "14 gün içinde tekrar giriş yaparsan hesabını geri alabilirsin; sonra kalıcı olarak silinir." /
    "Sign in again within 14 days to get your account back; after that it's deleted for good."
  - `delete.club`: "Kulüp üyeliğin ve WhatsApp grupları bundan etkilenmez." / "Your club membership and the WhatsApp
    groups aren't affected."
  - `delete.doneTitle`: "Hesabın silinecek" / "Your account will be deleted"; `delete.doneBody`: "{date} tarihinden
    sonra kalıcı olarak silinecek. Fikrini değiştirirsen o zamana kadar tekrar giriş yapman yeterli." / "It will be
    deleted for good after {date}. Changed your mind? Just sign in again before then."; `delete.home`: "Ana sayfaya
    dön" / "Back to home"
  - `delete.lastAdmin`: "Kulübün tek yöneticisisin. Önce yönetici rolünü başka birine ver." / "You're the club's only
    admin. Give the admin role to someone else first."; `delete.error`: "Bir şeyler ters gitti. Lütfen biraz sonra
    tekrar dene." / "Something went wrong. Please try again later."
  - `recovery.title`: "Hesabın silinecek" / "Your account will be deleted"; `recovery.body`: "{date} tarihinden sonra
    kalıcı olarak silinecek. Geri alırsan her şey eskisi gibi olur." / "It will be deleted for good after {date}.
    Restore it and everything stays as it was."; `recovery.restore`: "Hesabımı geri al" / "Restore my account";
    `recovery.continue`: "Silmeye devam et" / "Continue deleting"; `recovery.error` = `delete.error`.
- [ ] **Step 7:** lint, tsc, test, build → PASS (`/[locale]/account` stays partially prerendered). Commit
  `feat(account): delete and restore your account`.

### Task 7: Staff views of kept applications and returning members

**Files:**
- Modify: `src/lib/applications/queries.ts`, the applications list and detail components
  (`src/app/[locale]/admin/applications/page.tsx`, `[id]/page.tsx`, `src/components/admin/application-review-panel.tsx`
  as needed), `src/components/admin/member-row.tsx`, `messages/tr.json`, `messages/en.json`

**Interfaces:**
- Consumes: `retained_until` (Task 1), `formerMember` row field (Task 4).

- [ ] **Step 1:** `LIST_COLUMNS` adds `retained_until`; the `unlinked` filter and its count add
  `.is("retained_until", null)` (kept rows are not "approved, waiting for sign-in").
- [ ] **Step 2:** List rows and the detail page show a label for kept rows: `Admin.applications.retained` =
  "Hesabını silmiş eski üye · {date} tarihine kadar saklanır" / "Former member who deleted their account · kept
  until {date}"; the detail page hides the link-account action for kept rows.
- [ ] **Step 3:** `member-row.tsx` shows a warning badge when `formerMember`: `Admin.members.formerMember` = "Eski
  üye: hesabını silmiş" / "Former member: deleted their account".
- [ ] **Step 4:** lint, tsc, test, build → PASS. Commit `feat(admin): show kept applications and returning former
  members`.

### Task 8: Privacy notice, E2E, docs

**Files:**
- Modify: `src/app/[locale]/privacy/content-tr.tsx`, `content-en.tsx`, `src/lib/applications/options.ts`
  (`PRIVACY_NOTICE_VERSION`), `CLAUDE.md`, `docs/PLAN.md`, `docs/follow-ups.md`, `docs/learnings/supabase.md` (+ index
  in `docs/learnings/README.md` if a topic is added), `scripts/e2e/README.md`
- Create: `scripts/e2e/deletion-e2e.mjs`

- [ ] **Step 1: Notice** ("siz"): §8 and the retention list per the spec's "Privacy notice" section (self-deletion
  from the account page, 14 days to restore by signing in, then account and application deleted; rejected
  application per the 6-month rule; applications of members whose membership ended kept 1 year from the request
  for club safety (legitimate interest); access records without identity remain). Version: `2026-11-13-draft-5`
  is already on `main` (deployed), so bump to `2026-11-14-draft-6`. Check the Supabase docs on whether the Free plan keeps backups; if it
  does, add how long deleted data may stay in them to the notice and to `delete.removed`.
- [ ] **Step 2: E2E** `deletion-e2e.mjs` (helpers from `e2e-lib.mjs` like `safety-e2e.mjs`; fixtures `member@` and
  `admin@test.local` per `docs/learnings/testing.md`): member opens `/account`, deletes (double-clicks confirm) →
  done state with a date → home; a second tab of the member refreshes to signed-out; admin's `/admin/members` and
  `/members` don't list the member; member signs in with `next=/en/members` → lands on `/en/account` recovery card
  (English) → Restore → status badge "Active member", visible again to admin. Ends with the member active (fixture
  intact even on failure: `finally` restores via SQL if needed). Run against `pnpm build && pnpm start -p 3123`.
- [ ] **Step 3: Skeleton** — the account skeleton still matches the active page with the new card
  (`scripts/e2e/skeletons.mjs`, JS off); update `AccountSkeleton` if the card adds height.
- [ ] **Step 4: Docs.** CLAUDE.md: "Deleting an account" adds the self-service path (manual stays for staff-requested
  deletions); Database: `deleting` status, `retained_until`, the purge job and how to check it on production
  (read-only `select jobname, schedule from cron.job` / `cron.job_run_details`); rollout note (the
  `pending_application_flags` return change breaks the old deployment's `/admin/members` until the deploy is Ready —
  push `main` right after `db push`); e2e command list gains `deletion`. PLAN.md KVKK: self-deletion done, data
  download still open. follow-ups: remove the "Self-service account deletion" item; add "Data download (KVKK m.11)"
  and anything deferred during the build. Learnings (symptom → cause → do): pg_cron scheduling is DML (hand-written
  migration, idempotent unschedule); `auth.signOut()` defaults to global scope; deleting from `auth.users` in SQL is
  supported (Storage owners block it); anything else discovered.
- [ ] **Step 5:** full verification: lint, tsc, test, `pnpm db:reset && pnpm db:test`, build, all E2E scripts that
  touch `/account` or `/admin/members` (`deletion`, `safety`, `members`, `lists`). Commit `docs: account deletion
  notice, e2e and docs`.
