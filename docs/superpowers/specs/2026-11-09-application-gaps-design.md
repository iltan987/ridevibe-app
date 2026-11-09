# Application gaps — design

Status: **draft**, agreed in chat with iltan on 2026-11-09, pending review of this file.

## Why

First week in production with real applicants surfaced data and linking problems that iltan had to fix with ad-hoc
SQL on the production database:

1. A mistyped phone (`+90 454…` instead of `+90 545…`) passed validation (`isPossiblePhoneNumber` only checks length).
2. An applicant typed a nickname instead of their real name.
3. A member had no Google account (solved: he created one; see "Not in scope").
4. An applicant typed an iCloud address on the form but signed in with Gmail → no automatic match.
5. People who apply but never sign in, people who sign in but never apply, and people with several Gmail accounts who
   apply with one and sign in with another.

**Goal:** staff never need SQL for these cases again, and the app prevents or surfaces as many of them as it can.

**Decided:** the application form stays **open to anonymous visitors**. Forcing sign-in first was considered and
rejected: too strict for Instagram ad visitors, and Google blocks sign-in inside Instagram's in-app browser
(`403 disallowed_useragent`), so it would stop many of them at the first step.

## Overview

| # | Problem | Prevention (form / applicant) | Correction / visibility (staff) |
|---|---|---|---|
| A | Wrong phone | Turkish numbers must be mobile (`+905…`) | Staff edit phone |
| B | Nickname | Hint "as on your ID" | Staff edit application name and member name; profile name taken from the approved application |
| C | Applies, never signs in | Success screen repeats the email and explains next step | Applications list filter "approved, not signed in" |
| D | Signs in, never applies | Pending account sees "you haven't applied yet" + prefilled form; applying while signed in links immediately | Members list shows "applied / no application" for pending accounts |
| E | Email on form ≠ sign-in email | Clearer email hint; soft warning for non-Gmail; success screen repeats the email | "Link to account" on the application page; correcting the email re-runs matching |
| F | In-app browser blocks Google sign-in | Sign-in page detects in-app browsers and explains how to open the page in Safari/Chrome | — |

## 1. Data model and permissions (`supabase/schemas/20_applications.sql`, `10_profiles.sql`)

### `applications.profile_id` — new meaning
Today: "the member account an *approved* application was linked to". New: "the account this application belongs to",
set either at submission (applicant was signed in) or on approval/linking. Comment on the column updated accordingly.

- **Insert while signed in:** `grant insert (profile_id)` to `authenticated` only; the insert policy adds
  `with check (profile_id is null or profile_id = (select auth.uid()))`. The server action sets `profile_id` from the
  session, never from form data. Anonymous inserts keep `profile_id` null (no grant for `anon`).
- **One open application per account:** unique partial index on `profile_id` where status in `('new', 'contacted')`
  (next to the existing one-open-per-email index).

### Activation
`private.activate_from_approved_application(target_profile)` matches an approved application by
`profile_id = target_profile` **first**, then (as today) by normalised email where `profile_id is null`.
On activation it also sets `profiles.full_name` from the application (the staff-reviewed name, problem B) — only when
the application name is non-empty, which the CHECK already guarantees.

`private.applications_after_approval()`: if `new.profile_id` is set, activate that profile; otherwise match by email as
today.

New trigger: when staff change `email` on an **approved** application with `profile_id is null`, re-run matching (so
correcting the email to the sign-in address links and activates the pending account).

