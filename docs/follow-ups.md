# Follow-ups

The single backlog for everything that was consciously **not** done: open decisions, deferred features, parked edge
cases, polish and tech debt. Every session reads it before planning, and every iteration adds what it defers (review
findings marked minor/deferred/parked, "out of scope" items, ideas) **in the same commit as the work**. Remove an item
when it is done or dropped (say which in the commit message). Bigger roadmap items live in `docs/PLAN.md`; this file
holds the rest and links there.

Item format: `- **Title** (YYYY-MM-DD, origin) — what and where. Why deferred / risk if left.`

## Next up (iltan asked for these; in priority order; start in a new session)

- **Deleted account stays signed in until its token expires** (2026-11-11, iltan found it after deleting a test
  account) — `getClaims()` verifies the ES256 JWT locally and never asks Auth whether the user still exists, so the
  browser looks signed in for up to `jwt_expiry` (1 h); the refresh then fails (sessions are deleted). The DB grants
  nothing (rights hang on the deleted profile row; an application insert fails on the `profile_id` FK). Agreed fix
  (option A, small fix → `fix/` branch, test first): in `getCurrentUser` (`src/lib/auth/user.ts`) a verified token
  without a profile row counts as signed out (every account gets its profile in the sign-up transaction); add a
  line to the CLAUDE.md account-deletion procedure. Rejected: shorter `jwt_expiry` (more refreshes for everyone), a
  profile lookup in the proxy (a DB query per request).
