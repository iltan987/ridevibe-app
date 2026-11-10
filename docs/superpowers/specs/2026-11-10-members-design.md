# Members (directory + my profile) — design

Status: **agreed in chat with iltan (2026-11-10)**, awaiting spec review. MVP step 2a in `docs/PLAN.md`.

## Why

MVP step 2: active members can see who is in the club (name, district/side, bikes) and keep their own profile up to
date. Names must look tidy everywhere (iltan hand-fixed names like "Kerim çelik"). Backlog entry "Members iteration"
in `docs/follow-ups.md`.

**Done when:** an active member can open a paginated, searchable directory with a visible total; edit their location,
motorcycles, Instagram, visibility toggles and photo consent; names in applications and profiles are capitalised
consistently (new rows and a backfill of existing ones); members can no longer rename themselves.

## Decisions (iltan, 2026-11-10)

- **Name lock:** members can't change `full_name`; staff with `members.manage` (admins have every permission) correct it
  with the existing `public.set_member_name`.
- **No nickname field** (add only if members ask).
- **Multiple motorcycles** per member.
- **Birth date and Instagram** come from the approved application (already asked there); members choose whether other
  members see them (**opt-in, off by default**).
- **Photo-consent toggle** on the profile (promised in `docs/application-form.md`: "revocable from profile").
- **Safety data is the next iteration (2a′)**: emergency contact, blood type (special category, explicit consent),
  plate per bike, a new staff permission (e.g. `members.safety`), consents and privacy text. Not built here.
