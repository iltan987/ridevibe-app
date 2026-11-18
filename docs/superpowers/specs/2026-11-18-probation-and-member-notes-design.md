# Ön alım (probation) and staff notes — design

Status: draft for iltan's review (2026-11-18). Decisions in this document come from the conversation with iltan on
2026-11-18 unless marked **Claude's call**.

## 1. Why

The club's real flow after an application is approved: the person goes into a separate **"ön alım" WhatsApp group**
for a few days, the club watches how they behave, and only then they join the main group. If it doesn't work out,
they leave on their own or are removed. The app has no such stage: approval makes the account `active` at once, with
the full member directory (names, photos, districts, birthdays, bikes, opt-in Instagram, plates) of ~140 members.

During those few days staff need somewhere to write down what they see ("late to the meetup", "rode well"). Today the
only staff text is `applications.admin_notes`: one overwritable field, no author or date, readable with
`applications.view`, and absent for members activated by hand.

**Success:** a newly approved person signs in and sees a club they can't yet browse member by member; staff see who is
in ön alım and for how long, write dated notes with their name on them, and make the person a full member (or remove
them) with one click.

**Anti-goals:** an ön alım person reading any other member's personal data (any path: page, RPC, direct table read);
a member ever seeing notes about themselves; anyone becoming a full member without a staff click.

## 2. Approaches considered

- **A. New status `probation` in `public.member_status` (chosen).** Every existing "active" check keeps meaning full
  member, so ön alım people get nothing they are not explicitly given (closed by default). TypeScript's exhaustive
  status maps point at every app place that must handle the new value. The staff list already tabs by status.
- **B. A stage on active profiles** (Claude's first proposal, accepted by iltan, then withdrawn by Claude with iltan's
  agreement). Fewer lines change today, but it is open by default: `profiles` RLS already lets any active member read
  every active profile, and every future feature (events, gallery, announcements) would have to remember to exclude
  ön alım people. One miss leaks member data.
- **C. Reuse `applications.admin_notes` for observations** (rejected for notes): overwritable, no author/date, wrong
  audience (`applications.view`), missing for hand-activated members.

## 3. Decisions

### 3.1 Status and transitions

`member_status` gains `probation` (TR "Ön alım", EN "Probation"). Order in the UI: pending → probation → active →
inactive.

| From | Staff action (`members.manage`, `set_member_status`) | To |
|---|---|---|
| pending | "Ön alıma al" (replaces "Aktifleştir") | probation |
| probation | "Tam üye yap" | active |
| probation | "Pasifleştir" (removed from the club) | inactive |
| active | "Pasifleştir" | inactive |
| inactive | **two buttons:** "Ön alıma al" and "Tam üye yap" (iltan: a reactivation must never silently make someone a full member, and staff must be able to choose ön alım) | probation / active |

- **Every new activation starts in ön alım:** approval of an application (`activate_from_approved_application`: the
  `pending → active` update becomes `pending → probation`) and staff activating a pending sign-up by hand.
  **Enforced in the database** (**Claude's call**): `set_member_status` refuses `pending → active` (`42501`, pgTAP
  must-fail case), so ön alım can't be skipped by calling the RPC directly.
- **No automatic end** after N days (forgotten staff would silently promote someone). Instead the duration is shown.
- **Existing members:** all current `active` profiles stay `active` (= full members). Only new activations start in ön
  alım. No data migration of statuses.
- Rules that stay as they are: nobody changes their own status; only admins change an admin's status; `deleting` is
  never settable by staff; a `deleting` target answers as "not found".
- `set_member_status` may technically set `active → probation` (no UI offers it). **Claude's call:** allowed, harmless.

### 3.2 How long someone has been in ön alım

New column `profiles.status_changed_at timestamptz` (nullable), set by a trigger whenever `status` changes, **except**
moves into and out of `deleting` (a cancelled deletion must not reset "3 gündür ön alımda"). Existing rows stay null
(unknown; the UI then shows no duration). **Claude's call:** a general "status since" column instead of a
probation-only one, because the retention follow-up ("member data deleted 1 year after membership ends", `inactive`
has no date today) needs exactly this for `inactive`.

### 3.3 What an ön alım member can do

Rights (database first; the app mirrors them):

| Area | Ön alım |
|---|---|
| Sign in, `/account`: own profile (district/side), bikes, birth date once, visibility switches, photo consent | yes (own rows only) |
| Emergency contacts, blood type (own) | yes |
| Account deletion / cancel | yes (as today) |
| Staff permissions (`has_permission`, `is_admin`) | **no**, even with a role (rights stay `active` only) |
| Read other profiles (table), `member_directory` | **no** |
| Crowd view (§3.4) | yes |
| Events (later) | rides open to ön alım; organizers can mark a ride "full members only" (iltan, 2026-11-18) |