Unchanged guarantee: activation only touches `pending` profiles, never `active` / `inactive` (can't undo a suspension).

### Staff corrections (problems A, B, E)
- `grant update (full_name, phone, email)` on `applications` to `authenticated`. The existing update policy already
  requires `applications.review` or `applications.decide`; column CHECKs still apply. A `before update` trigger
  normalises the email like on insert (trim + lowercase).
- **Member name:** new RPC `public.set_member_name(target_id uuid, new_name text)`, requires `members.manage`, same
  pattern as `set_member_status`. Members can still edit their own name (unchanged; revisit in the Members iteration).

### Turkish mobile rule (problem A)
- DB: new CHECK `applications_tr_mobile`: `phone !~ '^\+90' or phone ~ '^\+905[0-9]{9}$'`.
- **Production data first:** before generating the migration, count existing rows that would violate it. If any,
  add the constraint `not valid` (new rows checked, old rows untouched) and list those rows for staff to correct.
- App: the same rule in `src/lib/applications/schema.ts` with a specific error message ("Türkiye numarası 5 ile
  başlayan bir cep telefonu olmalı").

### Link to account (problem E)
Two security-definer RPCs, both requiring `applications.decide`:

- `public.linkable_accounts()` → pending profiles that have no application linked (`profile_id`) and no open/approved
  application matching their sign-in email: `id, full_name, avatar_url, email, created_at`, newest first. Needed
  because staff with `applications.decide` may lack `members.manage` (RLS would hide pending profiles and
  `member_contacts`). The list is small by nature (pending, unmatched sign-ups); it still paginates (keyset by
  `created_at, id`) per the project rule.
- `public.link_application(application_id uuid, target_id uuid)`: the application must have `profile_id is null` and
  status `new` / `contacted` / `approved`; the target must be `pending` with no linked application. Sets `profile_id`;
  if the application is approved, activates the profile (same function as above). Errors map to `P0002` (not found /
  not linkable) and `42501` (no permission).

Linking an application that is still under review is allowed: the account then activates on approval.

### Applicant's own status (problem D)
`public.my_application_status()` (security definer, `authenticated`) → the status of the caller's latest application,
found by `profile_id = auth.uid()` or, if none, by normalised sign-in email; `null` if none. Returns the status only —
applicants still cannot read the `applications` table.

### "Applied?" on the members list (problem D)
`public.pending_application_flags(profile_ids uuid[])` (security definer, requires `members.manage`) → for each
pending profile whether a linked or email-matching application exists (boolean only). Called for the page of members
being shown.

## 2. Screens

### Apply form (`/apply`, `src/components/apply/apply-form.tsx`, `src/lib/applications/actions.ts`)
- **Name** hint: "Kimliğindeki gibi ad ve soyadın." / "Your first and last name, as on your ID."
- **Email** hint: "Uygulamaya Google ile giriş yapacaksın. Giriş yapacağın Google hesabının e-postasını yaz."
  Soft, non-blocking warning under the field when the domain is not `gmail.com` / `googlemail.com`: "Bu adresle Google'a
  giriş yapabildiğinden emin misin? Emin değilsen Gmail adresini yaz."
- **Phone:** Turkish mobile rule (see above).
- **Signed in:** name and email prefilled from the account (still editable); the action stores `profile_id`. An
  **active** member sees "You're already a member" instead of the form; a pending account with an open application sees
  "Your application is under review".
  The form must stay prerenderable: session-dependent parts sit behind `<Suspense>` (Cache Components rules).
- **Success screen:** repeats the email: "Onaylanınca **x@icloud.com** Google hesabınla giriş yapacaksın. Bu adres
  yanlışsa bize WhatsApp'tan yaz." (Wording finalised in the plan, TR + EN.)

### Account page, pending (`/account`)
Uses `my_application_status()`:
- none → "Henüz başvurmadın" + button to `/apply` (prefilled, see above).
- `new` / `contacted` → "Başvurun inceleniyor".
- `rejected` → current generic pending text (no detail shown).
- `approved` can't occur for a pending account after the activation changes; fall back to the generic text.

### Sign-in page: in-app browsers (problem F)
- A small client component detects in-app browsers from `navigator.userAgent` (Instagram, Facebook `FBAN`/`FBAV`/
  `FB_IAB`, TikTok, LinkedIn; exact patterns verified and unit-tested in the plan). Detection runs in the browser, so
  the page stays static.
- When detected, show above the Google button: "Instagram'ın içindeki tarayıcıda Google girişi çalışmıyor. Sağ üstteki
  ⋯ menüsünden 'Tarayıcıda aç'ı seç." plus a **Copy link** button. On Android, also an **Open in Chrome** button
  (`intent://` URL); the iOS equivalent is researched in the plan and only added if it works reliably.
- The Google button stays (detection can miss or misfire).

### Application detail (`/admin/applications/[id]`)
- **Edit** contact fields (name, phone, email) for `applications.review` / `decide` holders: small inline form, same
  validation as the public form (shared Zod schema pieces).
- **Link to account** (`applications.decide`, application not linked and not rejected): dialog listing
  `linkable_accounts()` with avatar, name, sign-in email and sign-up date; accounts whose name resembles the
  applicant's are sorted first (simple normalised-token match in the app, no DB extension). Confirm → `link_application`.

### Applications list (`/admin/applications`)
New filter **"Onaylandı, giriş yapmadı"** (approved and `profile_id is null`), using the existing keyset pagination
and showing its count.

### Members list (`/admin/members`)
- Pending rows show a badge **"Başvurdu"** / **"Başvurusu yok"** from `pending_application_flags()`.
- **Edit name** action for `members.manage` holders (`set_member_name`).

## 3. Error handling
Server Actions validate with Zod, let RLS/RPCs decide, map codes to results as in `src/lib/access/actions.ts`
(`42501` forbidden, `23505` duplicate, `23514`/`P0002`/`23503` invalid) and call `refresh()` after success. No personal
data in logs (only error codes).

## 4. Testing
- **pgTAP** (first, before code) for every rule, including the must-fail cases:
  - anon cannot set `profile_id`; authenticated can only set their own; one open application per account;
  - Turkish mobile CHECK accepts `+905…`, rejects `+904…`, ignores non-`+90` numbers;
  - corrections: review/decide may update name/phone/email, others may not; email is normalised;
  - activation by `profile_id`, by email, after email correction; never touches active/inactive; copies the name;
  - `link_application` / `linkable_accounts`: permission, not-linkable cases (already linked, rejected, target not
    pending, target already linked);
  - `my_application_status`: own only; `pending_application_flags`: requires `members.manage`;
  - `set_member_name`: requires `members.manage`, length check.
- **Unit tests:** phone rule, non-Gmail warning, in-app browser detection, name-similarity sort.
- **Browser E2E (local):** anonymous apply with iCloud email → sign in with another account → link from the
  application page → member active with the application's name; signed-in apply links immediately; pending account
  without application sees the CTA; in-app notice with an Instagram user agent.

## 5. Rollout
Standard: merge → `db push --dry-run` → check production rows against the mobile rule → `db push` →
`test db` on production → push `main`. Update `docs/application-form.md` (email/name hints, mobile rule, signed-in
linking) and `docs/PLAN.md` (flow + decisions above). Learnings: Google `disallowed_useragent` in in-app browsers.

## Not in scope
- **Members without a Google account:** they create one (done for the first case). SMS/phone sign-in needs a paid SMS
  provider and Turkish sender registration; revisit only if it recurs.
- **Applicants editing their own application** (staff correct it instead).
- **Retention of pending accounts that never apply** (KVKK minimisation): note in PLAN.md as a follow-up.
- **History of staff corrections:** `updated_at` only for now.
