# Safety data (emergency contacts, blood type, plates) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Active members store up to two emergency contacts, an optional consented blood type and a plate per bike;
staff with the new `members.safety` permission see it from the `/members` directory (safety card dialog, blood-type
and "no emergency contact" filters); every blood-type operation is logged.

**Architecture:** One new schema file `16_member_safety.sql` (contacts, health, access log, self-service RPCs, card
RPC) beside the existing member tables; plates are two new columns on `member_motorcycles`, `show_plates` on
`member_details`. Other people's safety data is readable only through security-definer RPCs (`member_safety_card`,
the extended `member_directory`). App side: queries in `src/lib/members/queries.ts`, writes in
`src/lib/members/actions.ts`, the card fetch in a new `src/lib/members/safety-card.ts`, UI in
`src/components/profile/` (own data) and `src/components/members/` (staff dialog).

**Tech Stack:** Supabase Postgres 17 (declarative schemas, RLS, pgTAP), Next.js 16 App Router (Cache Components),
next-intl, Zod 4, libphonenumber-js / react-phone-number-input, shadcn/ui `base-nova` (Base UI), `node --test`,
puppeteer E2E (`scripts/e2e/`).

**Spec:** `docs/superpowers/specs/2026-11-12-safety-data-design.md` — read it first; this plan argues from it.

## Global Constraints

- Branch `feat/safety-data` from `main`; Conventional Commits; author `iltan <iltancanerr@gmail.com>`; **no
  `Co-Authored-By` or any attribution trailer**. No worktrees.
- DB workflow per DB task: edit `supabase/schemas/*.sql` → `pnpm db:migration <name>` → review the generated file →
  `pnpm db:reset` → `pnpm db:test` → `pnpm db:types` → commit schema + migration + types together.
- Every table: RLS enabled **and** `revoke all … from anon, authenticated` + explicit (column) grants. No table gets a
  "staff can read others" policy for safety data.
- Security-definer functions: `set search_path = ''`, fully qualified names, `revoke all … from public, anon`
  (private helpers also `authenticated`), grant execute only where needed. Policies use `(select auth.uid())`,
  `(select private.…())`.
- pgTAP tests come **before** the SQL, use fixture ids `00000000-0000-0000-0000-0000000006xx` (unused so far), scope
  every query to fixture ids (the suite runs against production at rollout), and include the must-fail cases. Insert
  only granted columns when acting as `authenticated`.
- Enum values (exact): `public.permission` + `'members.safety'`; `public.emergency_relationship` = `spouse_partner,
  parent, sibling, child, friend, other`; `public.blood_type` = `A+, A-, B+, B-, AB+, AB-, 0+, 0-`;
  `public.safety_action` = `view_card, filter_blood_type, set_blood_type, withdraw_blood_type`.
  `ALTER TYPE … ADD VALUE` is split into two migrations automatically; keep both (`docs/learnings/supabase.md`).
- Turkish plate regex (DB and app, after normalisation): `^(0[1-9]|[1-7][0-9]|8[01]) [A-Z]{1,3} [0-9]{2,4}$`;
  foreign: `^[A-Z0-9][A-Z0-9 -]{0,13}[A-Z0-9]$`.
- Phone: E.164 `^\+[1-9][0-9]{6,14}$`; `+90…` must match `^\+905[0-9]{9}$`.
- No hard-coded UI strings: keys in `messages/tr.json` (source of truth, "sen" register) and `messages/en.json`. The
  privacy notice says "siz". Consent text: exactly spec §3.
- Links/redirects from `@/i18n/navigation`; request-time data behind `<Suspense>`; client reads per CLAUDE.md (no
  `setState` in effects).
- Never log personal data (names, phones, blood types, plates); log error codes only.
- Before every code commit: `pnpm lint && pnpm exec tsc --noEmit && pnpm test` (+ `pnpm db:test` for DB tasks);
  `pnpm build` in Tasks 7, 8 and 10.
- Learnings (`docs/learnings/*.md`) and `docs/follow-ups.md` are updated in the same commit as the work that discovers
  or defers something. Remove dead code in the change that makes it dead.

## Review Focus