Implementation rule: `private.is_active_member()` keeps meaning **full member** and keeps guarding everything that
exposes other members. A new helper (e.g. `private.is_club_member()`: `active` or `probation`) replaces it **only** in
own-row paths: `member_details` (`set_my_birth_date`), `member_motorcycles` policies, `member_emergency_contacts` /
`member_health` policies and RPCs. Each switched check gets a pgTAP case for both an ön alım and a pending caller.

`/account` for ön alım: the same sections as an active member, plus a card at the top: they are in the club's ön alım
period, what that means (the club gets to know them; the member directory opens when they become a full member), no
date promised. The emergency-contact prompt shows for them too. Status badge "Ön alım".

Other app places: `/apply` shows the "already a member" view (**Claude's call**: they are in the club); "Başvur" is
hidden in the nav/hero like for members; the install banner shows on `/account` and `/members` for them too; the user
menu shows the install entry.

### 3.4 Crowd view for ön alım members (iltan's idea, Claude's shape)

On `/members` an ön alım member sees, instead of the directory:

```
Kulüpte 142 üye var · Anadolu 81 · Avrupa 61
(AY) (MK) (SÖ) (EB) (TD) (CA) (ZK) …
```

- Only **full** (`active`) members are counted and shown.
- **Initials only**: no photo (a face identifies a person without a name), no name, district, bikes or anything else.
- Initials and counts are computed **in the database** by a new RPC (e.g. `public.club_overview()`, callable by
  `probation` callers only — full members have the directory; pending/inactive get `42501`), so full names never reach
  the browser. Initials: first letter of the first and last word of `full_name`, Turkish upper-casing (`i → İ`).
  Side counts: Asian / European; members without a side are only in the total.
- **Claude's call:** initials ordered randomly per call (alphabetical order would hint at names), all of them shown
  (no cap; at today's ~140 and the 2,000 list ceiling it stays a light grid). A short line under it: the full directory
  opens when they become a full member.
- The bottom tab "Üyeler" stays for them and opens this view.

### 3.5 Who sees ön alım people

- **Regular full members: nobody in ön alım is visible** (not in the directory, not by reading `profiles`) (Claude's
  call, iltan agreed). The `profiles` select policy's member clause becomes "target is `active` and caller is
  `active`" (unchanged wording, but now `active` excludes probation on both sides).
- **Staff with `members.manage` or `members.safety`** see ön alım people in `/members` with an **"Ön alım"** badge,
  so a safety card opens if they join a ride: `member_directory` returns `probation` rows to those callers only, with
  a new `probation boolean` column (adding a return column doesn't break old callers). `member_safety_card` accepts
  `probation` targets. Safety filters work over them too.
- `/admin/members` (`members.manage`): a new **"Ön alım"** tab between "Bekleyen" and "Aktif", with a count; each row
  shows "Ön alım · 3 gün" (from `status_changed_at`; no duration when null).

```
[Bekleyen] [Ön alım (3)] [Aktif] [Pasif]
┌──────────────────────────────────────────┐
│ (AY) Ayşe Yılmaz      ÖN ALIM · 3 gün    │
│      ayse@gmail.com                      │
│      [Notlar (2)]                        │
│      [Tam üye yap]  [Pasifleştir]        │
└──────────────────────────────────────────┘
```

### 3.6 Staff notes (step 2b's notes part, pulled forward; iltan chose to build them now)

- New table `public.member_notes`: `id`, `profile_id` (→ profiles, `on delete cascade`), `author_id` (→ profiles,
  `on delete set null`), `body` (trimmed, 1–2,000 characters), `created_at`.
- New permission **`members.notes`** ("Üye notlarını görme ve yazma"): read and add notes on any non-`deleting`
  profile (any status, incl. pending). Admins have it implicitly. `PLAN.md` already lists it for Üye Sorumlusu.
- **Append-only:** no update for anyone. A correction is a new note. `author_id` is forced to the caller (policy
  check or an RPC; builder's choice). **Only admins can delete** a note (KVKK erasure, a note on the wrong person),
  with a confirm step.
- **The member never sees notes about themselves** in the app (no policy path; pgTAP proves an own-row read returns
  nothing). Notes of other kinds (warnings shown to the member, suspend/ban) stay in PLAN step 2b, later.
- Staff can't read notes about themselves either, admins included: "the member never sees notes about themselves"
  wins over the permission (**Claude's call**). pgTAP case.
- **Notes about admins** (**Claude's call**, mirrors `set_member_status` / `set_member_name`: "only admins can … an
  admin"): only admins read, add and delete notes about an admin. Non-admin holders of `members.notes` don't see the
  "Notlar" button on admin rows, and the database refuses them. Notes about other staff (non-admin roles) follow the
  general rule.
- **Nobody deletes a note about themselves**, admins included (an admin could otherwise erase what was written about
  them without reading it). A note about an admin is deleted by another admin. pgTAP must-fail cases for both.
- Notes about a `deleting` profile are hidden from staff like everything else about it, and go with the purge
  (cascade).
- UI: on `/admin/members`, holders of `members.notes` get a **"Notlar (n)"** button on every row (all tabs). It opens a
  dialog: the notes, newest first, each with author name (or "Silinmiş hesap") and date/time (Europe/Istanbul); a
  textarea + "Not ekle" under them; a hint under the textarea: notes can be shown to the person if they ask for their
  data (KVKK), so write facts. Admins see a delete button per note. Paginate if long (club rule: no silent cap;
  **Claude's call:** load all notes of one member in the dialog via `readAll`; a member won't reach 1,000 notes).
- `/admin/members` itself stays `members.manage`; someone with only `members.notes` has no place to use it (fine: the
  role editor makes them a pair). **Claude's call.**

### 3.7 Privacy notice (KVKK)

The notice must mention (wording in the "siz" register, bump `PRIVACY_NOTICE_VERSION` once for the release):
- the ön alım period: after approval, the account is in an introduction period; other members' data is not shown
  during it, and the person's data is shown only to the club team;
- staff notes: club team members with the matching role may record factual notes about a member's participation and
  conduct; members can request them under art. 11; kept for the member-data period (deleted with the account).
- Legal basis (Claude decides, no lawyer): meşru menfaat (m.5/2-f) for notes and for the ön alım visibility rules.
  The crowd view shows full members' initials to ön alım members: covered by the directory purpose (members of the
  club see that the club exists), minimal data; mention it in the directory paragraph.

## 4. Non-goals

- Warnings shown to the member, suspend/ban, ban list (PLAN step 2b, later).
- Automatic end of ön alım, reminders to staff about long ön alım periods.
- Events and the "full members only" ride flag (comes with Events; recorded in follow-ups).
- Changing the WhatsApp invite text sent on approval.
- Editing or deleting notes by their authors.
- Notes on the application detail page.

## 5. Constraints and rollout

- Declarative schema workflow; `ALTER TYPE … ADD VALUE` is split into two migrations automatically
  (`docs/learnings/supabase.md`).
- pgTAP for every rule, including the must-fail cases: ön alım caller vs. `profiles`, `member_directory`,
  `club_overview`, staff RPCs, own-row writes; full member vs. ön alım rows; notes read/insert/update/delete per
  permission, own notes invisible, `deleting` targets hidden. Scope assertions to fixture ids (pgTAP also runs on
  production).
- Rollout: `set_member_status` keeps its signature (only a new enum value), `member_directory` gains a return column
  (old callers fine). The approval path changes in the DB at `db push`; until the deploy is Ready, a fresh approval
  would show the old app a `probation` status it doesn't know: push `main` right after `db push`.
- Purge (`private.purge_deleted_accounts`): a deleted ön alım account is treated like an active one (its approved
  application is deleted, not kept). Only `inactive` keeps the 1-year retention. **Claude's call.**
- Linking (`link_application`, `linkable_accounts`): where an `active` account can receive an approved application
  (attach only), a `probation` account can too. **Claude's call.**
- The approve dialog texts ("… otomatik olarak aktif üye olur") change to say the person starts ön alım.
- Skeletons: the `/members` crowd view and the `/account` ön alım card need fallbacks per the loading-state rules;
  status is request-time, so the members fallback can stay the directory shape (accepted mismatch, like pending).
- Browser E2E: an ön alım user (new fixture `probation@test.local`) on `/members` (crowd view, no names in the DOM or
  RSC payload), `/account` (card), `/apply`; staff tab, buttons, notes dialog.

## 6. Left to the builder

- Exact helper names, whether notes go through table grants + RLS or RPCs, the trigger for `status_changed_at`.
- Copy (TR native, EN), badge colour (a token from the design system), dialog layout details.
- Where `docs/PLAN.md` (Who sees what, MVP list, Member conduct) and `CLAUDE.md` (status list, permissions) get updated.