- **Hide "Başvur" for people who applied or are members** (2026-11-11, iltan's idea) — short design round first:
  who sees it (visitors and signed-in users without an application: yes; active members: no; pending with an open
  application: hide or turn into an application-status item; inactive?), what fills the 5th phone tab, and how a
  session-dependent item stays in the static nav without a layout shift (cookie hint like the user-menu skeleton).
  Overlaps "Navigation review once events exist".
- **Own "install the app" prompt** (2026-11-11, iltan: people close the browser's install pop-up) — design round
  first, after the "Başvur" one. Android + Chrome/Edge desktop: catch `beforeinstallprompt`, suppress the browser's
  pop-up, show our own card/button (one tap → system install dialog). iPhone/iPad: no programmatic install (Safari
  has no `beforeinstallprompt`, WebKit WONTFIX) → own short "Paylaş → Ana Ekrana Ekle" guide; since iOS 26 every
  Home Screen site opens as a web app. In-app browsers: existing "open in browser" notice first. Never ask when
  already installed (`display-mode: standalone`); remember dismissals, re-ask later. Moments: after approval / first
  sign-in, a member home card, the avatar menu. Strongest pitch is notifications (iOS Web Push only works for Home
  Screen apps) → decide whether it ships with the service worker + Web Push. Watch Chrome's Web Install API /
  `<install>` element (origin trial 2026, not stable). Native apps not needed (a TWA could put the PWA on Play Store
  if ever wanted; Apple rejects thin wrappers). Sources: MDN BeforeInstallPromptEvent, caniuse, WebKit bug 193959,
  heise (iOS 26), developer.chrome.com/blog/install-element-ot (checked 2026-11-11).
- **Safety data (2a′)** (2026-11-10, iltan) — next step after Members in `docs/PLAN.md`: emergency contact, blood type
  with explicit consent (special-category data), plate per bike, a new `members.safety`-style permission, separate
  consents and the privacy text. Through the usual design → plan → build flow.
- **List UX iteration: instant filtering, clean URLs, page numbers, caching** (2026-11-10, iltan, after testing
  `/members`) — applies to `/members` and the admin lists (`/admin/members`, `/admin/applications`). Design first;
  points iltan raised:
  - **Feels like a reload:** a side chip or a name search goes back to the server and waits. Wanted: instant results
    from data already loaded. Options to weigh: load all active members once and filter on the client (≈150–300 rows
    is small, but it conflicts with the "every list paginates" rule, so that rule needs a decision), or keep server
    filtering with transitions, a debounced search-as-you-type and the old list kept visible while loading.
  - **Empty `?q=`:** clearing the search leaves `?q=` in the URL; drop empty params.
  - **Cursor in the URL** (`?cursor=…`) looks bad. Page numbers (`?page=14`) would fix this and the next point.
  - **Pagination design and logic:** with 300+ members you have to press "next" 13 times to reach page 14. Wanted:
    numbered pages / jump to page (or another pattern, e.g. "load more"); offset pagination is fine at this size but
    replaces the keyset convention in CLAUDE.md, so decide it explicitly. Also restyle the pager.
  - **Caching:** e.g. Next 16 `use cache` + `cacheTag` for directory data (the same for every active member;
    invalidate on profile/bike changes with `updateTag`), keeping the auth check outside the cached part.


## Open decisions (need iltan)

- **Dead-code tool?** (2026-11-11, iltan) — which tool, if any, for the dead-code sweep (Tooling). Candidates to
  compare when we talk: `knip` (unused files, exports, dependencies; Next.js plugin), `ts-prune`/`ts-unused-exports`
  (exports only), TypeScript's `noUnusedLocals`/`noUnusedParameters` and ESLint rules (locals only), or no tool (manual
  search). Research current status/maintenance before recommending; installing anything needs iltan's OK.

- **Vercel Web Analytics and Speed Insights?** (2026-11-10, iltan asked) — Claude's recommendation: **add Web
  Analytics** (page views, referrers, the Instagram-ad funnel; cookieless, data anonymised with a daily-rotating request
  hash; Hobby includes 50,000 events/month, collection pauses (no bill) when exceeded) and **skip Speed Insights for
  now** (Hobby free tier: 10,000 events per 30 days and only the overall score with 24 h / 7 day ranges; Core Web
  Vitals detail needs Pro). If added: mention Vercel analytics in the privacy notice (Vercel is already listed as a
  processor). Sources: vercel.com/docs/analytics, /docs/analytics/limits-and-pricing,
  /docs/speed-insights/limits-and-pricing (checked 2026-11-10). If added, also measure the application funnel on
  `/apply` (opened → each step → sent; 2026-11-11, apply-steps).

- **Ban evasion vs. linking** (2026-11-09, application gaps) — when the ban list is built (PLAN "Member conduct"),
  check new applications *and* staff links (`link_application`) against it.
- **Privacy notice: directory purpose and legal basis** (2026-11-10, members review) — sections 3/4 of the notice
  (purposes, legal basis) don't mention the in-club member directory (name, district, bikes, birthday, opt-in
  Instagram shown to active members). Question for the lawyer review of the notice. Since 2026-11-11 the birthday is
  **opt-out** (iltan asked the members; existing members were switched on by migration, notice section 5 updated):
  ask which legal basis covers it (likely meşru menfaat rather than açık rıza, which can't be pre-ticked).

## Features

- **`unlink_application` RPC** (2026-11-09, final review) — undo a wrong link without SQL (`applications.decide`, open
  applications only). The confirm step makes wrong links rare. Also in `docs/PLAN.md`.
- **Retention of pending accounts that never apply** (2026-11-09, spec) — KVKK minimisation; delete/anonymise after a
  period decided with the other retention periods. Also in `docs/PLAN.md`.
- **Sign-in without a Google account** (2026-11-09, spec "Not in scope") — SMS/phone OTP needs a paid SMS provider and
  Turkish sender registration. Revisit only if members without Google accounts keep showing up.
- **History of staff corrections** (2026-11-09, spec) — name/phone/email corrections only bump `updated_at`; who
  changed what is not recorded. Add an audit trail if disputes come up.
- **Applicants editing their own application** (2026-11-09, spec) — out of scope; staff correct it instead.
- **Staff correction of member profile data** (2026-11-10, members) — Instagram and bikes can only be fixed by the
  member; the birth date is read-only for members once stored (the `/account` hint "ask the club team" means SQL
  today). Add staff RPCs (like `set_member_name`) if members ask.
- **Birth-date entry: main "Kaydet" ignores a typed date** (2026-11-11, birth-date-once review) — the one-time date
  field sits inside the visibility card; typing a date and pressing the card's main "Kaydet" saves visibility only
  ("Kaydedildi.") and drops the date. Softened by the disabled switch + "save it first" hint. Fix: show a hint or run
  `setBirthDate` first when the field is filled. Also no confirm step before the irreversible save (a wrong year from
  a mobile picker sticks until staff fix it by SQL); consider showing the formatted date to confirm.
- **Medical notes and "first-aid trained" flag** (2026-11-10, idea) — free-text medical notes and a flag for members
  who can give first aid; belongs with the safety data (2a′), special-category data rules apply.
- **Navigation review once events exist** (2026-11-10, members) — the bottom tab bar has 5 tabs at 390px after
  `/members`; re-check labels and spacing when Events lands.
- **My garage** (2026-11-10, member request via iltan) — a personal garage per member: their bikes (today's
  `member_motorcycles`) with important dates (insurance/sigorta, inspection/muayene, last and next service or
  maintenance, …) and personal notes. Design questions: private to the owner (unlike the directory's brand/model/cc);
  fixed date types vs. free-form entries; reminders before a date (Web Push / email, needs the notification work);
  how it relates to the plate per bike planned in safety data (2a′) — consider designing the two together. KVKK:
  plates, insurance details and notes are personal data; collect only what members choose to enter.

## Parked edge cases (known, judged harmless for now)

- **Email-based activation skips the "already linked" guard** (2026-11-09, final review) — correcting an approved
  application's email (or signing in with it) can activate an account that still has its own open linked application;
  that application lingers until staff reject it. `link_application` refuses this case; the trigger path doesn't.
- **Linked account without a `member_contacts` row** (2026-11-09, final review) — the application page then shows only
  the Google name, no email and no mismatch warning. Every account gets a row from the sign-up trigger, so this
  should not happen.
- **Approve text for an already-active linked account** (2026-11-09, final review) — still says the account "becomes an
  active member"; approval changes nothing for it. Cosmetic.
- **Approve text when the linked account is hidden by RLS** (2026-11-09, task 7) — superseded by
  `application_account`, which shows status to every viewer; keep an eye on it if that RPC changes.

## Polish and tech debt

### Database / tests
- **Turkish case folding in `linkable_accounts` search** (2026-11-09) — `ilike` doesn't fold `ı/İ`
  (`supabase/schemas/20_applications.sql`). Email search and name-match ordering compensate. Fix: reuse
  `private.search_fold` (`30_member_directory.sql`) on both sides of the `like`.
- **Members DB review minors** (2026-11-10, members review) — (a) `private.tidy_name(…, false)` maps `İ` to `I`, so
  `'ÇELİK'` stays mixed-case with `turkish = false`; unreachable through the triggers (`İ` forces Turkish). (b)
  Instagram check accepts `...` / a trailing `.` (same as `applications`; matches the spec). (c) The motorcycle cap
  trigger runs before the RLS check, so a foreign-profile insert on a target with 10 bikes gets `23514` instead of
  `42501` (tiny info leak, briefly locks the target profile); fix: early-return when `new.profile_id <> auth.uid()`
  or `for no key update`. (d) The photo-consent fill helper updates `member_details` unconditionally, bumping
  `updated_at` for every backfilled profile. (e) The search-pattern block is duplicated in `member_directory` and its
  count RPC; extract `private.search_pattern` if a third caller appears. (f) `consent_photos_version` is
  member-writable free text (≤ 40 chars; the action writes `PRIVACY_NOTICE_VERSION` only on a real change); could be
  set server-side (trigger) instead of granted.
- **Members pgTAP gaps** (2026-11-10, members review) — owner `INSERT` into `member_details` (no grant) not asserted;
  motorcycle edge cases (cc = 3001, pending/inactive update/delete, manager/anon writes) and a stale comment near
  line 298 of the motorcycles test; no test that an application with `consent_photos = false` copies its stamp; the
  null-Instagram directory assertion is weak (passes regardless of the flag); no negative tests for the name-tidy
  triggers (a null name would become `''` via `coalesce`; unreachable: `full_name` is `not null` on both tables).
- **Verify private function grants on production** (2026-11-10, members review) — generated migrations revoke the new
  `private.*` functions only `FROM PUBLIC`, while the schema files also name `anon, authenticated`. After `db push`,
  check with `has_function_privilege` that anon/authenticated cannot execute them (query in the rollout section of
  `docs/superpowers/plans/2026-11-10-members.md`, step 4).
- **Email matching scans `applications`** (2026-11-09) — `private.normalize_email` can't be indexed on a table anon
  writes. Fine at today's volume (tens of rows); revisit if applications reach thousands.
- **pgTAP gaps** (2026-11-09) — no test for an *inactive* staff member holding `applications.view` /
  `applications.decide` calling the new RPCs (covered indirectly by `private.has_permission`).
- **Learnings note** (2026-11-09) — `session_replication_role = replica` (used to plant legacy rows in pgTAP) also
  skips foreign-key checks; add one clause to the `docs/learnings/testing.md` entry.

### App logic
- **`isGoogleMailAddress("gmail.com")` returns true** without an `@` (`src/lib/applications/contact.ts`). Callers
  validate the email first.
- **`chromeIntentUrl` hard-codes `https`** (`src/lib/auth/in-app-browser.ts`) — only matters on `http://localhost`.
- **Unit-test gaps** — NFD / `i̇` input for name matching; WhatsApp, Instagram-Android and `BytedanceWebview` user
  agents for in-app detection.
- **"Not signed in" filter predicate duplicated** in list and count (`src/lib/applications/queries.ts`); could drift.
- **Birth-date entry: "already set" shows "no permission"** (2026-11-11, birth-date-once) — `set_my_birth_date`
  refuses with 42501 both for "not active" and "already set" (e.g. saved in a second tab); `setBirthDate` maps it to
  the generic `forbidden` message. Only reachable with a stale page; a distinct errcode/message would fix it.
- **Contact editor shows the generic "invalid" message** for a DB `23514` (only reachable by bypassing Zod).
- **Rename dialog can be closed mid-save** (`src/components/admin/member-name-dialog.tsx`) — a failure after closing is
  lost; also its failure type includes an unreachable `duplicate`.
- **Members profile validation edges** (2026-11-10, members review) — `city` / non-object input reaching the profile
  action shows zod's default English message cast to `ProfileErrorKey` (only via direct endpoint calls; fix:
  `z.string(err("required"))` or map unknown messages to `required`); the motorcycles `jsonb` cast in the directory
  query has no element validation; `instagramUrl` doesn't encode the handle (safe: handles are `[A-Za-z0-9._]`);
  city choice "other" accepts "İstanbul" (check form parity); `z.uuid` is strict about fixture-style ids;
  `fail()` / `finish()` in the profile actions are untested.

### UI / accessibility
- **Application form steps review minors (2026-11-11)** — all optional; the final review removes what it fixes.
  - Unit tests/draft: no direct tests for `stepOfField` / `isLastStep` (`steps.ts`); `parseDraft` keeps empty strings
    and restored strings have no length cap (Zod catches them on submit); `browserStorage` throw path untested.
  - `apply-form.tsx` (~711 lines; splitting it is the follow-up) / `apply-fields.tsx`: two separate `react` import
    lines; double "Devam" before the URL commits pushes `?step=2` twice (compare with `window.location`); the
    duplicate/generic error alert follows the user to steps 1-3 after "Geri"; progressbar aria is redundant
    (labelledby heading + valuetext, `valuemin` 1 vs 25 %); back/forward always scroll to top and focus the heading
    (overrides scroll restoration); an error on a field outside every step (locale) focuses the heading but shows no
    message (unreachable today); every click schedules a draft save (`onClick`).
  - "Geri" pushes a history entry (`apply-form.tsx`, `goToStep(step - 1, "push")`): after 1→2→3 + Geri, the phone
    back gesture goes to step 3. Fix idea: keep `{ applyStep }` in `history.state` and let Geri call `history.back()`
    when the previous entry is the form's own step N−1.
  - The form remounts after hydration for every visitor (the `hydrated` key in `ApplyForm`), with or without a draft:
    a value typed before hydration (slow in-app browsers) is wiped. Fix idea: include "a stored draft exists" in the
    client snapshot so only visitors with a draft remount.
  - After a language switch the "Kaldığın yerden devam ediyorsun · Baştan başla" line appears although the person
    never left; look at it with the next copy review.
  - Shared device: a later visitor on the same browser sees the first person's steps 1-3 answers (restored line +
    "Baştan başla" mitigate); consider showing the line more prominently if it comes up.
  - Draft: UTM keys mix URL and draft values per key (take the whole set from the URL when any key is present);
    "Baştan başla" also drops the UTM values kept in the draft, and after a Google round trip the URL no longer has
    them (ad attribution lost); the language-switch flush relies on focus inside the form (Safari taps on
    radio/chips may not focus: write immediately on discrete changes and add an E2E case).
  - Google fill: hint not linked via `aria-describedby`, no `aria-busy`; if `signInWithGoogle` rejects (network
    failure), the rejection inside `startTransition` reaches the nearest error boundary
    (`src/app/[locale]/error.tsx`): steps 1-3 survive in the draft, step-4 input is lost; catch it and show
    `Apply.genericError` instead; the shared `isPending` also shows StepNav pending during the redirect; import order.
  - Skeleton: magic heights in `apply-fields.tsx` lack pointer comments; `Pills` use `key={i}`; the follow-up could
    list measured themes/widths; the TR→EN switch report doesn't quote the "none" frame count.
  - `scripts/e2e/apply-e2e.mjs`: no-op `until()` (~line 464); `next` shadowing; "start over" emptiness checks only
    radios; `value()` helper has no visibility filter; deep-link-step4 has no row assertion; draft-restore doesn't
    check `other_event_interests` visibility; `finally` skips `browser.close()` if the delete throws; sign-in errors
    become SKIP; the IG check infers hydration from a 1.5 s wait; `sinceTyped` (~125 ms) isn't asserted (< 400 ms).
