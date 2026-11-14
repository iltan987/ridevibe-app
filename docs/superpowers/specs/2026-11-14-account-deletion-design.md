# Self-service account deletion — design

Date: 2026-11-14 · Status: approved by iltan (2026-11-14) · Origin: `docs/follow-ups.md` "Next up"

## Intent

Anyone with an account (pending, active or inactive) can delete it themselves from `/account`. Deleting the account
means **removing their data from the app**, not leaving the club: they may stay in the WhatsApp groups and keep
riding, maybe they just don't want to use the app (iltan). Today deletion is done by hand by iltan via the Auth admin
API (CLAUDE.md "Deleting an account"); KVKK art. 11 gives the right to erasure and art. 13 requires an answer within
30 days.

It should feel instant: no staff approval, the person is gone from everyone's view the moment they confirm. A grace
period lets them change their mind by signing in again; after it the data is really deleted.

## Goals

- A clear confirm step that says what gets deleted, what is kept and why, and the final date.
- On confirmation: hidden from members **and staff** at once, all rights gone, signed out everywhere.
- 14-day grace period; signing in during it offers **Restore** or **Keep deleting**.
- Final deletion runs automatically, no human step.
- Privacy notice explains self-deletion.

## Non-goals

- Leaving the club / any "left the club" record or staff notification (deletion is app-only; nothing is recorded).
- Data download / export (PLAN.md KVKK: "Members can download and delete their data") — separate follow-up.
- Staff deleting other people's accounts in the app (stays manual per CLAUDE.md).
- Email confirmation (there is no email sending in the app); the confirm screen and the recovery screen are the answer.
- General retention jobs (rejected applications after 6 months, members 1 year after membership ends, pending
  accounts that never apply) — still open in follow-ups. The job built here may later host them, but not now.

## Anti-goals (a failure even if it "works")

- A "deleted" person still visible anywhere: directory, staff member list, application list, linking dialog, safety
  card.
- A deleting account regaining rights or being activated by an application approval or link during the grace period.
- The club locked out of its own app because the last admin deleted their account.
- Data actually surviving the final deletion that the confirm screen said would be deleted.

## Decisions (iltan, in this conversation)