1. **Plate typed loosely** — `34abc123`, ` 34 abc 123 `, `34-ABC-123`, `06a1234` must all become `34 ABC 123` /
   `06 A 1234`; `00 ABC 12`, `82 ABC 12`, `34 ÇAB 12` and `34 ABCD 12` are invalid unless "foreign" is ticked. Pinned in
   Task 5 (unit) and Task 3 (DB check).
2. **Contact slots after a delete or from two tabs** — main contact (position 1) deleted, member adds a new one → it
   takes position 1; both positions taken (second tab) → "limit", not a generic error. Pinned in Task 1 (DB unique) and
   Task 6 (action picks the free slot, maps `23505`).
3. **`+` in blood-type URLs** — `?blood=0%2B` filters to `0+`; a hand-typed `?blood=0+` arrives as `"0 "` and must be
   ignored (no error page). Pinned in Task 6 (`parseBloodTypeParam` unit test).
4. **Crafted filter URL by a member without `members.safety`** — `/members?blood=A%2B&noContact=1` shows the plain
   directory, no error, **no log row**. Pinned in Task 4 (RPC refuses) and Task 8 (page ignores; E2E in Task 10).
5. **Withdrawing twice / without ever consenting / while inactive** — no error, the type stays null, inactive members
   can do it. Pinned in Task 2.

---

### Task 1: Permission, shared phone rule, emergency contacts

**Files:**
- Modify: `supabase/schemas/05_roles.sql` (enum value), `supabase/schemas/00_private.sql` (phone helper),
  `supabase/schemas/20_applications.sql` (trigger uses the helper)
- Create: `supabase/schemas/16_member_safety.sql`
- Test: `supabase/tests/database/safety_contacts.test.sql`
- Migrations: `pnpm db:migration safety_permission`, `pnpm db:migration emergency_contacts`

**Interfaces:**
- Produces: `'members.safety'` in `public.permission`; `private.is_valid_phone(phone text) returns boolean` (immutable,
  `set search_path = ''`, not security definer, execute revoked from public/anon/authenticated); enum
  `public.emergency_relationship`; table `public.member_emergency_contacts` exactly as spec §1 (`id, profile_id,
  position, name, relationship, phone, created_at, updated_at`, `unique (profile_id, position)` named
  `member_emergency_contacts_position_key`, `check (position in (1, 2))`, `check (char_length(btrim(name)) between 1
  and 80)`). The phone is checked by a BEFORE INSERT OR UPDATE OF phone trigger
  `member_emergency_contacts_phone` → `private.member_emergency_contacts_check_phone()` (**security definer**: a
  `check` constraint calling a `private` function would run with the writer's rights, and `authenticated` has no
  execute/usage there) raising `23514` with constraint `member_emergency_contacts_phone` when
  `not private.is_valid_phone(new.phone)`.
- `private.applications_normalize_contact` keeps its behaviour and error (`23514`, constraint `applications_tr_mobile`)
  but tests the `+90` rule via the helper.

- [ ] **Step 1: Write the failing test** `safety_contacts.test.sql`. Fixtures 0601 owner (active), 0602 other active,
  0603 `members.manage` holder (role 0651), 0604 `members.safety` holder (role 0652), 0605 pending, 0606 inactive.
  Assertions:
  - `'members.safety' = any(enum_range(null::public.permission)::text[])`;
  - helper: `+905321234567` true, `+902161234567` false, `+4915123456789` true, `05321234567` false, `+90532` false;
  - owner inserts position 1 (`'Ayşe Yılmaz', 'parent', '+905321234567'`) and 2 → ok; a third insert with position 2 →
    `23505`; position 3 → `23514`; phone `+902161234567` → `23514`; name `'   '` → `23514`;
  - owner updates name/relationship/phone → ok; `update … set position = 1` → `42501` (no grant);
  - owner deletes position 1 → ok; re-inserts position 1 → ok;
  - other active member, 0603 and 0604 each `select count(*)` of 0601's rows → 0;
  - 0605 and 0606 insert → `42501`; 0606 deletes own contact (seeded as postgres) → 1 row gone;
  - anon `select` → `42501`;
  - applications: anon insert with `+902161234567` still fails `23514` with `applications_tr_mobile` (regression).