- **`/apply` notice cards** (2026-11-10, loading-states) — the form intro still shows above "already a member" /
  "under review". (The skeleton's jump to a small card is part of the admin/state-dependent skeleton item below.)
- **Admin skeletons mirror only the default state** (2026-11-10, loading-states) — members list: the `pending` tab
  (rows 147px phone / 107px desktop plus the 4-line hint); on `?status=active` the rows are 170/82px and there is no
  hint (jump up to ~45px). Application detail: a `new`, unlinked application; an approved one has a taller review
  card (+99px phone, +19px desktop), shifting the section cards below it. Fix would need the tab/status in the
  fallback (request-time data, so not possible behind the current Suspense).
- **Non-Gmail note on `/apply`** has no `aria-live`, so screen readers don't hear it appear.
- **In-app notice on `/sign-in`** — appears after hydration (layout shift, inherent to the static page); the copied URL
  keeps `?next`/`?error`; the "copied" live region sits inside `role="alert"` (possible double announcement);
  light-theme muted text on the tint is ~4.6–5.0:1 (passes AA, thin margin).
- **Link-account dialog** — focus isn't moved between the list and confirm steps; results/empty state have no live
  region.
- **`src/components/ui/dialog.tsx` default "Close" labels are English** — both current dialogs pass
  `showCloseButton={false}`; a future caller using the defaults would leak English.
- **`Admin.empty`** ("No applications with this status") reads oddly on the "Not signed in" tab.
- **Members directory a11y and polish** (2026-11-10, members review) — the side-chip `<nav>` has no `aria-label`; the
  search input and its submit button share one `aria-label`. Account page: focus isn't moved after deleting a bike or
  to the first invalid field; an invalid field may be announced twice; an empty `ActionStatus` leaves a gap; a
  redundant cursor class.

### Loading states
- **`AccountSkeleton` only mirrors the active-member page** (2026-11-10, members) — pending and inactive accounts see a
  shorter page (no profile sections, or only the photo consent), so their skeleton overshoots. The status is
  request-time data, so the fallback can't know it. (Default-state heights are measured: all Δh 0, 2026-11-10.)
  Members without a birth date (2026-11-11) see a taller visibility card (date field, hint, button) than the skeleton.
- **Locale switcher shows no pending feedback** (2026-11-10, loading-states) — it uses `router.replace` in a
  transition, not a `Link`, so neither the progress bar nor the dim appears (it still switches and re-enables its
  button). Could drive the pending store from `useTransition`.
- **Skeleton magic numbers** (2026-11-10, loading-states review; updated 2026-11-11) — measured heights in
  `ApplySkeleton` (`src/app/[locale]/apply/page.tsx`: `h-29 md:h-17`, `h-[67.25px] md:h-[63.25px]`, `h-[19.25px]`,
  `h-17`, `h-47.25 md:h-35.25`, `h-[21px]`, `h-11`, …) and in the admin skeletons (~160 lines of mirrored markup) drift
  when the real markup changes; add pointer comments in the real components. Line/hint counts hidden at `sm` are tuned
  to Turkish copy, English not measured. Re-run `scripts/e2e/skeletons.mjs` after UI changes.
- **ApplySkeleton mirrors step 1 only** (2026-11-11, apply-steps Task 7) — a restored draft or `?step=N` opens another
  step, so the form can be taller/shorter than the fallback there; measured only signed out at step 1.
- **`user-menu.tsx` long line** (2026-11-10, loading-states review) — `src/components/auth/user-menu.tsx` has one
  long unformatted line (the signed-out `Link`).
- **Theme switcher selection after a revealed hidden route** (2026-11-11, header review, unverified) — if Next ever
  reveals a hidden `Activity` copy of the `[locale]` layout after the theme changed, its `useLayoutEffect` re-applies
  the stored theme but `pref` keeps the old value (wrong radio checked). Fix if seen: read `pref` via
  `useSyncExternalStore` over `localStorage` + `storage` events. The cross-tab E2E also only checks the `<html>`
  class, not the other tab's checked option.
- **Web-font swap resizes header text** (2026-11-11, user-menu skeleton fix) — when Saira finishes loading, the
  English "Sign in" button grows 59 → 63px and the header controls move ~4px (seen with throttling in
  `scripts/e2e/header-e2e.mjs`). The `next/font` fallback metrics don't fully match Saira's width axis; check
  `adjustFontFallback` / a closer fallback font if it's noticeable.
- **Pending dim polish** (2026-11-10, loading-states review) — no fade-out when pending ends (animation is removed),
  undocumented; the 150 ms opacity animation still runs under `prefers-reduced-motion` (low risk).
- **`pending-store.ts` robustness and tests** (2026-11-10, loading-states review) — a throwing listener stops later
  listeners in `emit`; the subscribe test also asserts unrelated getters and there is no double-subscribe /
  unsubscribe test.
- **Learnings wording** (2026-11-10, loading-states review) — the `useLinkStatus` entry in `docs/learnings/nextjs.md`
  still says "likely"/"observed, not verified" about prefetch covering only the static shell; confirm against the
  Next docs or leave as is.
- **Import order nit** in `src/app/[locale]/admin/applications/page.tsx` (2026-11-10, loading-states review).
- **Unknown paths flash dark for light-theme users** (2026-11-11, theme-script fix) — production serves unknown paths
  as a `<html id="__next_error__">` shell rendered entirely on the client, so the `<head>` theme script never runs
  there; the stored theme arrives with `ThemeSwitcher`'s `useLayoutEffect` after hydration (brief dark flash on 404s
  only). Find out why the catch-all `notFound()` yields the error shell instead of a server-rendered 404.