- **Deletion = app data only**, membership in the club is unaffected; no staff notification, no trace.
- **The application is deleted too** (Claude's recommendation, iltan agreed): its purpose (deciding membership) is
  fulfilled; keeping it for a possible comeback is convenience, not a KVKK basis, and today's sign-up trigger would
  auto-activate a returning account from a kept approved application, silently undoing the request.
  **Exception:** a *rejected* application stays until its existing 6-month retention date (legitimate interest:
  prevents re-applying right after a rejection; already in the privacy notice). An application still under review
  (`new`/`contacted`) is withdrawn = deleted.
- **Inactive accounts keep their approved application for 1 year** (iltan chose this after the builder check):
  `inactive` = left or suspended, and is today the only trace of a suspension. Without this, a suspended member could
  delete, wait 14 days, sign in fresh and ask staff to activate them with nothing showing the suspension. So when the
  final deletion runs for an account whose `status_before_deletion = 'inactive'`, its approved application is kept,
  unlinked, until **1 year after the deletion request** (no "membership ended" date exists; 1 year matches the
  notice's "1 year after membership ends"). Legal basis: legitimate interest (club safety), as for rejected
  applications. Accepted trade-off: someone who left on good terms is kept too (the data can't tell them apart).
  Inactive accounts without an application leave nothing.
- **Coming back** after the final deletion: sign in with Google → new pending account → tell staff on WhatsApp → a
  `members.manage` holder sets them active (`set_member_status`). No new form needed.
- **Grace period 14 days** (Claude's proposal, not objected): safe margin under KVKK's 30 days even if a daily run is
  late or missed once.
- **Hidden at once, from staff too** (Claude's proposal, not objected).
- **Last admin can't delete** until they hand the admin role to someone else.

## Approaches

### Marked state

- **A. New status `deleting` + saved previous status (chosen).** Most checks already depend on `status = 'active'`
  (`has_permission`, `is_admin`, `is_active_member`, the profiles policy for members, the directory), so rights and
  member visibility switch off automatically. Staff visibility (`members.manage` reads every status) and the
  application side need explicit work.
- B. Keep status, add only a timestamp: every check needs "and not marked"; one missed spot leaks a deleted person.
  Rejected.

### Final deletion

- **A. `pg_cron` job inside Postgres (chosen).** A daily job calls a private SQL function that deletes due accounts
  from `auth.users` (documented as supported; Supabase's own anonymous-user cleanup example does it) plus their
  applications. Testable with pgTAP, no secret key in the app, no endpoint to protect. Verified 2026-11-14: `pg_cron`
  1.6.4 is available in the local stack; Supabase Cron is available on the Free plan; the `postgres` role has delete
  on `auth.users`. Known blocker: users owning Storage objects can't be deleted (we use no Storage yet; see
  "Future").
- B. Vercel cron → route handler → Auth admin API with `SUPABASE_SECRET_KEY`: puts a full-access key in the runtime,
  adds a `CRON_SECRET`-guarded endpoint, E2E-only testing. Kept as the fallback if A fails in production.

## Design

### Database

**Schema (`10_profiles.sql`)**
- `member_status` gains `deleting`. (Enum `ADD VALUE` is split into two migrations by the tool — learnings
  `supabase.md`.)
- `profiles` gains `deletion_requested_at timestamptz null` and `status_before_deletion public.member_status null`.
  Both null unless status is `deleting` (check constraint: `(status = 'deleting') = (deletion_requested_at is not
  null)` and same for `status_before_deletion`). Not user-writable (no column grants).
- `pg_cron` extension enabled (declarative schema if the diff tool supports it, else in the hand-written migration).

**Schema (`20_applications.sql`)**
- `applications` gains `retained_until timestamptz null`, set only on applications kept after an inactive account's
  final deletion (only the purge writes it; no column grants). **Why a marker:** a kept application is still
  `approved` and unlinked, so without it `private.activate_from_approved_application` would auto-activate the person
  the moment they sign in again with the same email — the opposite of the intent. Every email-matching path skips
  rows with `retained_until` set: `activate_from_approved_application`, `link_application`, `linkable_accounts`,
  `my_application_status`, `pending_application_flags.has_application`, and the apply view (`getApplyView`).
- `pending_application_flags` gains `former_member boolean`: the pending account's sign-in email matches a kept
  application. `/admin/members` shows a warning badge for it (Claude's call: without it, option A keeps data nobody
  looks at). The application list and detail label kept rows ("Hesabı silinmiş eski üye · {date} tarihine kadar
  saklanır"). Changing the RPC's return columns: drop/recreate, check the overload rule and the rollout note in
  CLAUDE.md (old deployed code calls it).

**RPCs (public, security definer, granted to `authenticated` only, no target id — CLAUDE.md self-service pattern)**
- `request_my_account_deletion()` → returns the final deletion date (`timestamptz`). Locks own profile row
  (`for update`). Fails if already `deleting`. Fails (distinct error code) if the caller is an active admin and no
  other active admin exists. Sets `status_before_deletion = status`, `status = 'deleting'`,
  `deletion_requested_at = now()`. Role is **kept** (rights already gone via status; restored on cancel).
- `cancel_my_account_deletion()` → only while `deleting`; restores `status = status_before_deletion`, clears both
  columns. Returns nothing. (The final run may have deleted the account already — then there is no session/profile
  and the app shows signed-out; nothing to handle in SQL.)

**Hiding from staff (DB level, not only UI)** — every staff path that can reach another person's data must exclude
`deleting` profiles:
- `profiles` select policy: the `members.manage` branch becomes `members.manage and status <> 'deleting'` (own row
  stays readable — the recovery screen needs it).
- Same for the `members.manage` branches of `member_contacts`, `member_details`, `member_motorcycles` (and any other
  table with a `members.manage` read branch; builder enumerates).
- `member_directory` already filters `status = 'active'`; `member_safety_card` must refuse a `deleting` target (check
  what it does today with non-active targets).
- Applications: non-rejected rows linked to a `deleting` profile (`profile_id`) are hidden from `applications.view`;
  unlinked open/approved rows whose email matches a deleting account's sign-in email (`member_contacts`) too.
  **Rejected applications stay visible throughout** (Claude's call: they are kept precisely so staff can see them;
  hiding them for 14 days and showing them again after the purge or a cancel would be inconsistent). Builder decides
  the mechanism (policy with a security-definer helper vs. the RPCs); `application_account`, `linkable_accounts`,
  `pending_application_flags` must not expose deleting accounts.
- Staff RPCs refuse `deleting` targets: `set_member_status`, `set_member_role`, `set_member_name`, `link_application`
  (already only pending/active targets — keep it that way, add a test).
- Activation: `activate_from_approved_application` only updates `status = 'pending'` rows, so approving or
  email-correcting an application can't activate a deleting account. Keep and test it.

**Final deletion — `private.purge_deleted_accounts(as_of timestamptz default now())`** (security definer, not
granted to anyone; `as_of` lets pgTAP simulate time)
1. For each profile with `status = 'deleting'` and `deletion_requested_at <= as_of - interval '14 days'`:
2. delete its applications with `status <> 'rejected'`: linked by `profile_id`, plus unlinked ones whose normalized
   email equals the account's sign-in email (`private.normalize_email`, `member_contacts`). Rejected ones stay;
   `profile_id` becomes null by the existing FK. **Exception:** if `status_before_deletion = 'inactive'`, its
   approved application(s) are not deleted but get `retained_until = deletion_requested_at + interval '1 year'` and
   `profile_id = null`.
3. `delete from auth.users where id = …` — existing cascades remove profile, `member_contacts`, `member_details`,
   `member_motorcycles`, `member_emergency_contacts`, `member_health`; `applications.reviewed_by` and
   `safety_access_log` actor/target become null (already so).
4. Delete kept applications whose `retained_until <= as_of` (keeps the 1-year promise without the general retention
   job, which stays a non-goal).
5. Also delete `cron.job_run_details` rows older than 30 days (run history is never pruned and counts against the
   Free plan's 500 MB).

**Schedule** (hand-written migration, DML is not tracked by declarative schemas): `cron.schedule('purge-deleted-
accounts', '0 2 * * *', 'select private.purge_deleted_accounts()')` — 05:00 Istanbul. Idempotent (unschedule-if-
exists first) so it is safe on production and after `db:reset`.

**pgTAP** (fixtures only — the suite also runs against production; `@pgtap.invalid` emails)
- request: works for pending/active/inactive; second call fails; last admin fails, admin with a second admin works;
  anon can't execute; role kept; columns set.
- cancel: restores each previous status; fails when not deleting.
- while deleting: no `has_permission`/`is_active_member`; invisible to another active member and to a
  `members.manage` / `applications.view` holder (rejected applications stay visible) in every table/RPC listed above; staff RPCs refuse it; approving a
  matching application does not activate it; still reads own profile row.
- purge: does nothing at day 13 (`as_of`), deletes at day 14; deletes linked and email-matched non-rejected
  applications; keeps rejected ones (unlinked); doesn't touch non-deleting fixtures; `pg_proc` overload checks.
- inactive: approved application kept (unlinked, `retained_until` = request + 1 year); not kept for active/pending;
  a returning account with the same email is **not** activated, `my_application_status` ignores the kept row,
  `former_member` is true, `has_application` false, `link_application` refuses it; purge deletes it at 1 year
  (`as_of`), not a day before.
- job exists in `cron.job` with the expected schedule.

### App

**`getCurrentUser`** keeps returning the profile for a `deleting` account (status `deleting`, no access). Every
consumer of `profile.status` must treat `deleting` deliberately (builder enumerates — ~20 files use status). Default:
like a signed-in user with no rights; the apply view treats it like an existing account (no "Başvur").

**`/account`**
- Normal states: a "Hesabı sil" card at the very bottom (below everything, destructive styling, short line of text).
- The button opens a dialog (my call: a dialog with a destructive confirm button; no typing-to-confirm):

```
┌ Hesabını sil ───────────────────────────────┐
│ Silinecekler: profilin, iletişim bilgilerin, │
│ motosikletlerin, acil durum kişilerin, kan    │
│ grubun, tercihlerin ve başvurun.              │
│ Kalanlar: reddedilmiş bir başvurun varsa 6 ay │
│ dolana kadar; kimliğini göstermeyen kayıtlar. │
│ 14 gün içinde tekrar giriş yaparsan geri      │
│ alabilirsin. {date} tarihinde kalıcı silinir. │
│ Kulüp üyeliğin ve WhatsApp grupları etkilenmez│
│                     [Vazgeç] [Hesabımı sil]   │
└──────────────────────────────────────────────┘
```

  The "kept" line only lists what applies (builder may show the rejected-application line only when one exists, or
  always — my call: always, simpler and honest). Inactive accounts also see: "Üyeliğin sona erdiği için başvurun
  {date} tarihine kadar saklanır." Copy final wording in the plan (Turkish native, "sen"; English
  parity).
- Confirm → Server Action: calls `request_my_account_deletion`, then `auth.signOut({ scope: 'global' })` (all
  devices; verify the option in `@supabase/ssr`/`supabase-js` docs), then redirect to `/` with a one-off notice
  ("Hesabın {date} tarihinde silinecek…") — mechanism builder's choice (e.g. a query flag on the home page; no
  personal data in the URL). Cross-tab `AuthSync` handles other tabs.
- `deleting` state (signed in again during the grace period): `/account` shows only a recovery card: "Hesabın {date}
  tarihinde silinecek." + **Hesabımı geri al** (calls `cancel_my_account_deletion`, `refresh()`) and **Silmeye devam
  et** (signs out). Other pages: signed-in but no rights (members/admin pages already gate on `can()`/active). The
  sign-in callback should land a `deleting` account on `/account` regardless of `next` (builder: simplest place).

**Errors**: last-admin → a clear message ("Önce yönetici rolünü başka birine ver."); already deleting / DB error →
generic error, nothing changes.

### Privacy notice

- §8 (Haklarınız) and the retention section: hesabınızı hesap sayfanızdan silebilirsiniz; 14 gün içinde tekrar
  giriş yaparak geri alabilirsiniz; ardından hesabınız ve başvurunuz silinir; reddedilmiş başvuru 6 ay kuralına göre
  saklanır; üyeliği sona ermiş (ayrılmış veya askıya alınmış) üyelerin başvurusu silme talebinden itibaren 1 yıl
  saklanır (kulüp güvenliği, meşru menfaat); kimliği içermeyen erişim kayıtları kalır. ("siz" register.)
- Bump `PRIVACY_NOTICE_VERSION` unless the current draft version is not yet deployed (CLAUDE.md rule).

### Docs

- CLAUDE.md: "Deleting an account" gains the self-service path (manual path stays for staff-requested deletions);
  `deleting` status in the Database section; `pg_cron` job in the production section (how to check it ran:
  `cron.job_run_details`, read-only).
- `docs/PLAN.md` KVKK: deletion done, download still open. `docs/follow-ups.md`: remove the "Next up" item; add data
  download; add anything deferred.
- Learnings for whatever is discovered (pg_cron + declarative schemas, global sign-out, …).

### Rollout

Migration adds an enum value, columns, policies, functions, extension and the cron job → `db push` (dry-run first),
`test db --remote --yes`, `has_function_privilege` check for the new RPCs (anon must be false), check `cron.job` on
production (read-only), then push `main`. Old code tolerates the new enum value only if nothing exhaustively switches
on status at runtime — builder checks; otherwise push `main` immediately after `db push`.

## Claude's calls (for iltan to check)

14-day grace; hidden from staff at once; dialog without typing-to-confirm; the "kept" line always shown; the
`former_member` badge; 1 year counted from the deletion request; daily run at 05:00 Istanbul; run history pruned after
30 days; rejected applications stay visible to staff during the grace period.

## Left to the builder

- Exact list of policies/RPCs that need the `deleting` exclusion (enumerate from `supabase/schemas`, test each).
- Mechanism for hiding applications of deleting accounts.
- How each `profile.status` consumer handles `deleting`; where the post-sign-in redirect lives.
- Whether `create extension pg_cron` goes in a schema file or the hand-written migration.
- Post-deletion notice mechanism on the home page.
- Whether Supabase Free plan has backups that would keep deleted data for a while; if so, mention it in the confirm
  text and the notice.

## Future

- When Storage arrives (galleries, avatars), the purge must delete the user's objects first (owners block
  `auth.users` deletes).
- The same job can later run the open retention rules.