- **Name tidying** with Turkish rules, language guessed per name (see §3).
- Private-but-optionally-shown fields live in a **separate table**, the directory comes from **one security-definer
  RPC** (approach A; rejected: restricting `profiles` reads, which breaks e.g. the reviewer-name join for staff with only
  `applications.view`; column-level select grants, which also hide the owner's own data and break `select *`).

## Out of scope

Safety data and plates (2a′), avatar upload, member detail pages, staff editing of birth date / Instagram / bikes,
medical notes, "first-aid trained" flag, member conduct (2b).

## 1. Data model and permissions

All in `supabase/schemas/` (declarative), every table with RLS **and** explicit grants.

### `profiles` (unchanged columns; readable by active members, as today)

- Members' update grant becomes `update (preferred_locale, city, district, side)`:
  - **drop `full_name`** (name lock);
  - **drop `avatar_url`**: the directory shows avatars to every member, so a self-set URL could log viewers' IPs; the
    app has no avatar editing, the Google picture from sign-up stays.
- "profiles: update own" policy: unchanged.

### `member_details` (new, one row per profile)

| Column | Type | Notes |
|---|---|---|
| `profile_id` | uuid PK → `profiles(id)` on delete cascade | |
| `birth_date` | date null | From the approved application; read-only for the member |
| `instagram` | text null, same check as `applications.instagram` (`^[A-Za-z0-9._]{1,30}$`) | App strips a leading `@` / URL like the form |
| `show_birthday` | boolean not null default false | Day/month shown in the directory |
| `show_instagram` | boolean not null default false | |
| `consent_photos` | boolean not null default false | Explicit consent (açık rıza) for galleries |
| `consent_photos_at` | timestamptz null | Stamped by trigger when `consent_photos` changes (null = never decided on the profile and nothing copied) |
| `consent_photos_version` | text null (≤ 40) | Privacy-notice version the member saw; written by the app with the consent |
| `updated_at` | timestamptz not null default now() | `private.set_updated_at` trigger |

- Grants: `revoke all … from anon, authenticated`; `grant select` and
  `grant update (instagram, show_birthday, show_instagram, consent_photos, consent_photos_version)` to authenticated.
  No insert/delete grant: rows are created by the sign-up trigger and the backfill, deleted by cascade.
- RLS select: own row, or `members.manage`. Update: own row only, **any status**: withdrawing photo consent must stay
  possible after membership ends (KVKK). The UI only offers the other fields to active members.
- Created for every new profile in `private.handle_new_user`.

### `member_motorcycles` (new)

| Column | Type |
|---|---|
| `id` | uuid PK default `gen_random_uuid()` |
| `profile_id` | uuid not null → `profiles(id)` on delete cascade (indexed) |
| `brand` | text not null, 1–60 chars |
| `model` | text not null, 1–60 chars |
| `cc` | smallint null, 50–3000 |
| `created_at`, `updated_at` | timestamptz not null default now() |

- Grants: select, `insert (profile_id, brand, model, cc)`, `update (brand, model, cc)`, delete to authenticated.
- RLS select: own rows, or `members.manage`. Insert/update/delete: `profile_id = (select auth.uid())` and active member.
- **At most 10 bikes per member** (before-insert trigger, errcode `23514`, constraint name `member_motorcycles_limit`).
  A data limit against abuse, not a list cap; the profile lists all of them.
- Displayed in creation order.

### `public.member_directory(search, side, after_name, after_id)` (new RPC)

- `security definer`, `set search_path = ''`, `stable`; raises `42501` unless `private.is_active_member()`.
- Returns **active** members only: `id, full_name, avatar_url, district, side, birth_month, birth_day, instagram,
  motorcycles` (jsonb array of `{brand, model, cc}` in creation order).
  - `birth_month/birth_day` only when `show_birthday` and a birth date exists; never the year.
  - `instagram` only when `show_instagram`.
- Filters: `search` (name, `ilike`, trimmed, ≤ 60 chars, `%`/`_` escaped like `linkable_accounts`); `side`
  (`asian` / `european` / null = all).
- Order: `full_name` in Turkish collation, then `id`; keyset cursor `(after_name, after_id)` plus a `page_size`
  argument, encoded/decoded in the app like `src/lib/pagination.ts`. Check that an ICU Turkish collation exists
  on Supabase (local and hosted) during planning; record the result in `docs/learnings/supabase.md`.
- Companion RPC `public.member_directory_counts(search)` (same access rule) returns `total, asian, european` for the
  heading and the side chips.
- Execute granted to `authenticated` only.
- This RPC is the **only** way to read other members' details or bikes: neither table has an "active members can read"
  policy.

## 2. Data flow

1. **Sign-up:** `handle_new_user` also inserts `member_details (profile_id)`.
2. **Copy from the application:** new `private.fill_member_from_application(target_profile uuid, application_id uuid)`
   (security definer):
   - `birth_date`, `instagram`: set only where the details row has null;
   - photo consent: copied (`consent_photos`, `consent_photos_at = application.created_at`,
     `consent_photos_version = application.privacy_notice_version`) only if `consent_photos_at` is null;
   - motorcycle: if `owns_motorcycle`, brand and model are non-blank after trimming, and the member has **no** bikes,
     insert brand/model/cc;
   - idempotent (safe to re-run).
   Called from `private.activate_from_approved_application` (after the profile is activated) and from
   `public.link_application`'s attach-to-active-account branch (today it copies nothing).
3. **Name tidying:** BEFORE insert / update of `full_name` triggers on `applications` and `profiles` call
   `private.tidy_name` (§3). The private trigger function works for anonymous form inserts, as
   `private.applications_normalize_contact` already does.
4. **Backfill** (hand-written DML in the migration, after the DDL):
   1. insert `member_details` for every profile without one;
   2. for every profile with a linked approved application, run the fill helper with its newest approved application;
   3. tidy `applications.full_name` and `profiles.full_name` where the result differs.
5. **Profile edits** — Server Actions (`src/lib/members/actions.ts`), Zod-validated, RLS decides, `refresh()` after
   success:
   - `updateLocation` (city, district; `side` derived with `sideOfDistrict`, same rules as the form);
   - `updateVisibility` (instagram, `show_instagram`, `show_birthday`);
   - `updatePhotoConsent` (value + current `PRIVACY_NOTICE_VERSION`);
   - `addMotorcycle`, `updateMotorcycle`, `deleteMotorcycle`.
   Results map DB errors: `23514` → invalid (`member_motorcycles_limit` → "limit reached"), `42501` → not allowed,
   anything else → generic failure (logged without personal data).
6. Unchanged: correcting an application's name after approval does not touch the profile; staff use `set_member_name`.

## 3. Name tidying (`private.tidy_name(name text, turkish boolean) returns text`, immutable)

- Trim, collapse runs of whitespace to one space. Words are split on spaces; each word is split further on `-`.
- Per word part:
  1. **all lowercase** → first letter upper-cased, rest unchanged;
  2. **ALL CAPS** (≥ 2 letters) → first letter kept, rest lower-cased;
  3. **mixed case** → left alone (`McLaren`, `DeLuca`; makes staff corrections stick);
  4. the particles `de, da, di, du, van, von, der, den, la, le` stay lowercase when typed lowercase and not the first
     word.
- **Turkish vs. English casing only differs for i:** Turkish `i ↔ İ`, `ı ↔ I`; English `i ↔ I`. Implemented with explicit
  `translate()` before `upper()`/`lower()` so it doesn't depend on the DB collation. Other letters (ç, ö, ü, ğ, ş)
  case the same either way.
- **Which casing:** Turkish if the caller's locale is `tr` **or** the name contains `ğ`, `Ğ`, `ı`, `İ`, `ş` or `Ş`;
  English otherwise.
  - `applications`: `locale` column (form language).
  - `profiles`: `preferred_locale`. The app never writes it today (always `tr`), so profile names effectively get
    Turkish casing; harmless because profile names come from Google (mixed case → untouched), a tidied application
    name, or staff input.
- Known misfires (accepted, staff fix them and the fix sticks via rule 3): a foreigner filling the **Turkish** form in
  lowercase (`ian` → `İan`); an all-caps name typed on a non-Turkish keyboard (`CELIK` → `Celık`), or ASCII on the
  English form (`ilker` → `Ilker`, consistent with the ASCII spelling).
- Examples: `kerim çelik` → `Kerim Çelik`; `AYŞE NUR YILMAZ` → `Ayşe Nur Yılmaz`; `ilker  ışık` (tr) → `İlker Işık`;
  `ian smith` (en) → `Ian Smith`; `ayşe-nur` → `Ayşe-Nur`; `ludwig van beethoven` → `Ludwig van Beethoven`;
  `McLaren` → `McLaren`.
- **Preview for iltan before production:** a read-only query (in the plan / rollout notes) that iltan runs
  against production and that lists only names that would change, before → after. Claude doesn't run it, so no member
  names reach the session or the repo.

## 4. UI

### Navigation

- 5th primary nav item **Üyeler / Members** (`/members`) in `src/components/layout/nav-items.ts`:
  Home · Events · Members · Gallery · Apply (bottom bar `grid-cols-5`, ~78px per tab at 390px). Nav stays session-free.

### `/members` (directory)

- Not signed in → redirect to `/sign-in?next=/members`. Pending / inactive → card "available to active members"
  (pending also sees the existing apply / under-review CTA, reusing the `/account` logic).
- Active members:
  - heading with total ("128 üye"); name search (GET form like `/admin/members`); side chips All / Anadolu / Avrupa with
    counts; link "Edit my profile" → `/account`;
  - one card per member: avatar, name, district · side, each bike on its own line ("Yamaha MT-07 · 689 cc"), opted-in
    🎂 day + month ("12 Mart", via next-intl formatter) and Instagram link (`https://instagram.com/<handle>`, new tab,
    `rel="noopener noreferrer"`);
  - keyset `Pager`; empty states for no results / no members on a side.
- Skeleton mirrors the card list (`data-skeleton` / `data-skeleton-result`, measured with JS off).

### `/account` → "my profile" (active members; pending/inactive keep today's page without editing)

- Header: avatar, name, hint "To change your name, ask the club team"; email, status, role as today.
- **Location:** city + district with the application form's picker; side shown, derived.
- **Motorcycles:** list with edit / delete (delete confirms); "Add motorcycle" opens a dialog (brand, model, cc). At 10
  bikes the add button is disabled with an explanation.
- **Shown to other members:** Instagram field; switches "Show my Instagram", "Show my birthday (day and month)".
  Birth date itself shown read-only.
- **Photo consent:** switch, link to `/privacy`, "given / withdrawn on <date>". Also shown to inactive members, so they
  can withdraw it.
- Each section saves on its own (small form, pending state on its button, success / error message).
- Messages in `messages/tr.json` (source of truth) and `messages/en.json`; no hard-coded strings; dialogs pass
  translated close labels (see follow-up on `dialog.tsx`).

### Privacy notice

- Add to `src/app/[locale]/privacy/content-{tr,en}.tsx`: active members see each other's name, profile photo,
  district/side and motorcycles in the member directory; birthday (day/month) and Instagram only if the member turns
  them on; photo consent can be changed on the profile. Bump `PRIVACY_NOTICE_VERSION`.

## 5. Testing

- **pgTAP first** (`supabase/tests/database/members.test.sql`, `tidy_name.test.sql`):
  - `profiles`: member can't update `full_name` / `avatar_url`, can update location; `set_member_name` still works for
    `members.manage`.
  - `member_details`: owner and `members.manage` read; other active member reads nothing; owner (any status) updates
    allowed columns only; `birth_date` update fails; anon nothing.
  - `member_motorcycles`: owner CRUD while active; pending / inactive / other member fail; 11th bike fails with
    `member_motorcycles_limit`.
  - `member_directory`: anon / pending / inactive fail; only active members returned; birthday / Instagram only when
    opted in, year never; search, side filter, keyset order and counts.
  - `tidy_name`: every rule and example in §3; triggers on both tables (insert and update, incl. anon form insert).
  - fill helper: fills only nulls, no duplicate bike, consent copied once; runs on activation and on attach-to-active
    linking; sign-up creates `member_details`.
- **Unit** (`node --test`): profile Zod schemas (instagram normalisation, cc range, district/side), birthday and bike
  formatting.
- **Verification:** lint, tsc, test, db:test, build; browser E2E signed in (`docs/learnings/testing.md`): directory search /
  chips / pager, profile edits reflected in the directory, pending and anonymous views; `scripts/e2e/skeletons.mjs`
  and the instant-navigation dev check for `/members` and `/account`.
- **Review:** code review + `/security-review` (new tables, grants, RPC).

## 6. Rollout

1. iltan runs the read-only name preview against production.
2. Merge → `db push --dry-run` → `db push --yes` → `supabase test db` against production → push `main` immediately.
3. Read-only pre-check for the backfill: none of the new constraints apply to existing rows except `instagram`
   (same check as applications) and bike brand/model lengths (applications allow 60, same as here).

## 7. Docs (same commits as the work)

- `docs/PLAN.md`: step 2 → 2a (this) and 2a′ (safety); what the directory shows.
- `docs/application-form.md`: what is copied to the profile on approval; photo consent revocable on `/account`.
- `docs/follow-ups.md`: remove "Members iteration" and the open decision "Lock the member name"; add "Safety data
  (2a′)" as next up, staff correction of birth date / Instagram / bikes, medical notes + first-aid flag idea, nav
  review once events exist (5 tabs).
- `docs/learnings/`: Turkish collation on Supabase, anything else found.
