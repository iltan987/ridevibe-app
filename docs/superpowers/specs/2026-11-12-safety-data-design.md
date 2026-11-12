# Safety data (emergency contacts, blood type, plates) — design

Status: **agreed in chat with iltan (2026-11-12)**, awaiting spec review. MVP step 2a′ in `docs/PLAN.md`; backlog
entry "Safety data (2a′)" in `docs/follow-ups.md` (Next up).

## Why

On a ride, the club must be able to reach a crashed rider's relatives, tell the ambulance crew the rider's blood type,
identify a bike, and find blood donors inside the club when a member (or a member's relative) needs blood. Today the
app holds none of this.

**Done when:** an active member can add up to two emergency contacts, give (and withdraw) explicit consent for their
blood type, and add a plate to each bike with a switch that hides plates from the directory; members without an
emergency contact are gently prompted on `/account`; staff whose role has the new `members.safety` permission can, from
the existing `/members` directory, open any active member's safety card (one-tap call / WhatsApp), filter by blood type
and find members without an emergency contact; every operation on the blood-type data is logged; the privacy notice
covers it all (version bumped).

## Decisions (iltan, 2026-11-12)

- **Separate permission `members.safety`**, not bundled with `members.manage`: different people (ride organizers /
  captains vs. the membership team) and a different purpose; blood type is special-category data, so access is limited
  to who needs it (KVKK Board decision 2018/10, see §6). Roles that need both get both ticked in `/admin/roles`; admins
  have every permission.
- **Access: any time, any active member** (option A). Staff with `members.safety` can look up any *active* member's
  safety card, not only during an event. When Events exist, a ride's organizers also see their participants' cards
  (follow-up).
- **No dedicated page.** Everything lives in the existing `/members` directory: extra filters and an "Acil durum"
  button visible only to `members.safety` holders.
- **Emergency contacts: up to 2**, each with name, relationship (fixed list) and phone; position 1 is the main contact.
- **Blood type: both purposes** — telling health teams in an emergency, and finding donors inside the club (filter by
  type). Optional, separate explicit consent (açık rıza), never nudged; withdrawing consent deletes the blood type.
- **Plates:** optional, per bike; **shown in the directory by default**, with one "Plakalarımı göster" switch (opt-out,
  like the birthday). Turkish format checked and tidied; foreign plates allowed as free text.
- **Gentle prompt only:** a card on `/account` while no emergency contact is saved; `members.safety` sees who has none.
  Nothing is mandatory. Whether joining a ride requires an emergency contact is decided with Events.
- **Inactive members:** disappear from staff view (the directory and the card RPC only cover active members); their
  data stays until the retention rule (open, see follow-ups) so a reactivated member doesn't re-enter it. They can still
  delete contacts and withdraw the blood-type consent.
- **First-aid flag dropped:** first aid is mandatory training for the motorcycle license.

## Out of scope

Medical notes (follow-ups), "My garage" (insurance/inspection dates; the plate column here doesn't block it), safety
cards per event (with Events), requiring an emergency contact for rides (with Events), self-service account deletion
(own iteration, follow-ups), retention/deletion jobs, staff editing of members' safety data, app-level encryption of the
blood type (§6).

## 1. Data model and permissions

All in `supabase/schemas/` (declarative), every table with RLS **and** explicit grants
(`revoke all … from anon, authenticated`, then only what is needed). Other people's safety data is readable **only**
through security-definer RPCs; no table has a "staff can read" policy.

### Permission

- New value `members.safety` in `public.permission` (`05_roles.sql`), with `Admin.permissions.*` messages (TR + EN).
  Holding `members.manage` does not imply it.

### Shared phone rule

- The "Turkish numbers must be mobile (`+905` + 9 digits)" check in `private.applications_normalize_contact` moves into
  a reusable immutable helper (e.g. `private.is_valid_phone(text)`: E.164 `^\+[1-9][0-9]{6,14}$` and, for `+90`, the
  mobile rule). Applications keep their current behaviour (rule runs only when the phone is set/changed); emergency
  contacts use the same helper. The app keeps using `isTurkishMobileOrForeign` (`src/lib/applications/contact.ts`).
  Planning checks whether a `check` constraint with the helper is safe here (the helper is pure, but CLAUDE.md forbids
  `private.*` functions in indexes/defaults on anon-written tables; contacts are written by `authenticated` only, and
  applications keep their trigger).

### `member_emergency_contacts` (new)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK default `gen_random_uuid()` | |
| `profile_id` | uuid not null → `profiles(id)` on delete cascade | |
| `position` | smallint not null, `check (position in (1, 2))` | `unique (profile_id, position)` caps it at 2; 1 = main contact |
| `name` | text not null, 1–80 chars after trim | |
| `relationship` | `public.emergency_relationship` enum: `spouse_partner, parent, sibling, child, friend, other` | |
| `phone` | text not null, E.164 + Turkish mobile rule | normalised by the app like the application form |
| `created_at`, `updated_at` | timestamptz not null default now() | `private.set_updated_at` |

- Grants: `select, delete`; `insert (profile_id, position, name, relationship, phone)`; `update (name, relationship,
  phone)` to authenticated.
- RLS: select own; insert/update own **while active**; delete own **in any status** (KVKK). No staff read policy.
- Deleting the main contact leaves the other at position 2; the app shows the lowest position as "ana kişi" and adds a
  new contact at the free position.

### `member_health` (new, one row per member, created on first consent)

| Column | Type | Notes |
|---|---|---|
| `profile_id` | uuid PK → `profiles(id)` on delete cascade | |
| `blood_type` | `public.blood_type` enum: `A+, A-, B+, B-, AB+, AB-, 0+, 0-` (labels shown as "A Rh+" etc.) | null unless consent |
| `consent_blood_type` | boolean not null | |
| `consent_blood_type_at` | timestamptz not null | time of the last give/withdraw |
| `consent_blood_type_version` | text null (≤ 40) | `PRIVACY_NOTICE_VERSION` the member saw when giving consent |
| `updated_at` | timestamptz not null default now() | |

- `check (blood_type is null or consent_blood_type)`.
- Grants: `select` only. **No insert/update/delete grants**; writes go through two RPCs (CLAUDE.md pattern for
  conditional self-service writes: `public`, security definer, `set search_path = ''`, no target id, `for update` lock,
  execute granted to `authenticated` only):
  - `public.set_my_blood_type(new_type public.blood_type, notice_version text)` — active members only (`42501`
    otherwise); upserts the row with consent true, the type, `now()` and the version; also used to change the type.
    `23514` for a null type or an over-long version.
  - `public.withdraw_my_blood_type_consent()` — any status; sets `blood_type = null`, `consent_blood_type = false`,
    stamps `consent_blood_type_at`; no-op if there is no row or consent is already false.
  - Both write a row to the access log (below).
- RLS: select own only.

### `member_motorcycles` (changed)

- New columns `plate text null` and `plate_foreign boolean not null default false`.
- `check`: `plate is null`, or `not plate_foreign and plate ~ '^(0[1-9]|[1-7][0-9]|8[01]) [A-Z]{1,3} [0-9]{2,4}$'`, or
  `plate_foreign and plate ~ '^[A-Z0-9][A-Z0-9 -]{0,13}[A-Z0-9]$'` (2–15 chars). The app normalises
  (upper-case, Turkish letters not allowed in Turkish plates, single spaces: `34abc123` → `34 ABC 123`).
- Grants: add `plate, plate_foreign` to the existing column-level `insert` and `update` grants.
- Existing policies unchanged: `members.manage` already reads bike rows (and so plates; accepted).

### `member_details` (changed)

- New `show_plates boolean not null default true`; added to the owner's `update` grant.

### Access log `safety_access_log` (new)

KVKK Board decision 2018/10, item 3(c): "Veriler üzerinde gerçekleştirilen tüm hareketlerin işlem kayıtlarının güvenli
olarak loglanması". Logged: every operation that reads or writes **blood types** or reads **someone else's** safety
card.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint generated always as identity PK | |
| `actor_id` | uuid null → `profiles(id)` on delete set null | who did it |
| `target_id` | uuid null → `profiles(id)` on delete set null | whose data (null for a filtered list) |
| `action` | `public.safety_action` enum: `view_card, filter_blood_type, set_blood_type, withdraw_blood_type` | |
| `detail` | text null (≤ 20) | the filtered blood type for `filter_blood_type`; nothing personal otherwise |
| `created_at` | timestamptz not null default now() | |

- Written only by the security-definer RPCs. Grants: `select` to authenticated; RLS: select only for
  `private.is_admin()`. No insert/update/delete grants. No UI in this iteration (admins query it if ever needed;
  follow-up). Retention: decided with the other retention periods (follow-up).

### RPCs

- **`public.member_directory(...)` / `public.member_directory_counts(...)`** (changed signatures; drop + recreate in
  the migration):
  - each bike in `motorcycles` gets `plate` when the owner's `show_plates` is true (null otherwise);
  - new optional filters `blood_type public.blood_type default null` and `no_emergency_contact boolean default false`;
    using either without `private.has_permission('members.safety')` raises `42501`;
  - a `blood_type` filter writes one `filter_blood_type` log row per call (the result reveals those members' type), so
    `member_directory` changes from `stable` to `volatile`;
  - the row also returns `has_emergency_contact boolean` **only for `members.safety` callers** (null for everyone
    else), for the "Acil kişi yok" badge;
  - counts take the same filters, so totals and side chips stay correct.
- **`public.member_safety_card(target uuid)`** (new, security definer, volatile):
  - `42501` unless the caller has `members.safety`; `P0002` (no data) unless the target is an **active** member;
  - returns `full_name`, the contacts (`position, name, relationship, phone` in position order), `blood_type` (null if
    none/withdrawn) and the bikes with plates (**regardless of `show_plates`**: ride safety is a different purpose from
    the directory);
  - writes a `view_card` log row;
  - execute granted to `authenticated` only.

## 2. Data flow

1. **Contacts:** Server Actions in `src/lib/members/` (`addEmergencyContact`, `updateEmergencyContact`,
   `deleteEmergencyContact`), Zod-validated (phone parsed like the application form), RLS decides, `refresh()` after
   success. `23505` on `(profile_id, position)` (two tabs) → "limit reached"; `23514` → invalid; `42501` → not allowed.
2. **Blood type:** `setBloodType(type)` calls `set_my_blood_type(type, PRIVACY_NOTICE_VERSION)`; the consent checkbox
   is required by the Zod schema (literal `true`); `withdrawBloodTypeConsent()` calls the withdraw RPC.
3. **Plates:** the existing `addMotorcycle` / `updateMotorcycle` actions take `plate` + `plate_foreign`; normalisation
   and validation in a shared `src/lib/members/plate.ts` (unit-tested). `updateVisibility` takes `show_plates`.
4. **Safety card:** a Server Action `getSafetyCard(profileId)` (Zod `uuid`) calls `member_safety_card`; the dialog
   calls it when opened and keeps the result only in component state. Errors: `42501` → not allowed, `P0002` → "no
   longer an active member", other → generic (logged without personal data).
5. **Directory filters:** URL params (e.g. `?blood=0-`, `?noContact=1`) parsed with Zod; only passed to the RPC when
   `can(user.access, "members.safety")`; otherwise ignored (the RPC would refuse anyway). Empty params are dropped.

## 3. UI

All strings in `messages/tr.json` (source of truth) and `messages/en.json`; UI copy says "sen". Mobile-first (~390px).

### `/account` (active members)

- **Gentle prompt:** while the member has no emergency contact, a highlighted card at the top: "Sürüşler için acil
  durum kişisi ekle" with a button that scrolls to the section. Gone once a contact exists. No prompt for blood type.
- **New section "Acil durum"** after Motorcycles:
  - **Contacts:** list (name, relationship, phone; position 1 labelled "ana kişi"), edit / delete (delete confirms);
    "Kişi ekle" opens a dialog (name, relationship select, phone). Disabled with an explanation at 2.
    Two lines under the list: "Yalnızca kulübün güvenlik sorumluları görür." and "Eklediğin kişiye haber ver."
  - **Blood type, no consent yet:** short explanation, a **separate, unticked** consent checkbox with the consent text
    (below), a blood-type select, "Kaydet" (needs both).
  - **Blood type, consented:** the type, "Değiştir" (select + save), "Rızamı geri al" (confirm dialog → deletes the
    type).
- **Motorcycles:** the bike dialog gets "Plaka" and "Yabancı plaka" (checkbox); the plate is tidied on blur and shown on
  the bike row.
- **"Diğer üyelere görünenler":** new switch "Plakalarımı göster" (default on).
- **Inactive members** (today: only the photo consent): additionally see their contacts (delete only) and, if
  consented, the blood type with "Rızamı geri al" only.
- `AccountSkeleton` gets the new section (and the prompt card is not in the skeleton: it depends on request-time data;
  measure the jump and note it in follow-ups if any).

**Consent text (TR draft, for the lawyer review too):**

> Kan grubumun; kaza veya acil durumda sağlık ekiplerine iletilmesi ve kulüp içinde kan ihtiyacı olduğunda uygun
> bağışçıların bulunması amacıyla kulübün güvenlik sorumlularınca görülmesine açık rıza veriyorum. Bu rızayı istediğim
> zaman profilimden geri alabilirim.

EN: "I give my explicit consent for the club's safety team to see my blood type, so that it can be passed to medical
teams in an accident or emergency and suitable donors can be found within the club when blood is needed. I can
withdraw this consent at any time from my profile."

### `/members`

- **Everyone:** each bike line shows the plate when the owner shows plates: `Yamaha MT-07 · 689 cc · 34 ABC 123`.
- **`members.safety` holders only:**
  - a blood-type select and an "Acil kişisi yok" chip next to the side chips (combine with search, side, pager;
    totals follow the filters);
  - an "Acil kişi yok" badge on cards of members without an emergency contact;
  - an **"Acil durum"** button on each card → dialog: member name, contacts (relationship, phone, **Ara** `tel:` and
    **WhatsApp** `whatsAppUrl()` buttons, main contact first), blood type ("belirtilmemiş" if none), bikes with plates.
    Loading state inside the dialog; dialog close labels translated (`showCloseButton={false}` + own button, see
    follow-up on `dialog.tsx`).
- Members skeleton: card height re-measured (plates on the bike line); filters for safety holders are not in the
  skeleton (permission is request-time data; accepted, as the admin tab skeletons).

### Privacy notice (`src/app/[locale]/privacy/content-{tr,en}.tsx`, "siz" register; bump `PRIVACY_NOTICE_VERSION`)

- §2 data categories: emergency contacts (data of third persons the member provides: name, relationship, phone),
  blood type (special category, only with explicit consent), motorcycle plates.
- §3 purposes: ride and event safety, reaching relatives in an emergency, informing health teams, finding blood donors
  within the club.
- §4 legal basis: blood type — açık rıza (KVKK m.6); emergency contacts and plates — proposed: meşru menfaat (m.5/2-f)
  and, in an emergency, protecting life/bodily integrity (m.5/2-b); **lawyer question**.
- §5 sharing: safety data visible only to the club's safety team (members with that task); passed to health teams
  only in an emergency; plates shown to active members in the directory unless the member turns them off.
- §6 retention: same as other member data.
- §8/9: consent can be withdrawn from the profile at any time.

## 4. Error handling

- Server Actions map DB errors to result keys (`invalid`, `limit`, `forbidden`, `notActive`, `generic`) like the
  existing profile actions; never log personal data (no names, phones, blood types in logs).
- The safety-card dialog shows an inline error and a retry; it never caches results across opens.
- Filters given by a non-holder are ignored by the page (and refused by the RPC).

## 5. Testing

- **pgTAP first** (`supabase/tests/database/safety.test.sql`; fixture ids only, so it can run against production):
  - enum: `members.safety` exists; a `members.manage` holder without it is refused by the card RPC and the filters;
  - contacts: owner CRUD while active; 3rd contact fails (unique / check); pending and inactive can't insert/update but
    can delete; other members, `members.manage` and `members.safety` read nothing directly; anon nothing; phone rule
    (E.164, `+90` must be `+905`, foreign ok);
  - `member_health`: no direct insert/update/delete; `set_my_blood_type` active only; withdraw works in any status,
    nulls the type, stamps the time; check rejects a type without consent; owner reads own, others nothing;
  - plates: format check (province 00 and 82 fail, `34 ABC 123` ok, lower case fails, foreign free text ok); owner
    writes, `members.manage` reads, others only via the directory with `show_plates` on;
  - directory: plate shown/hidden by `show_plates`; filters raise `42501` without the permission, work with it;
    `has_emergency_contact` null for non-holders; counts match the filters; `filter_blood_type` logged;
  - card RPC: `42501` without permission; `P0002` for inactive/pending target; full data incl. hidden plates; log row
    written; log readable by admins only, not by `members.safety`;
  - shared phone helper; applications' phone behaviour unchanged.
- **Unit** (`node --test`): plate normalisation/validation, contact and blood-type Zod schemas (consent literal),
  blood-type labels.
- **Verification:** lint, tsc, test, db:test, build; browser E2E signed in (fixtures per `docs/learnings/testing.md`):
  member adds/edits/deletes contacts, gives/changes/withdraws blood-type consent, adds a plate and hides it (directory
  reflects it); safety holder filters by blood type and "no contact", opens a card (call/WhatsApp links); a plain member
  sees no safety UI and a crafted `?blood=` URL changes nothing; inactive member can delete/withdraw only.
  Skeleton measurements (`scripts/e2e/skeletons.mjs`) and the instant-navigation dev check for `/account` and
  `/members`.
- **Review:** code review + `/security-review` (new tables, grants, RPCs, special-category data).

## 6. KVKK measures (decision 2018/10, checked 2026-11-12)

Source: kvkk.gov.tr/Icerik/4110/2018-10 ("Özel Nitelikli Kişisel Verilerin İşlenmesinde Veri Sorumlularınca Alınması
Gereken Yeterli Önlemler", 31.01.2018). How this design and the club meet it:

- **Who may access, scope, periodic checks, removal on role change** (2(c), 2(ç), 2(d)): the `members.safety`
  permission, visible per role in `/admin/roles`; a role change or deactivation removes access at once (only active
  members have rights). Periodic review of who holds it is a club process (follow-up for iltan/Samet).
- **Logging of operations** (3(c)): `safety_access_log` (§1).
- **Encryption at rest** (3(a), 3(b)): relies on the hosted database's disk encryption (verify and cite Supabase's
  documentation during planning); no app-level encryption (key management would cost more than it protects here).
  Lawyer question.
- **Two-step authentication for remote access** (3(e)): sign-in is Google only; the app can't enforce Google 2-Step
  Verification. Club process: ask `members.safety` holders to turn it on (follow-up).
- **Training and confidentiality** (2(a), 2(b)): club process (follow-up for Samet).
- **Transfers** (5): the app doesn't export or email safety data; staff should not copy it into WhatsApp groups (note
  in the follow-up for the club process).

## 7. Rollout

1. Read-only pre-checks on production: none needed for constraints (all new columns are nullable or have defaults; the
   new tables are empty); confirm the changed directory signatures don't break old code by pushing `main` right after.
2. Merge → `db push --dry-run` → `db push --yes` → `supabase test db` against production → push `main` immediately.
3. `has_function_privilege` check for anon/authenticated on the new/changed functions (`set_my_blood_type`,
   `withdraw_my_blood_type_consent`, `member_safety_card`, `member_directory*`, the private phone helper).
4. iltan ticks `members.safety` on the roles that need it in `/admin/roles`.

## 8. Docs (same commits as the work)

- `docs/PLAN.md`: 2a′ done and described; `members.safety` in the roles table; KVKK section: blood type with consent,
  access log, safety-team access.
- `docs/application-form.md`: safety data collected on `/account` after approval (link to this spec).
- `docs/follow-ups.md`: remove "Safety data (2a′)" from Next up; add the items deferred here (see "Out of scope" and
  §6 club processes, emergency contact required for rides, per-event safety cards, retention of safety data and the
  access log, access-log viewer, lawyer questions on legal basis and encryption).
- `docs/learnings/`: anything found on the way.