- **Extra dark `theme-color` meta after navigation** (2026-11-11, theme-script fix) — Next appends its `viewport`
  meta (dark) after ours on every client navigation; the browser uses the first one (ours, correct), so harmless
  today but fragile if Next ever inserts it first (`docs/learnings/ui.md`).
- **Re-run the instant-navigation dev check when adding pages** (2026-11-10, loading-states) — see
  `docs/learnings/nextjs.md`; the `/[locale]/[...rest]` catch-all always logs "Could not validate `instant`"
  (it calls `notFound()` by design).
- **Members skeleton card height varies** (2026-11-10, members E2E) — the card skeleton is 94px (name, location, one
  bike, measured); real cards are 74px (no bike) to 114px+ (bike + birthday + Instagram, more bikes), so the list can
  jump a little on load. Accepted: card content varies per member.

### Tooling
- **Dead-code sweep** (2026-11-11, iltan) — iltan wants dead code removed when there is no reason to keep it, and a
  sweep now and then. First sweep: unused exports/files/dependencies (tool still open, see "Dead-code tool?" under
  Open decisions), unused message keys in `messages/*.json`, stale comments and follow-up items that point at removed code.
- **Supabase CLI 3.1.0 is available** (2026-11-10; installed 3.0.0).
- **Members E2E looseness** (2026-11-10, members review) — some assertions are loose or vacuous in
  `scripts/e2e/members-e2e.mjs`: pending "no member cards" (passes if the list simply didn't render), "remaining 4
  members" accepts 1..4 cards, the English check is a loose regexp; bikes planted for the 10-bike cap stay if a check
  throws mid-run (the next run resets them); the instant-navigation check is evidenced only by the dev log and the
  browser console.
