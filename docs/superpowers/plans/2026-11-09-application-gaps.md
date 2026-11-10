# Application Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staff can correct application/member data and connect applications to accounts in the app (no more SQL),
and the form, account page and sign-in page prevent or surface the common mismatches.

**Architecture:** Database first: `applications.profile_id` becomes "the account this application belongs to" (set at
signed-in submission, by staff linking, or by the existing email match), activation prefers it, and a few
security-definer RPCs expose exactly what staff/applicants need. The app then adds small, focused UI pieces on existing
screens. Pure logic (phone rule, Gmail check, name matching, in-app browser detection) lives in dependency-free
modules with `node --test` unit tests.

**Tech Stack:** Supabase Postgres (declarative schemas, RLS, pgTAP), Next.js 16 App Router (Cache Components),
next-intl, Zod 4, shadcn/ui (base-nova, Base UI `render` prop).

**Spec:** `docs/superpowers/specs/2026-11-09-application-gaps-design.md`

## Global Constraints

- Branch `feat/application-gaps`; Conventional Commits; author `iltan <iltancanerr@gmail.com>`; **never add
  `Co-Authored-By` or any attribution trailer.**
- DB workflow: edit `supabase/schemas/*.sql` → `pnpm db:migration <name>` → review the generated file (security lines!)
  → `pnpm db:reset` → `pnpm db:test` → `pnpm db:types` → commit schema + migration + types + tests together.
- pgTAP: fixture emails on `@pgtap.invalid`, fixture UUIDs unique per file, scope every count/update to fixtures,
  must-fail cases included (`docs/learnings/supabase.md`). Write the tests before the schema change and see them fail.
- New RPCs: `security definer`, `set search_path = ''`, fully qualified names, `revoke all … from public, anon`,
  `grant execute … to authenticated`. Errors: `42501` no permission, `P0002` not found / not linkable, `23514` invalid.
- No `private.*` function in an index on `applications` (anon writes it).
- Every UI string in `messages/tr.json` **and** `messages/en.json` (TR is the source of truth). No CSS `uppercase` on
  brand/English words. Links/navigation from `@/i18n/navigation`.
- Request-time data (`getCurrentUser()`, cookies) only inside `<Suspense>`; never at the top of a page/layout.
- Server Actions: Zod-validate, let RLS/RPC decide, map codes like `src/lib/access/actions.ts`, `refresh()` after
  success, log only error codes (KVKK).
- Every list paginates (keyset via `src/lib/pagination.ts`, `PAGE_SIZE` = 25).
- Unit-tested modules must be dependency-free: no `@/` imports, relative imports with `.ts` extension.
- Run `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test` before each commit touching code; `pnpm build` at the end.