- [ ] **Step 2: Run** `pnpm db:test` — expected FAIL (missing enum value / table).
- [ ] **Step 3: Implement** the enum value, helper, applications trigger change and the contacts table + grants
  (`select, delete`; `insert (profile_id, position, name, relationship, phone)`; `update (name, relationship, phone)`)
  + RLS (select own; insert/update own while `private.is_active_member()`; delete own any status) +
  `private.set_updated_at` trigger.
- [ ] **Step 4: Run** both `pnpm db:migration` commands (enum first), review (the enum split into `_1`/`_2` is
  expected), `pnpm db:reset`, `pnpm db:test` — all PASS.
- [ ] **Step 5:** `pnpm db:types`; add `members.safety` to `Admin.permissions.members` in both message files
  (`label`: "Güvenlik bilgilerini görme" / "See safety information"; `description`: "Üyelerin acil durum kişilerini,
  kan grubunu ve plakalarını görebilir; kan grubuna göre arayabilir." / EN equivalent). Check `/admin/roles` renders it.
- [ ] **Step 6: Commit** `feat(db): members.safety permission and emergency contacts`.

### Task 2: Blood type with consent and the access log

**Files:**
- Modify: `supabase/schemas/16_member_safety.sql`
- Test: `supabase/tests/database/safety_health.test.sql`
- Migration: `pnpm db:migration member_health`

**Interfaces:**
- Produces: enums `public.blood_type`, `public.safety_action`; table `public.member_health` (spec §1, check
  `member_health_consent` = `blood_type is null or consent_blood_type`); table `public.safety_access_log` (spec §1);
  `public.set_my_blood_type(new_type public.blood_type, notice_version text) returns void`;
  `public.withdraw_my_blood_type_consent() returns void`; `private.log_safety_access(action public.safety_action,
  target uuid, detail text default null) returns void` (security definer; inserts with `actor_id = auth.uid()`).
- Grants: `member_health` select only (RLS own row); `safety_access_log` select only (RLS `private.is_admin()`); both
  RPCs execute to `authenticated` only.

- [ ] **Step 1: Write the failing test** `safety_health.test.sql`. Fixtures 0611 owner (active), 0612 other active,
  0613 `members.safety` holder (role 0653), 0614 admin (built-in admin role), 0615 pending, 0616 inactive (seeded with
  consent + `'0-'` as postgres). Assertions:
  - owner direct `insert` / `update` / `delete` on `member_health` → `42501`;
  - owner `set_my_blood_type('A+', '2026-11-12-v1')` → row with type `A+`, consent true, version, `_at` not null;
  - calling again with `'0-'` changes the type; `set_my_blood_type(null, 'v')` → `23514`; version of 41 chars → `23514`;
  - 0615 `set_my_blood_type` → `42501`;
  - owner reads own row (1), 0612 and 0613 read 0612/0611's rows → 0;
  - postgres insert of `(type 'A+', consent false)` → `23514` (`member_health_consent`);
  - owner `withdraw_my_blood_type_consent()` → type null, consent false, `_at` advanced; calling it again → lives, still
    null; 0612 (never consented, no row) withdraw → lives, no row created;
  - 0616 (inactive) withdraw → lives, type null;
  - log: after the above, `safety_access_log` has `set_blood_type` rows for 0611 (actor = target = 0611) and
    `withdraw_blood_type` rows; no row for the no-op withdrawals of 0612 (only real changes are logged);
  - 0613 `select` on `safety_access_log` → 0 rows; 0614 (admin) sees the fixture rows; anon → `42501`; owner direct
    insert into the log → `42501`.
- [ ] **Step 2: Run** `pnpm db:test` — FAIL.
- [ ] **Step 3: Implement** (CLAUDE.md self-service pattern: no target id, `for update` lock on the own row, upsert via
  `insert … on conflict (profile_id) do update`). The withdraw RPC updates only `where consent_blood_type` and logs
  only when a row changed.
- [ ] **Step 4: Run** migration, review, `pnpm db:reset`, `pnpm db:test` — PASS.
- [ ] **Step 5:** `pnpm db:types`.
- [ ] **Step 6: Commit** `feat(db): blood type with explicit consent and safety access log`.

### Task 3: Plates and the plate switch

**Files:**
- Modify: `supabase/schemas/14_member_motorcycles.sql`, `supabase/schemas/12_member_details.sql`
- Test: `supabase/tests/database/safety_plates.test.sql`
- Migration: `pnpm db:migration motorcycle_plates`

**Interfaces:**
- Produces: `member_motorcycles.plate text null`, `plate_foreign boolean not null default false`, check
  `member_motorcycles_plate` (spec §1 / Global Constraints regexes); both columns added to the existing column-level
  insert and update grants; `member_details.show_plates boolean not null default true` added to the owner's update
  grant.

- [ ] **Step 1: Write the failing test.** Fixtures 0621 owner (active), 0622 `members.manage` holder (role 0654), 0623
  other active. Owner inserts a bike with `plate '34 ABC 123'` → ok; `'06 A 1234'` ok; `'00 ABC 12'`, `'82 ABC 12'`,
  `'34 abc 123'`, `'34ABC123'`, `'34 ABCD 12'` → `23514`; `('AB-123-CD', foreign true)` ok; `('A', foreign true)` →
  `23514`; update plate to null → ok; 0622 reads the plate; 0623 reads 0 rows; owner updates `show_plates = false` → ok;
  new sign-up gets `show_plates = true`.
- [ ] **Step 2: Run** `pnpm db:test` — FAIL.
- [ ] **Step 3: Implement** the columns, check and grants.
- [ ] **Step 4: Run** migration, review, `pnpm db:reset`, `pnpm db:test` — PASS (existing motorcycle and details
  tests unchanged).
- [ ] **Step 5:** `pnpm db:types`.
- [ ] **Step 6: Commit** `feat(db): motorcycle plates with a directory switch`.

### Task 4: Directory filters, plates in the directory, safety card RPC

**Files:**
- Modify: `supabase/schemas/30_member_directory.sql`, `supabase/schemas/16_member_safety.sql`
- Test: `supabase/tests/database/safety_directory.test.sql`; existing `member_directory.test.sql` must still pass
- Migration: `pnpm db:migration safety_directory`

**Interfaces:**
- Produces:
  - `public.member_directory(search text default null, side_filter public.istanbul_side default null, after_name text
    default null, after_id uuid default null, page_size int default 25, blood_filter public.blood_type default null,
    no_contact boolean default false)` returning the old columns + `has_emergency_contact boolean`; each motorcycle
    object gains `"plate"` (null unless `show_plates`). **Volatile.** Raises `42501` when `blood_filter is not null or
    no_contact` and the caller lacks `members.safety`. Writes `filter_blood_type` (target null, detail = the type) when
    `blood_filter` is set. `has_emergency_contact` is null for callers without `members.safety`.
  - `public.member_directory_counts(search text default null, blood_filter public.blood_type default null, no_contact
    boolean default false)` — same permission rule, no logging.
  - `public.member_safety_card(target uuid) returns table (full_name text, contacts jsonb, blood_type
    public.blood_type, motorcycles jsonb)`: contacts = `[{position, name, relationship, phone}]` by position;
    motorcycles = `[{brand, model, cc, plate}]` by `created_at, id`, plates **always** included. `42501` without
    `members.safety`; `P0002` unless the target is active; logs `view_card` (target = target).
  - The old 5-argument `member_directory` and 1-argument `member_directory_counts` no longer exist (the generated
    migration must drop them; add the drops by hand if it doesn't). Grants: execute to `authenticated` only.

- [ ] **Step 1: Write the failing test** `safety_directory.test.sql`. Fixtures 0631 viewer (active, plain), 0632 safety
  holder (role 0655), 0633 member with contact + `0-` + plate shown, 0634 member with plate hidden and no contact, 0635
  inactive with contact, 0636 inactive safety holder (role 0655). Scope rows to fixture ids (`where id in (…)`).
  - exactly one `member_directory` and one `member_directory_counts` in `pg_proc`;
  - 0631: 0633's bike has `plate '34 ABC 123'`, 0634's bike has `plate` null; `has_emergency_contact` null;
    `member_directory(blood_filter => '0-')` → `42501`; `no_contact => true` → `42501`; counts with a filter → `42501`;
  - 0632: `has_emergency_contact` true for 0633, false for 0634; `blood_filter => '0-'` returns 0633 and not 0634; a
    `filter_blood_type` log row with actor 0632, detail `'0-'`; `no_contact => true` returns 0634 and not 0633; counts
    follow the filters;
  - card: 0632 on 0633 → contacts, `0-`, plate; on 0634 → plate included although hidden; on 0635 → `P0002`; log row
    `view_card` actor 0632 target 0633; 0631 → `42501`; 0636 (inactive holder) → `42501`; a `members.manage`-only
    holder → `42501`;
  - anon calling any of the three → `42501`.
- [ ] **Step 2: Run** `pnpm db:test` — FAIL.
- [ ] **Step 3: Implement.** Keep the search pattern and keyset logic as they are; the card RPC lives in
  `16_member_safety.sql` (after the tables it reads). `16_` sorts before `30_`, which calls `private.log_safety_access`
  from `16_`.
- [ ] **Step 4: Run** migration, review (drops of the old signatures present), `pnpm db:reset`, `pnpm db:test` — PASS.
- [ ] **Step 5:** `pnpm db:types`; fix `src/lib/members/queries.ts` only as far as tsc requires (Task 6 does the rest).
- [ ] **Step 6: Commit** `feat(db): safety filters, plates and safety card in the directory`.

### Task 5: Plate, contact and blood-type schemas (pure modules)

**Files:**
- Create: `src/lib/members/plate.ts`, `src/lib/members/plate.test.ts`, `src/lib/members/blood-type.ts`
- Modify: `src/lib/members/schema.ts`, `src/lib/members/schema.test.ts`, `src/lib/applications/schema.ts` (export the
  phone field), `src/lib/members/format.ts`, `src/lib/members/format.test.ts`

**Interfaces:**
- Produces:
  - `normalizePlate(raw: string, foreign: boolean): string | null | "invalid"` — empty → null; Turkish: strip
    spaces/`-`, upper-case, split as province digits / letters / digits, join with single spaces, validate with the
    Turkish regex; foreign: upper-case, collapse spaces, validate with the foreign regex.
  - `BLOOD_TYPES` (from `Constants.public.Enums.blood_type`), `type BloodType`, `bloodTypeLabel(type: BloodType):
    string` → `"A Rh+"`, `"0 Rh−"` (U+2212), `parseBloodTypeParam(value: unknown): BloodType | null`.
  - In `schema.ts`: `ProfileErrorKey` gains `"invalidPhone" | "notTurkishMobile" | "invalidPlate" |
    "consentRequired"`; `motorcycleSchema` gains `plate: z.string().max(20)` (optional, empty allowed) and
    `plate_foreign: z.boolean()` with a transform to the normalised plate (`invalidPlate` on `"invalid"`);
    `visibilitySchema` gains `show_plates: z.boolean()`; new `emergencyContactSchema` (`name` 1–80 trimmed,
    `relationship` enum, `phone` = the exported application `phoneField`); new `bloodTypeSchema` (`blood_type` enum,
    `consent: z.literal(true, err("consentRequired"))`).
  - `formatMotorcycle` takes an optional `plate` and appends `· 34 ABC 123`; `Motorcycle` type gains `plate?: string |
    null`.
  - `src/lib/applications/schema.ts` exports `phoneField` (no behaviour change).
- Imports between these modules use relative paths with `.ts` extensions (`node --test`).

- [ ] **Step 1: Write the failing tests.** `plate.test.ts`: `('34abc123', false) → '34 ABC 123'`; `(' 34 abc 123 ',
  false) → '34 ABC 123'`; `('34-ABC-123', false) → '34 ABC 123'`; `('06a1234', false) → '06 A 1234'`; `('', false) →
  null`; `('00ABC12', false)`, `('82ABC12', false)`, `('34ÇAB12', false)`, `('34ABCD12', false)` → `'invalid'`;
  `('ab 123  cd', true) → 'AB 123 CD'`; `('a', true) → 'invalid'`. `schema.test.ts`: contact with phone `0532 123 45 67`
  → `+905321234567`; `+90 216 123 45 67` → `notTurkishMobile`; blood type without consent → `consentRequired`;
  motorcycle with `plate '34abc123'` → `'34 ABC 123'`; with `'82ABC12'` → `invalidPlate`. `format.test.ts`: plate
  appended; absent plate unchanged. Blood-type labels and `parseBloodTypeParam('0+')` → `'0+'`,
  `parseBloodTypeParam('0 ')` → null, `parseBloodTypeParam(['A+'])` → null.
- [ ] **Step 2: Run** `pnpm test` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test` — PASS; `pnpm exec tsc --noEmit`, `pnpm lint`.
- [ ] **Step 5: Commit** `feat(members): plate, emergency contact and blood type validation`.

### Task 6: Queries and Server Actions

**Files:**
- Modify: `src/lib/members/queries.ts`, `src/lib/members/actions.ts`
- Create: `src/lib/members/safety-card.ts` (`"use server"`)

**Interfaces:**
- Consumes: Task 4 RPC signatures, Task 5 schemas.
- Produces:
  - `DirectoryMember` gains `hasEmergencyContact: boolean | null`; motorcycles carry `plate`.
  - `listDirectory({ query, side, cursor, bloodType?: BloodType | null, noContact?: boolean })`,
    `countDirectory({ query, bloodType?, noContact? })` (signature changes from `countDirectory(query?)`; update the
    caller). Filters are passed only when given.
  - `MyProfile` gains `showPlates: boolean`, `motorcycles[].plate / plateForeign`, `emergencyContacts: { id: string;
    position: 1 | 2; name: string; relationship: EmergencyRelationship; phone: string }[]` (by position),
    `bloodType: BloodType | null`, `bloodConsent: boolean`.
  - `ProfileActionResult.status` gains `"contactLimit"`; `fail()` maps `23505` → `contactLimit`.
  - Actions: `addEmergencyContact(input)`, `updateEmergencyContact(id, input)`, `deleteEmergencyContact(id)`,
    `setBloodType(input)` (calls `set_my_blood_type` with `PRIVACY_NOTICE_VERSION`), `withdrawBloodTypeConsent()`;
    `addMotorcycle` / `updateMotorcycle` write `plate`, `plate_foreign`; `updateVisibility` writes `show_plates`.
    `addEmergencyContact` reads the member's positions and inserts at the lowest free one; none free →
    `contactLimit`.
  - `safety-card.ts`: `getSafetyCard(profileId: string): Promise<{ status: "ok"; card: SafetyCard } | { status:
    "forbidden" | "notActive" | "error" }>` with `SafetyCard = { fullName: string; contacts: {position: number; name:
    string; relationship: EmergencyRelationship; phone: string}[]; bloodType: BloodType | null; motorcycles:
    Motorcycle[] }`; `42501` → forbidden, `P0002` → notActive, invalid uuid → forbidden.

- [ ] **Step 1:** Implement the query changes and make tsc pass with the existing pages (pass no filters yet).
- [ ] **Step 2:** Implement the actions and `getSafetyCard`; each follows the existing `currentUserId` → Zod →
  scoped write → `finish()` pattern; `refresh()` after success (not in `getSafetyCard`, which only reads).
- [ ] **Step 3: Run** `pnpm lint && pnpm exec tsc --noEmit && pnpm test` — PASS. (Server Actions are exercised by the
  E2E in Task 10, like the existing profile actions.)
- [ ] **Step 4: Commit** `feat(members): safety data queries and actions`.

### Task 7: `/account` — emergency contacts, blood type, plates

**Files:**
- Create: `src/components/profile/emergency-section.tsx`, `src/components/profile/emergency-contact-dialog.tsx`,
  `src/components/profile/blood-type-form.tsx`, `src/components/profile/emergency-prompt.tsx`
- Modify: `src/app/[locale]/account/page.tsx` (sections + `AccountSkeleton`), `src/components/profile/motorcycle-dialog.tsx`,
  `src/components/profile/motorcycles-section.tsx`, `src/components/profile/visibility-form.tsx`,
  `messages/tr.json`, `messages/en.json` (`Profile.emergency.*`, `Profile.bloodType.*`, `Profile.plate*`,
  `Profile.showPlates`, new `Profile.errors.*` keys incl. `contactLimit`)

**Interfaces:**
- Consumes: `MyProfile` and actions from Task 6, `bloodTypeLabel` / `BLOOD_TYPES` from Task 5, the application form's
  `PhoneField` (`src/components/apply/phone-field.tsx`) for the phone input.
- Layout (active): prompt card first, above the account card (only when `emergencyContacts.length === 0`; its button
  links to `#emergency`); then the account card and the sections in this order: Location, Motorcycles, **Acil durum**
  (`id="emergency"`), Visibility, Photo consent. Inactive: Acil durum in "withdraw/delete only" mode before Photo consent; nothing new for pending.

- [ ] **Step 1:** Emergency section: contact list (position 1 labelled "ana kişi" = lowest position), add/edit dialog
  (name, relationship native select, phone), delete with confirm (alert dialog, translated labels), "Kişi ekle"
  disabled at 2 with the limit text; the two hint lines from spec §3.
- [ ] **Step 2:** Blood-type form: not consented → explanation, unticked checkbox with the spec's consent text (TR/EN
  verbatim) + link to `/privacy`, select, Save; consented → type, Change, "Rızamı geri al" (confirm dialog).
  Inactive: only the withdraw button when consented.
- [ ] **Step 3:** Bike dialog: plate input + "Yabancı plaka" checkbox; normalise on blur with `normalizePlate`; bike
  row shows `formatMotorcycle` with the plate. Visibility form: "Plakalarımı göster" switch.
- [ ] **Step 4:** `AccountSkeleton`: add the Acil durum section skeleton in its position (prompt card excluded:
  request-time data). Measure with `scripts/e2e/skeletons.mjs` (JS off, 390 and 1280px); a remaining jump from the
  prompt card goes to `docs/follow-ups.md` (Loading states).
- [ ] **Step 5: Run** lint, tsc, test, `pnpm build`; manual check in the browser signed in as `member@test.local`
  (active) and an inactive fixture.
- [ ] **Step 6: Commit** `feat(account): emergency contacts, blood type consent and plates`.

### Task 8: `/members` — plates, safety filters, safety card dialog

**Files:**
- Create: `src/components/members/safety-card-dialog.tsx`, `src/components/members/safety-filters.tsx`
- Modify: `src/app/[locale]/members/page.tsx`, `src/components/members/member-card.tsx`,
  `src/components/members/directory-skeleton.tsx` (only if the measured card height changes), `messages/*.json`
  (`Members.safety.*`)

**Interfaces:**
- Consumes: `listDirectory` / `countDirectory` (Task 6), `getSafetyCard` (Task 6), `can(user.access,
  "members.safety")`, `parseBloodTypeParam` (Task 5), `whatsAppUrl` (`src/lib/applications/contact.ts`).
- URL params: `blood` (enum value, URL-encoded by `Link`/`URLSearchParams`) and `noContact=1`. Read only when the user
  can; otherwise ignored and never passed on. Chips, search form (hidden inputs) and `Pager` keep them; empty values are
  dropped.

- [ ] **Step 1:** Member card: plate on the bike line (via `formatMotorcycle`). For safety holders (prop
  `safety: boolean`): "Acil kişi yok" badge when `hasEmergencyContact === false`; "Acil durum" button opening the
  dialog.
- [ ] **Step 2:** Safety dialog: calls `getSafetyCard(member.id)` on open (transition, loading state, inline error +
  retry for `error`, messages for `forbidden` / `notActive`); shows name, contacts (relationship label, phone, **Ara**
  `tel:` link and **WhatsApp** link via `buttonVariants()`), blood type (`bloodTypeLabel` or "belirtilmemiş"), bikes
  with plates. Result kept in component state only; reset on close. Translated close button
  (`showCloseButton={false}`).
- [ ] **Step 3:** Safety filters (holders only): blood-type native select (submits via GET with the other params) and
  an "Acil kişisi yok" chip toggle, placed under the side chips; totals use the filtered counts.
- [ ] **Step 4:** Re-measure the member card skeleton (`scripts/e2e/skeletons.mjs`); adjust only if the default card
  changed.
- [ ] **Step 5: Run** lint, tsc, test, `pnpm build`; browser check as `admin@test.local` (holder via admin) and
  `member@test.local` (no safety UI; `?blood=A%2B&noContact=1` shows the normal list).
- [ ] **Step 6: Commit** `feat(members): safety card and filters for members.safety`.

### Task 9: Privacy notice and docs

**Files:**
- Modify: `src/app/[locale]/privacy/content-tr.tsx`, `src/app/[locale]/privacy/content-en.tsx`,
  `src/lib/applications/options.ts` (`PRIVACY_NOTICE_VERSION` → `"2026-11-12-draft-3"`), `docs/PLAN.md`,
  `docs/application-form.md`, `docs/follow-ups.md`

- [ ] **Step 1:** Privacy notice sections 2, 3, 4, 5, 6 and 8/9 as in spec §3 ("siz" register, TR and EN). Bump the
  version.
- [ ] **Step 2:** `docs/PLAN.md`: 2a′ done (summary + spec link), `members.safety` row in the roles table, KVKK lines
  (blood type consent, access log, safety-team access). `docs/application-form.md`: safety data is entered on
  `/account` after approval.
- [ ] **Step 3:** `docs/follow-ups.md`: remove "Safety data (2a′)" from Next up; add (dated 2026-11-12, origin
  "safety data"): emergency contact required to join a ride (with Events); organizers see their ride participants'
  safety cards (with Events); retention of safety data and of `safety_access_log`; access-log viewer for admins;
  KVKK club processes from spec §6 (periodic review of `members.safety` holders, Google 2-Step Verification for
  holders, training/confidentiality, no copying safety data into WhatsApp); lawyer questions (legal basis for
  emergency contacts and plates, disk encryption instead of app-level encryption — cite the Supabase doc checked).
- [ ] **Step 4:** Verify Supabase's encryption-at-rest statement in their current docs; cite the URL in the follow-up.
- [ ] **Step 5: Commit** `docs: privacy notice and plan for safety data`.

### Task 10: Browser E2E and final verification

**Files:**
- Create: `scripts/e2e/safety-e2e.mjs` (header lists its fixtures, like `members-e2e.mjs`)
- Modify: `scripts/e2e/README.md`, `CLAUDE.md` (E2E command list)

- [ ] **Step 1:** Write the script against `pnpm start -p 3123` with the email-sign-in recipe
  (`docs/learnings/testing.md`). Scenarios (each with `try/finally` closing its context):
  1. `member@test.local`: prompt card visible → add contact `0532 123 45 67` → prompt gone; add a second; "Kişi ekle"
     disabled; delete the first, add again (becomes "ana kişi"); a `+90 216…` number shows the mobile error.
  2. Blood type: save without ticking consent → `consentRequired`; tick + `0 Rh−` → shown; change to `A Rh+`; withdraw
     → gone.
  3. Plate `34abc123` → `34 ABC 123` on the bike row and in `/members`; switch "Plakalarımı göster" off → plate gone
     from `/members`.
  4. `second@test.local` (plain member): no "Acil durum" button, no filters; `/members?blood=A%2B&noContact=1` shows the
     normal list; DB check: no `filter_blood_type` row from this user.
  5. `admin@test.local`: filter by blood type and by "no contact" (totals change); open the card for
     `member@test.local` → contacts with `tel:` and `api.whatsapp.com` links, blood type, plate even when hidden.
  6. An inactive fixture: can delete a contact and withdraw consent, can't add.
  Clean up planted rows by fixture id at start and end.
- [ ] **Step 2:** Run it; run `members-e2e.mjs` and `skeletons.mjs` again; instant-navigation dev check for
  `/account` and `/members` (`docs/learnings/nextjs.md`).
- [ ] **Step 3:** Full verification: `pnpm lint && pnpm exec tsc --noEmit && pnpm test && pnpm db:test && pnpm build`.
- [ ] **Step 4:** Restore iltan's local admin if any step reset the DB (CLAUDE.md); delete the `@test.local` rows.
- [ ] **Step 5: Commit** `test(e2e): safety data flows`.

After Task 10: `superpowers:requesting-code-review` and `/security-review` (new tables, grants, RPCs,
special-category data); iltan reviews; merge `--no-ff`; rollout per spec §7 (incl. the `has_function_privilege` check
on `set_my_blood_type`, `withdraw_my_blood_type_consent`, `member_safety_card`, `member_directory`,
`member_directory_counts`, `private.is_valid_phone`, `private.log_safety_access`).