**Decision vs. spec:** the Turkish mobile rule is enforced in a trigger (on insert and when `phone` changes), not as a
table CHECK. Same effect for new data; old production rows that would violate it don't block the migration and stay
editable (an email-only correction doesn't trip on a legacy phone). No production data check is needed before rollout.

## Review Focus

1. **A pending account that already has a linked open application visits `/apply`** → sees "under review", not the
   form; if it bypasses the page, the insert fails with `23505` → "duplicate" message. (Task 1 test + Task 4 E2E.)
2. **Staff correct only the email of a legacy application whose phone breaks the new mobile rule** → the update
   succeeds (rule only checked when `phone` changes). (Task 1 test.)
3. **Linking an application to an account that is already `active`** (e.g. existing member) → refused with `P0002`;
   linking never activates or changes `active` / `inactive` accounts. (Task 2 test.)
4. **Name matching with Turkish letters and case** ("ŞEYMA ÖZTÜRK" vs "seyma ozturk", dotted/dotless i) → ranked as a
   match. (Task 3 test.)
5. **Desktop Chrome / iOS Safari / WhatsApp-opened browser** → no in-app notice (no false positives). (Task 3 test.)

---

### Task 1: DB — application ownership, activation by account, corrections, mobile rule

**Files:**
- Modify: `supabase/schemas/20_applications.sql`
- Create: `supabase/tests/database/application_ownership.test.sql`
- Modify: `supabase/tests/database/applications.test.sql:181-185` (reviewer edit test)
- Generated: `supabase/migrations/<ts>_application_ownership.sql`, `src/lib/supabase/database.types.ts`

**Interfaces:**
- Produces: `applications.profile_id` insertable by `authenticated` (own id only); unique open application per
  `profile_id`; `authenticated` may update `full_name, phone, email` (RLS: review/decide); activation function
  `private.activate_from_approved_application(uuid)` now matches `profile_id` first and copies `full_name` to the
  profile; approval/email-correction trigger re-runs activation; error `23514` with constraint name
  `applications_tr_mobile` for a `+90` number that isn't `+905` + 9 digits.

- [ ] **Step 1: Write the failing pgTAP tests** in `application_ownership.test.sql` (reuse the `pg_temp.login` /
  `pg_temp.apply` helper pattern from `approval.test.sql`; fixture ids `…0003xx`). Assertions:
  - anon insert with `profile_id` set → `42501`;
  - authenticated pending user inserts with `profile_id = own id` → lives; with another user's id → `42501`
    (RLS `with check`);
  - second open application with the same `profile_id` (different email) → `23505`;
  - insert with phone `+904001234567` → `23514`; `+905001234567` → lives; `+4915112345678` → lives;
  - insert with email `' Ali@Example.COM '` → stored as `ali@example.com` (unchanged behaviour);
  - as reviewer (view + review): `update … set full_name = 'Gerçek Ad', phone = '+905321112233', email = 'NEW@pgtap.invalid'`
    → lives; email stored lowercased; `update … set phone = '+904441112233'` → `23514`;
  - legacy row: insert a valid application, then as postgres plant phone `+904001234567` with
    `set local session_replication_role = replica; update …; set local session_replication_role = origin;`
    (skips triggers without the table lock `alter table … disable trigger` would hold on production test runs) →
    reviewer updates only `email` → lives;
  - reviewer `update … set district = 'X'` → `42501` (other answers stay staff-read-only);
  - signed-in application (profile_id set, email differs from sign-in email) approved by decider → profile `active`
    and `profiles.full_name` = application `full_name`;
  - approved application (anon, email `wrong@pgtap.invalid`), pending account `right@pgtap.invalid`; reviewer sets
    application email to `right@pgtap.invalid` → account `active`, application `profile_id` = account;
  - approved application whose matching account is `inactive` → stays `inactive`, name unchanged.

- [ ] **Step 2: Update `applications.test.sql`:** the "reviewers cannot edit applicant answers" case now updates
  `district` (still `42501`); keep the `plan()` count right.

- [ ] **Step 3: Run `pnpm db:test`** — expected: new file FAILS (grants/triggers missing), others pass.

- [ ] **Step 4: Change `supabase/schemas/20_applications.sql`:**
  - comment on `profile_id`: "The account this application belongs to: set when submitted while signed in, when staff
    link it, or when an approved application is matched by email."
  - `create unique index applications_open_profile_key on public.applications (profile_id) where status in ('new', 'contacted') and profile_id is not null;`
  - Move email normalisation and the mobile rule into `private.applications_normalize_contact()`, trigger
    `applications_normalize_contact before insert or update of phone, email`: trim+lowercase email; if
    `TG_OP = 'INSERT' or new.phone is distinct from old.phone` and `new.phone like '+90%'` and
    `new.phone !~ '^\+905[0-9]{9}$'` → `raise exception … using errcode = '23514', constraint = 'applications_tr_mobile'`.
    `applications_before_insert` keeps only the 18+ check.
  - `activate_from_approved_application`: select `a.full_name` too; match `a.profile_id = target_profile` first
    (ordered as today), else the existing email match with `a.profile_id is null`; set `full_name = app.full_name` in
    the profile update; only set `profile_id` when it was null.
  - `applications_after_approval`: if `new.profile_id is not null` → activate that profile, else the email loop as
    today. Trigger becomes `after update of status, email … when (new.status = 'approved' and (old.status is distinct
    from new.status or old.email is distinct from new.email))`.
  - Grants: `insert (…, profile_id)` to `authenticated` only (separate `grant insert (profile_id)` line; `anon` keeps
    the current list); `grant update (status, admin_notes, full_name, phone, email)`.
  - Insert policy: split into `to anon … with check (status = 'new')` (unchanged semantics) and
    `to authenticated … with check (status = 'new' and (profile_id is null or profile_id = (select auth.uid())))`.
  - Revoke the new trigger function from `public, anon, authenticated`.

- [ ] **Step 5: `pnpm db:migration application_ownership`**, review the file (grants per column, policies replaced,
  no data loss), `pnpm db:reset`, `pnpm db:test` → all PASS, `pnpm db:types`.

- [ ] **Step 6: Commit** — `feat(db): applications belong to accounts; staff contact corrections; Turkish mobile rule`

---

### Task 2: DB — linking and status RPCs

**Files:**
- Modify: `supabase/schemas/20_applications.sql` (application RPCs), `supabase/schemas/10_profiles.sql` (`set_member_name`)
- Create: `supabase/tests/database/account_linking.test.sql`
- Generated: migration `<ts>_account_linking.sql`, `database.types.ts`

**Interfaces:**
- Consumes: Task 1 activation behaviour.
- Produces (all `security definer`, granted to `authenticated`):
  - `public.link_application(application_id uuid, target_id uuid) returns void` — needs `applications.decide`.
    Application must exist with `profile_id is null` and status ≠ `rejected`; target must be `pending` and have no
    application with `profile_id = target_id`; else `P0002`. Sets `profile_id`; if approved, calls
    `private.activate_from_approved_application(target_id)`.
  - `public.linkable_accounts(search text default null, after_created timestamptz default null, after_id uuid default null)
    returns table (id uuid, full_name text, avatar_url text, email text, created_at timestamptz)` — needs
    `applications.decide`. Pending profiles with no application linked by `profile_id` and no `new`/`contacted`/`approved`
    application (with `profile_id is null`) whose normalised email equals theirs; optional `search` = case-insensitive
    contains on name or email; order `created_at desc, id desc`; keyset `(created_at, id) < (after_created, after_id)`;
    `limit 26` (PAGE_SIZE + 1).
  - `public.my_application_status() returns public.application_status` — caller's latest application by
    `profile_id = auth.uid()`, else latest with `profile_id is null` matching their normalised sign-in email; null if none.
  - `public.pending_application_flags(profile_ids uuid[]) returns table (profile_id uuid, has_application boolean)` —
    needs `members.manage`; true when a `new`/`contacted`/`approved` application is linked to or email-matches the profile.
  - `public.set_member_name(target_id uuid, new_name text) returns void` — needs `members.manage`; trims; length
    2–120 else `23514`; only admins may rename an admin (same rule as `set_member_status`); `P0002` if not found.

- [ ] **Step 1: Write failing pgTAP tests** (`account_linking.test.sql`, fixture ids `…0004xx`) — for each RPC the
  allowed case and the must-fail cases:
  - `link_application`: decider links approved anon application to pending account → account `active`, name copied;
    links a `contacted` application → account stays `pending`, later approval activates; reviewer (no decide) →
    `42501`; already-linked application → `P0002`; rejected application → `P0002`; `active` target → `P0002`; target
    already linked to another application → `P0002`.
  - `linkable_accounts`: decider sees the unmatched pending fixture; does not see a pending account whose email matches
    an open application, an account already linked, or an active member; `search` filters by name and by email;
    reviewer and plain member → `42501`; keyset arguments return the next rows.
  - `my_application_status`: own linked application → its status; email-matched one → its status; someone else's
    application → null; no application → null.
  - `pending_application_flags`: members.manage sees `true`/`false` correctly for two fixtures; decider without
    members.manage → `42501`.
  - `set_member_name`: manager renames a member (trimmed); `'x'` → `23514`; manager renaming an admin → `42501`;
    plain member → `42501`; unknown id → `P0002`.
- [ ] **Step 2: Run `pnpm db:test`** — expected: FAIL (functions missing).
- [ ] **Step 3: Implement the five functions** in the schema files listed above, with revokes/grants.
- [ ] **Step 4: `pnpm db:migration account_linking`**, review, `pnpm db:reset`, `pnpm db:test` → PASS, `pnpm db:types`.
- [ ] **Step 5: Commit** — `feat(db): link applications to accounts, applicant status and staff name corrections`

---

### Task 3: Pure logic modules with unit tests

**Files:**
- Create: `src/lib/applications/contact.ts`, `src/lib/applications/contact.test.ts`
- Create: `src/lib/applications/name-match.ts`, `src/lib/applications/name-match.test.ts`
- Create: `src/lib/auth/in-app-browser.ts`, `src/lib/auth/in-app-browser.test.ts`

**Interfaces:**
- Produces:
  - `isTurkishMobileOrForeign(e164: string): boolean` — false only for `+90…` not matching `^\+905\d{9}$`.
  - `isGoogleMailAddress(email: string): boolean` — domain (lowercased, trimmed) is `gmail.com` or `googlemail.com`.
  - `nameMatchScore(a: string, b: string): number` — count of shared tokens after normalising: `toLocaleLowerCase("tr")`,
    map `ç→c ğ→g ı→i i̇→i ö→o ş→s ü→u`, strip other diacritics (NFD), split on non-letters, ignore tokens < 2 chars.
  - `sortByNameMatch<T>(items: T[], name: string, getName: (item: T) => string): T[]` — stable, highest score first.
  - `detectInAppBrowser(userAgent: string): "Instagram" | "Facebook" | "TikTok" | "LinkedIn" | null` —
    patterns `/Instagram/`, `/FBAN|FBAV|FB_IAB/`, `/musical_ly|BytedanceWebview|TikTok/i`, `/LinkedInApp/`.
  - `isAndroid(userAgent: string): boolean`.
  - `chromeIntentUrl(url: string): string` — `intent://<host><path><search>#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=<encoded url>;end`.

- [ ] **Step 1: Write the failing tests:**
  - phone: `+905001234567` true; `+904001234567` false; `+90500123456` false; `+4915112345678` true.
  - Gmail: `Ali@GMAIL.com ` true, `a@googlemail.com` true, `a@icloud.com` false, `a@gmail.com.tr` false.
  - names: score(`"ŞEYMA ÖZTÜRK"`, `"seyma ozturk"`) = 2; score(`"İlkay Işık"`, `"ilkay isik"`) = 2;
    score(`"Ali Veli"`, `"Mehmet Can"`) = 0; `sortByNameMatch` puts `"Seyma O."` before `"Ahmet Kaya"` for
    `"Şeyma Öztürk"` and keeps original order on ties.
  - in-app: Instagram iOS UA (`… Mobile/15E148 Instagram 332.0.0.16.110 (iPhone16,2; iOS 17_5_1; …)`) → `"Instagram"`;
    Facebook iOS `[FBAN/FBIOS;FBAV/…]` and Android `[FB_IAB/FB4A;FBAV/…]` → `"Facebook"`; TikTok Android UA with
    `musical_ly_` → `"TikTok"`; desktop Chrome, iOS Safari 17, Android Chrome → `null`; `isAndroid` true/false
    on the Android/iOS samples; `chromeIntentUrl("https://ridevibe.com.tr/sign-in?next=%2Fapply")` →
    `intent://ridevibe.com.tr/sign-in?next=%2Fapply#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fridevibe.com.tr%2Fsign-in%3Fnext%3D%252Fapply;end`.
- [ ] **Step 2: `pnpm test`** → the three new files FAIL (modules missing).
- [ ] **Step 3: Implement the modules.**
- [ ] **Step 4: `pnpm test`** → PASS; `pnpm lint`, `pnpm exec tsc --noEmit`.
- [ ] **Step 5: Commit** — `feat: phone, email, name-match and in-app browser helpers`

---

### Task 4: Apply form — hints, mobile rule, signed-in prefill and linking, success screen

**Files:**
- Modify: `src/lib/applications/schema.ts` (phone refine, new error key), `src/lib/applications/actions.ts`
- Modify: `src/components/apply/apply-form.tsx`, `src/app/[locale]/apply/page.tsx`
- Create: `src/components/apply/apply-gate.tsx` (server component)
- Modify: `messages/tr.json`, `messages/en.json` (`Apply.*`)

**Interfaces:**
- Consumes: `isTurkishMobileOrForeign`, `isGoogleMailAddress` (Task 3); RPC `my_application_status` (Task 2);
  `profile_id` insert (Task 1).
- Produces: `ApplyForm({ defaults }: { defaults?: { fullName: string; email: string } })`;
  `getMyApplicationStatus(): Promise<ApplicationStatus | null>` in `src/lib/applications/queries.ts` (also used by Task 5).

- [ ] **Step 1: Schema:** add `"notTurkishMobile"` to `ApplyErrorKey`; phone pipe gets
  `.refine(isTurkishMobileOrForeign, err("notTurkishMobile"))` after the possible-number check.
- [ ] **Step 2: Action:** read the session with `supabase.auth.getClaims()`; when signed in, insert with
  `profile_id: claims.sub` (never from form data). `23505` still maps to `duplicate`.
- [ ] **Step 3: Gate:** `ApplyGate` (inside the page's existing `<Suspense>`) calls `getCurrentUser()`:
  signed out → `<ApplyForm />`; `profile.status === "active"` → card "Apply.alreadyMember" with link home; pending and
  `getMyApplicationStatus()` is `new`/`contacted` → card "Apply.underReview"; otherwise
  `<ApplyForm defaults={{ fullName: profile.full_name, email: user.email ?? "" }} />`.
- [ ] **Step 4: Form:**
  - `full_name` and `email` inputs get `defaultValue` from `defaults`.
  - Hints: new `fields.fullNameHint` "Kimliğindeki gibi ad ve soyadın." / "Your first and last name, as on your ID.";
    `fields.emailHint` → "Uygulamaya Google ile giriş yapacaksın. Giriş yapacağın Google hesabının e-postasını yaz." /
    "You'll sign in to the app with Google. Enter the email of the Google account you'll use."
  - Under the email field, while the value is a syntactically valid email and `!isGoogleMailAddress(value)`, show
    `fields.emailNotGmail` (not an error, `FieldDescription` styling with `text-accent-text`): "Bu adresle Google'a giriş
    yapabildiğinden emin misin? Emin değilsen Gmail adresini yaz." / "Are you sure you can sign in to Google with this
    address? If not, use your Gmail address." Track the value with `onChange` state on that input only.
  - `errors.notTurkishMobile`: "Türkiye numarası 5 ile başlayan bir cep telefonu olmalı (WhatsApp)." / "A Turkish number
    must be a mobile number starting with 5 (WhatsApp)."
  - Success card: keep the email that was submitted in state; body adds `successEmail` "Onaylanınca **{email}** Google
    hesabınla giriş yapacaksın. Bu adres yanlışsa bize WhatsApp'tan yaz." / "Once approved, you'll sign in with the
    **{email}** Google account. If this address is wrong, message us on WhatsApp." (rich text `<b>` via `t.rich`).
  - New card copies: `alreadyMember` (title + body) and `underReview` (title + body), TR + EN.
- [ ] **Step 5: Verify:** `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm build` (Cache Components: `/apply`
  must still prerender its shell). Local browser check (testing.md): anonymous submit with `+90 454 578 13 98` shows
  the mobile error; iCloud email shows the warning; success shows the email; signed-in pending user sees prefilled
  name/email, submits, row has `profile_id`; revisiting `/apply` shows "under review".
- [ ] **Step 6: Commit** — `feat(apply): mobile rule, clearer name/email hints, signed-in applications link to the account`

---

### Task 5: Account page — pending states

**Files:**
- Modify: `src/app/[locale]/account/page.tsx`, `messages/tr.json`, `messages/en.json` (`Account.*`)

**Interfaces:**
- Consumes: `getMyApplicationStatus()` (Task 4).

- [ ] **Step 1:** For `profile.status === "pending"`: status null → card `Account.notAppliedTitle` "Henüz başvurmadın" /
  "You haven't applied yet", body `notAppliedBody` "Üye olmak için başvuru formunu doldur. Bilgilerin hazır gelecek." /
  "Fill in the application form to become a member. Your details are filled in for you." and a `Link` styled with
  `buttonVariants()` to `/apply` (`Account.applyNow` "Başvur" / "Apply"); `new`/`contacted` → `underReviewTitle` /
  `underReviewBody` ("Başvurun inceleniyor" … "Onaylandığında hesabın otomatik olarak aktif olur."); anything else →
  the current `pendingTitle`/`pendingBody`.
- [ ] **Step 2: Verify** lint/tsc/build; browser: pending test user without application sees the CTA → `/apply`
  prefilled; after submitting, `/account` shows "under review".
- [ ] **Step 3: Commit** — `feat(account): pending members see whether they still need to apply`

---

### Task 6: Sign-in page — in-app browser notice

**Files:**
- Create: `src/components/auth/in-app-browser-notice.tsx` (client)
- Modify: `src/app/[locale]/sign-in/page.tsx`, `messages/tr.json`, `messages/en.json` (`Auth.inApp.*`)

**Interfaces:**
- Consumes: `detectInAppBrowser`, `isAndroid`, `chromeIntentUrl` (Task 3).

- [ ] **Step 1:** `InAppBrowserNotice` reads `navigator.userAgent` with `useSyncExternalStore` (server snapshot `""`,
  so nothing renders on the server and the page stays static). When `detectInAppBrowser` returns an app name, render
  an alert card above the Google button:
  - `Auth.inApp.title` "{app} içinde Google girişi çalışmıyor" / "Google sign-in doesn't work inside {app}";
  - `Auth.inApp.body` "Google, uygulama içi tarayıcılarda girişe izin vermiyor. Sağ üstteki ⋯ menüsünden
    \"Tarayıcıda aç\"ı seç ya da bağlantıyı kopyalayıp Safari/Chrome'a yapıştır." / English equivalent;
  - button `Auth.inApp.copy` "Bağlantıyı kopyala" / "Copy link" → `navigator.clipboard.writeText(location.href)`,
    then label `Auth.inApp.copied` "Kopyalandı" / "Copied";
  - Android only: link-styled button `Auth.inApp.openChrome` "Chrome'da aç" / "Open in Chrome" with
    `href={chromeIntentUrl(location.href)}`.
  No iOS "open in Safari" button (no reliable, testable mechanism). The Google button stays.
- [ ] **Step 2: Verify** lint/tsc/build; headless Chrome with `--user-agent` set to the Instagram iOS and Android
  samples from Task 3 shows the notice (Android also the Chrome button); default UA shows nothing.
- [ ] **Step 3: Commit** — `feat(auth): explain how to leave in-app browsers before Google sign-in`

---

### Task 7: Application detail — correct contact fields and link to account

**Files:**
- Modify: `src/lib/applications/review-actions.ts`, `src/lib/applications/queries.ts`
- Create: `src/components/admin/application-contact-editor.tsx`, `src/components/admin/link-account-dialog.tsx`
- Modify: `src/app/[locale]/admin/applications/[id]/page.tsx`, `src/components/admin/application-review-panel.tsx`
- Modify: `messages/tr.json`, `messages/en.json` (`Admin.review.*`, `Admin.contactEdit.*`, `Admin.link.*`)

**Interfaces:**
- Consumes: Task 1 update grants; Task 2 `link_application`, `linkable_accounts`; Task 3 `sortByNameMatch`.
- Produces:
  - `saveApplicationContact(id: string, values: { full_name: string; phone: string; email: string }): Promise<ApplicationContactResult>`
    where `ApplicationContactResult = AccessActionResult | { status: "invalid"; fieldErrors: Record<string, ApplyErrorKey> }`;
    validates with `contactSchema`, a new export of `schema.ts`: `z.object({ full_name, phone, email })` built from the
    same field definitions as `applicationSchema` (extract them into shared constants); DB `23514` → `invalid`.
  - `findLinkableAccounts(input: { search?: string; cursor?: string | null }): Promise<{ items: LinkableAccount[]; nextCursor: string | null } | { status: "forbidden" | "error" }>`
    (cursor encoded with `src/lib/pagination.ts` helpers).
  - `linkApplication(applicationId: string, profileId: string): Promise<AccessActionResult>` (`P0002` → `invalid`).

- [ ] **Step 1: Actions and query** as above (in `review-actions.ts`; types next to them).
- [ ] **Step 2: Contact editor** (shown to `canReview || canDecide`): "Düzenle" / "Edit" button in the "About you"
  section opens an inline form with name, phone (`PhoneField`), email; Save/Cancel; field errors via `Apply.errors.*`;
  success closes it (page refreshes via `refresh()`).
- [ ] **Step 3: Link dialog** (shown to `canDecide` when the application has no `profile_id` and isn't rejected):
  button `Admin.link.open` "Hesaba bağla" / "Link to account" → dialog with search input (name or email), list of
  accounts (avatar, name, sign-in email, sign-up date) sorted with `sortByNameMatch(items, application.full_name, a => a.full_name)`
  per page, "Daha fazla" / "More" for the next cursor, empty state `Admin.link.empty`. Picking one asks for
  confirmation `Admin.link.confirm` "{application} başvurusu {account} hesabına bağlansın mı? Başvuru onaylıysa hesap
  aktif olur." and calls `linkApplication`.
- [ ] **Step 4: Panel texts:** show `review.linked` whenever `member` is set (any status), e.g. "Hesap bağlı: {name}";
  update `review.notLinked` to "Henüz giriş yapmadı. Davet mesajını gönder; başvurudaki e-postayla giriş yaptığında
  otomatik olarak aktif olur. Farklı bir Google hesabıyla girdiyse “Hesaba bağla” ile bağla." (+ EN), and
  `review.approveBody` to mention linking instead of the members page.
- [ ] **Step 5: Verify** lint/tsc/build; browser as `reviewer@test.local`: edit phone to `+90 454…` → mobile error,
  valid edit saves; no "Link" button. As `admin@test.local`: approved application with iCloud email + pending Gmail
  test account → link → member active with the application's name; dialog search and "More" work with 30 seeded
  pending users (testing.md), then delete them.
- [ ] **Step 6: Commit** — `feat(admin): correct applicant contact details and link applications to accounts`

---

### Task 8: Applications list — "approved, not signed in" filter

**Files:**
- Modify: `src/lib/applications/queries.ts`, `src/app/[locale]/admin/applications/page.tsx`, messages (`Admin.statuses.unlinked`)

**Interfaces:**
- Produces: `APPLICATION_FILTERS = [...APPLICATION_STATUSES, "unlinked"] as const`, `type ApplicationFilter`;
  `listApplications(filter: ApplicationFilter, cursor?)` — `unlinked` = `status = 'approved'` and `profile_id is null`;
  `countApplicationsByStatus()` returns counts for all filters.

- [ ] **Step 1:** Implement; nav renders a tab per filter; `Admin.statuses.unlinked` "Giriş yapmadı" / "Not signed in".
  `?status=unlinked` is accepted by the page; other values fall back to `new` as today. Any other user of
  `Admin.statuses` (`t(\`statuses.${status}\`)` on the detail page) still receives only real statuses.
- [ ] **Step 2: Verify** lint/tsc/build; browser: count and list match an approved-unlinked fixture; linking it removes it.
- [ ] **Step 3: Commit** — `feat(admin): filter approved applicants who haven't signed in yet`

---

### Task 9: Members list — "applied?" badge and name correction

**Files:**
- Modify: `src/lib/access/queries.ts`, `src/lib/access/actions.ts`, `src/components/admin/member-row.tsx`,
  `src/app/[locale]/admin/members/page.tsx`, messages (`Admin.members.*`)
- Create: `src/components/admin/member-name-dialog.tsx`

**Interfaces:**
- Consumes: Task 2 `pending_application_flags`, `set_member_name`.
- Produces: `getPendingApplicationFlags(ids: string[]): Promise<Map<string, boolean>>`;
  `setMemberName(targetId: string, name: string): Promise<AccessActionResult>`; `MemberRow` gets
  `member.applied?: boolean | null` (null/undefined = not shown) and `canRename: boolean`.

- [ ] **Step 1:** On the pending tab, fetch flags for the page's ids and pass `applied`. Badge
  `Admin.members.applied` "Başvurdu" / "Applied" (`variant="status"`) or `Admin.members.notApplied` "Başvurusu yok" /
  "No application" (`variant="outline"`). Update `pendingHint`: "…Başvurusu olanları başvuru sayfasından “Hesaba bağla”
  ile bağla; başvurusu yoksa kişiden formu doldurmasını iste." (+ EN).
- [ ] **Step 2:** "Adı düzenle" / "Edit name" action (`canRename` = `members.manage` and, for admin targets, caller is
  admin) opens `MemberNameDialog` (input 2–120 chars, Save) → `setMemberName`; errors via `Admin.accessErrors.*`.
- [ ] **Step 3: Verify** lint/tsc/build; browser as admin: badges correct for a pending user with and without an
  application; rename works; organizer without members.manage can't reach the page (unchanged).
- [ ] **Step 4: Commit** — `feat(admin): show who applied among pending sign-ups; staff can correct member names`

---

### Task 10: Docs, learnings, full verification

**Files:**
- Modify: `docs/application-form.md`, `docs/PLAN.md`, `docs/learnings/security.md` (or the auth-related file per
  `docs/learnings/README.md`), `docs/learnings/supabase.md` if anything new came up.

- [ ] **Step 1: Docs:** application-form.md — name hint, email hint + non-Gmail warning, Turkish mobile rule,
  signed-in applications linked to the account, status `draft v2` note unchanged. PLAN.md — application flow now
  includes linking/pending CTA/in-app notice; follow-up "retention of pending accounts that never apply (KVKK)".
- [ ] **Step 2: Learning entry:** "Google blocks OAuth in in-app browsers (2026-11-09)" — Symptom `403
  disallowed_useragent` from Instagram/Facebook/TikTok; Cause: Google's embedded-webview policy; Do: detect UA and
  tell users to open Safari/Chrome (`src/components/auth/in-app-browser-notice.tsx`); never force sign-in before the
  public form. Source: Auth0/Memberstack community reports (spec sources).
- [ ] **Step 3: Full verification:** `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm db:test`, `pnpm build`;
  browser E2E of the spec's §4 flows at 390×844.
- [ ] **Step 4: Commit** — `docs: application gaps — form spec, plan and learnings`
