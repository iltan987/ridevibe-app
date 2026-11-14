# Follow-ups

The single backlog for everything that was consciously **not** done: open decisions, deferred features, parked edge
cases, polish and tech debt. Every session reads it before planning, and every iteration adds what it defers (review
findings marked minor/deferred/parked, "out of scope" items, ideas) **in the same commit as the work**. Remove an item
when it is done or dropped (say which in the commit message). Bigger roadmap items live in `docs/PLAN.md`; this file
holds the rest and links there.

Item format: `- **Title** (YYYY-MM-DD, origin) — what and where. Why deferred / risk if left.`

## Next up (iltan asked for these; in priority order; start in a new session)

- **Self-service account deletion** (2026-11-12, iltan) — own design round. Decided so far: a confirm step says what
  gets deleted and what may be kept; on confirmation the account is marked for deletion at once (no admin approval, it
  should feel instant); signing in again within a grace period offers recovery; final deletion after the period. Today
  deletion is by hand (CLAUDE.md "Deleting an account"); KVKK art. 11/13 (answer within 30 days).
- **Stricter ESLint rules** (2026-11-13, iltan) — own session. Goals: (1) stop `any`, `unknown`, casts (`as`),
  non-null `!` and `eslint-disable` / `@ts-expect-error` being used to bypass problems instead of fixing them;
  (2) let ESLint catch real bugs earlier (e.g. type-aware rules: floating/misused promises, unsafe `any` flows,
  exhaustive switches, unnecessary conditions). Claude picks the rule set (research current `typescript-eslint`
  presets and Next 16 / React Compiler lint first), measures the violations on the current code, and fixes them or
  justifies each remaining disable with a reason (like the `react-hooks/purity` rule in CLAUDE.md). Fits with the
  dead-code tool decision (Open decisions).


## Open decisions (need iltan)

- **No lawyer** (iltan, 2026-11-13) — the "lawyer" questions below are Claude's to research and decide; iltan
  confirms the outcome. Reword them as they are settled.

- **"Ön alım" (probation) stage** (2026-11-12, iltan) — after approval the club moves a new member into a separate
  "ön alım" WhatsApp group to see how they behave; they can still join some events. If it doesn't work out they leave
  on their own or are removed. The app has no such stage today (approved = `active`). To discuss before Events: a new
  status or a membership stage on active profiles, who sets/ends it (permission), what ön alım members can see, and
  event requirements (e.g. minimum bike cc, membership stage) that organizers set per event. See `docs/PLAN.md` step 3.
  Facts (iltan, 2026-11-13): ön alım usually lasts only a few days; members ride anything from a 50cc (B licence) to
  700–1000cc, and some future events will be limited to bike classes (e.g. over 400cc). More in
  `docs/content/home-page-questions.md`.

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
  ask which legal basis covers it (likely meşru menfaat rather than açık rıza, which can't be pre-ticked). Same question
  for motorcycle plates in the directory (opt-out, decided 2026-11-12 for safety data 2a′). The notice now covers
  plates in the directory (§4/§5, 2026-11-13); only the legal-basis confirmation remains for the lawyer.
- **Safety data: lawyer questions** (2026-11-13, safety data) — (a) legal basis for emergency contacts (third persons'
  data) and plates: proposed meşru menfaat (KVKK m.5/2-f) plus, in an emergency, m.5/2-b; blood type rests on açık rıza
  (m.6). (b) Encryption: we rely on the hosted database's disk encryption instead of app-level encryption (decision
  2018/10, 3(a)/(b)). Checked 2026-11-13: https://supabase.com/security says "All customer data is encrypted at rest
  with AES-256 and in transit via TLS."; the shared-responsibility page
  (https://supabase.com/docs/guides/deployment/shared-responsibility-model) says "Data is encrypted at rest and in
  transit by Supabase." and suggests encrypting at the application layer if needed; `/docs/guides/platform/security`
  only covers TLS. Ask whether disk encryption is enough for blood type. (c) The safety team and `members.manage` see
  plates even with "Plakalarımı göster" off (the safety card ignores the switch). (d) Admins also see blood types
  (access log, `members.safety` via admin role) while the consent text names only the safety team. (e) The
  blood-filter log row has no target: a name-narrowed filter does not record whose type was revealed (logging the
  search text would put names into the log). Risk if left: the notice states a basis nobody has confirmed.
- **Safety data: small test and polish leftovers** (2026-11-13, safety data) — no `motorcycleSchema` test for an invalid
  foreign plate (covered in `plate.test.ts`); Acil durum and account skeleton heights not measured in English;
  `/members` blood select: a choice made before hydration has no `name`, so it does not filter;
  `scripts/e2e/safety-e2e.mjs` blood-filter check assumes exactly one consented A+ member locally; stray double blank
  lines in `safety-e2e.mjs` and `members-e2e.mjs`. Low risk: test-only or cosmetic.
- **Safety data: retention** (2026-11-13, safety data) — how long safety data (contacts, blood type, plates) of
  inactive or departed members is kept, and how long `safety_access_log` rows live; no deletion job exists, the notice
  says "same period as other member data". Decide with the member-data retention rule.
- **Safety data: KVKK club processes** (2026-11-13, safety data; spec §6) — not app features, for iltan/Samet: review
  the holders of `members.safety` periodically; ask holders to turn on Google 2-Step Verification (the app can't
  enforce it, sign-in is Google only); training and confidentiality undertaking for holders; never copy safety data
  into WhatsApp groups. Risk if left: decision 2018/10 measures only half met.

## Features

- **"Etkinlikleri Gör" back in the hero** (2026-11-13, home content) — removed while Events has no content; restore the
  secondary hero button when Events ships.
- **Gallery candidates** (2026-11-13, home content) — Glob Coffee and small-café photos, not committed; the small-café
  one needs the stranger cropped. For the Gallery feature, after consent is confirmed.
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
- **Medical notes** (2026-11-10, idea) — free-text medical notes (allergies, conditions); special-category data rules
  apply (consent, `members.safety`, access log; see the safety-data spec). The first-aid flag was dropped (2026-11-12,
  iltan): first aid is mandatory training for the motorcycle license.
- **Navigation review once events exist** (2026-11-10, members) — the bottom tab bar has 5 tabs at 390px after
  `/members` (4 for members and open applicants since 2026-11-11, "Başvur" hidden); re-check labels and spacing when
  Events lands.
- **My garage** (2026-11-10, member request via iltan) — a personal garage per member: their bikes (today's
  `member_motorcycles`) with important dates (insurance/sigorta, inspection/muayene, last and next service or
  maintenance, …) and personal notes. Design questions: private to the owner (unlike the directory's brand/model/cc);
  fixed date types vs. free-form entries; reminders before a date (Web Push / email, needs the notification work);
  plates already exist per bike (`member_motorcycles.plate`, safety data) — build on that column. KVKK:
  plates, insurance details and notes are personal data; collect only what members choose to enter.
- **Web Install API / `<install>` element: switch when stable** (2026-11-12, install prompt) — Chrome's declarative
  install element is in an origin trial (2026), not stable. When it ships broadly, replace our `beforeinstallprompt`
  capture/banner plumbing (`src/lib/pwa/`) with it. Source: developer.chrome.com/blog/install-element-ot.
- **Emergency contact required to join a ride** (2026-11-13, safety data) — decide with Events whether joining a ride
  needs at least one emergency contact (today only a gentle prompt on `/account`).
- **Organizers see their ride participants' safety cards** (2026-11-13, safety data) — with Events, a ride's
  organizers get the participants' safety cards without `members.safety`; needs its own access rule and log entries.
- **Access-log viewer for admins** (2026-11-13, safety data) — `safety_access_log` is written but only readable via
  SQL. Add an admin screen (paginated). Risk if left: the log exists but nobody can audit it in the app.
- **Search on `/admin/applications`** (2026-11-13, list UX spec) — the list has status tabs and numbered server pages
  but no search (it grows without bound, so it isn't loaded whole like `/admin/members`). Add a server-side search
  (debounced, `?q=`) only if staff ask for it.

- **Index `/events` and `/gallery` once they have content** (2026-11-13, SEO round 1) — today they are thin pages
  (near-empty 200s get reported as soft 404s); make them indexable and add them to `src/app/sitemap.ts` with real
  content, public events only.
- **Index `/privacy` and add it to the sitemap when the notice is final** (2026-11-13, SEO round 1) — it stays
  `noindex` while the notice is a draft.
- **Event structured data only for public events at a physical place** (2026-11-13, SEO round 1) — members-only rides
  are ineligible for Google's Event rich results; add `Event` JSON-LD only if such events appear.

## Parked edge cases (known, judged harmless for now)

- **Install prompt: iOS in-app webviews look like Safari** (2026-11-12, install-prompt final review) — Instagram /
  Facebook in-app browsers on iOS classify as `ios-safari` (`src/lib/pwa/platform.ts`), so they'd get Safari steps
  that don't work there. Signed-in users can't be in those webviews today (Google blocks OAuth there; `/sign-in` shows
  the in-app notice), and the banner shows only to signed-in members; revisit if that changes.
- **"Şimdi değil" does nothing visible with blocked storage** (2026-11-12, install-prompt final review) — with a
  throwing `localStorage`, `dismiss()` can't store the timestamp and the banner stays (`install-store.ts`). Rare
  (privacy modes); fix if it ever matters: an in-memory "dismissed for this page" flag.
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

- **Telegram link previews** (2026-11-13, SEO round 1) — Telegram has an open bug that drops valid previews
  (bugs.telegram.org/c/61650, active 2026-11); our tags follow the community advice. Test by hand, don't chase.
- **Sitemap `lastmod`** (2026-11-13, SEO round 1) — left out on purpose: Google uses it only when consistently
  accurate. Add it if pages get tracked edit dates.

## Polish and tech debt

- **Home photos are 1600 px** (2026-11-13, home content) — soft on very wide screens; ask for the originals if it
  bothers (originals never enter the repo, see CLAUDE.md "Removing a website photo").
- **Hero gradient classes are long** (2026-11-13, home content review) — `src/components/home/home-hero.tsx`; extract
  if it grows. (The stats template-literal keys are gone with `home-stats.tsx`.)
- **Guard test for forbidden words** (2026-11-13, home content review) — optional: fail if kahve/ücretsiz/sohbet
  appear in the `Home` / `Metadata` messages (iltan's copy rules, `docs/content/home-page-questions.md`).
- **Apply-form option `coffee_meetups`** (2026-11-13, home content review) — still reads "Kahvaltı / kahve buluşmaları"
  (`messages/tr.json`); iltan rejected "kahvede" for the home page. Ask iltan whether the form wording should change too.

### Database / tests
- **Turkish case folding in `linkable_accounts` search** (2026-11-09) — `ilike` doesn't fold `ı/İ`
  (`supabase/schemas/20_applications.sql`). Email search and name-match ordering compensate. Fix: a SQL fold helper
  on both sides of the `like` (`private.search_fold` was dropped 2026-11-13 when directory search moved to the
  browser; recipe in `docs/learnings/supabase.md`, "Turkish sort order and search").
- **Members DB review minors** (2026-11-10, members review) — (a) `private.tidy_name(…, false)` maps `İ` to `I`, so
  `'ÇELİK'` stays mixed-case with `turkish = false`; unreachable through the triggers (`İ` forces Turkish). (b)
  Instagram check accepts `...` / a trailing `.` (same as `applications`; matches the spec). (c) The motorcycle cap
  trigger runs before the RLS check, so a foreign-profile insert on a target with 10 bikes gets `23514` instead of
  `42501` (tiny info leak, briefly locks the target profile); fix: early-return when `new.profile_id <> auth.uid()`
  or `for no key update`. (d) The photo-consent fill helper updates `member_details` unconditionally, bumping
  `updated_at` for every backfilled profile. (e) `consent_photos_version` is
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
- **Caching for lists: measure first** (2026-11-13, list UX) — no shared `use cache` for the directory: the RPC
  checks `auth.uid()` and a shared cache can't read the session, so a cached fetch would need the secret key and
  bypass RLS. Measured server time of `/members` (production build on WSL, local Docker DB, 29 active members, signed
  in, 20 loads over 4 runs of `members-e2e.mjs`; document timing from the request): first byte (static shell)
  6–10 ms, streamed directory complete (`responseEnd`) 44–71 ms. Re-measure on production (Vercel `fra1` + Frankfurt
  DB, Vercel logs) when the club grows past a few hundred members; only if it is slow, design a cache (never
  safety/health data). **Payload:** each directory member costs ~380 B in the page, so ~0.8–0.9 MB raw at the 2,000
  ceiling; `/admin/members` also ships `search` (name + email again) and re-sends the whole list on every row action's
  `refresh()`. Measure the document/RSC size at ~500 members; folding on the client would drop the duplicate field.
  Deferred: small at today's ~150 members. **Redis: not now**
  (2026-11-12, iltan asked) — functions in `fra1` sit next to the Frankfurt DB (a query is a few ms), ~150 members
  fit in Postgres memory; Redis would add a service, a KVKK processor and RLS-bypass risk in a shared cache. Prefer
  Next's built-in cache; revisit Redis for rate limiting (e.g. form spam).
- **Safety data pgTAP / SQL minors** (2026-11-13, safety data reviews) — Task 1: the 0606 post-check can't prove
  row survival.

### App logic
- **`pageMetadata` call sites repeat a preamble** (2026-11-13, SEO final review) — the five pages calling
  `pageMetadata` each do `getLocale()` + `(await parent).openGraph?.images`; a helper taking `parent` would stop a
  future page from forgetting the images. Works as is; risk is a missing share image on a new page.
- **Locales hard-coded in the SEO helpers** (2026-11-13, SEO final review) — `src/app/sitemap.ts` `LOCALES`, `ogLocale`
  and `sharedOpenGraph` (`src/lib/seo/metadata.ts`) assume exactly two locales; a third language touches several
  files. Deferred: no third language planned.
- **"Don't disallow noindex pages" could be its own learning** (2026-11-13, SEO final review) — it is a rule inside
  another entry in `docs/learnings/seo.md`; a separate entry would be easier to find.
- **List UX review minors** (2026-11-13, list UX reviews) — (a) `readAll` (`src/lib/pagination.ts`) stops silently
  if Supabase `max_rows` is ever set below `CHUNK_SIZE` (a short chunk looks like the end); keep the two in sync (doc
  note only). (b) Untested edges: `pageItems(…, 0)`, `normalizeQuery(null)`, `readAll` when a chunk throws. (c) A
  decomposed `İ` (`I` + U+0307) folds to `i̇`, not `i` (same as the dropped SQL fold). (d) `PagerLinks` types its
  `href` with the literal pathname `/admin/applications`; widen it when a second server-paged list appears. (e) Counts
  can drift by a row between two chunked reads while rows change (only past 1,000 rows; self-heals on the next load).
  (f) `useListParams` keeps its own write until the router catches up (`shownSearch`); its chain logic is
  unit-tested, the hook itself only via E2E.
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
- **Install prompt review minors** (2026-11-12, install-prompt reviews) — (a) `platform.ts`: the `OPT` token in the
  iOS "other browser" regex is a bare substring (could match inside another UA word). The iPadOS case (Mac UA with
  touch) is tested; untested are a Mac UA with 1–2 touch points, iOS `OPT`/`Ddg`/`YaBrowser`, macOS Edge and Android
  `OPR`. Deferred: the rules come from `pwa-install` and these browsers are rare in the club; risk: a wrong guide
  (e.g. Safari steps in another browser), never a crash. (b) `install-script` / store vm tests run node-stripped
  source, not the build's output, and `win.Event` is used unguarded in `captureInstall`. Deferred: the browser E2E runs
  the real built script, and every browser that fires the install events has `Event`; risk: a build-only
  transpilation difference would show up only in the E2E. (c) `install-store` tests: "event before 30 s" doesn't prove
  the timer is cancelled, no test for concurrent `install()` calls; the Android watch also runs when the app is
  already installed (harmless: variant stays `none`). (d) `account/page.tsx` import order. Deferred: cosmetic, lint
  doesn't enforce it. (e) `useInstall()` is called twice (banner + avatar menu; harmless, one shared store) and
  `guideOpen` may stay `true` if the variant flips to `none` while the dialog is open (reopens on the next flip back).
- **Install E2E minors** (2026-11-12, install-prompt Task 6 review) — `scripts/e2e/install-e2e.mjs`: no
  `try/finally` around scenarios (a thrown error skips `ctx.close()`, later scenarios inherit cookies/storage); the
  fallback `page.mouse.click(195, 400)` in `open()` (user activation when the event is late) can hit real UI; the
  `apply-nav-e2e.mjs` "showed the guess first" check flaked once (passed on rerun). From the fix-wave re-review: the
  iPhone "installed flag still set" check is near-tautological (`initScript` sets the flag on every document; the real
  assertions there are "no banner / no menu entry"); the language-switch scenario doesn't assert exactly one spacer
  after the switch; the comment near line 39 still states "Chrome ignores a re-dispatched real event" as fact (see the
  verify-or-drop item below). Deferred: test-only, all green today; risk: a confusing cascade of FAILs or a rare flake.
- **Install prompt: after an accepted install, a later install event in the same page is ignored** (2026-11-12,
  install-prompt fix-wave re-review) — the in-memory `accepted` flag (`install-store.ts`) treats the app as installed
  for the page's lifetime, so if the install then fails, the menu entry returns only after a reload. Deferred: by
  design (avoids the guide flashing while Chrome builds the app); risk: a rare failed install needs one reload.
- **Verify or drop the "re-dispatched `beforeinstallprompt` is ignored" learning** (2026-11-12, install-prompt final
  review) — `docs/learnings/testing.md` says a held real event re-dispatched with `window.dispatchEvent` reached no
  listener; that was observed once, not verified (the DOM spec says re-dispatching a dispatched event should work).
  Try it again in isolation; if it works, simplify `__release()` in `install-e2e.mjs` to re-dispatch the real event.
  Risk if left: a wrong learning steers later tests to synthetic events.

- **Cross-tab sync minors** (2026-11-12, cross-tab sync + review) — (a) the language switcher drops the query in its
  *own* tab (`router.replace(pathname, …)`: `/members?q=…` → `/en/members`), while the tabs that follow keep it; keep
  the query in both if it matters (check `/apply?step=N` and the apply E2E first). (b) The E2E's frozen-tab check
  can't tell whether the queued `storage` event or the visibility re-check did the work; the unit tests cover the
  re-check. (c) Following tabs drop the URL hash (`#…`). (d) Only `/apply` and `/account` keep their language:
  a background tab on an admin page with a typed review note or an open rename/role dialog loses that text when
  another tab switches language; add those paths (or a "dirty form" flag) if staff hit it. (e) The language
  catch-up on mount compares another tab's `Date.now()` with this page's `performance.timeOrigin`; reportedly
  (unverified) Chrome's `timeOrigin` can run early after system sleep, so a switch made before the page loaded could
  look newer and a tab opened from an `/en/…` link would bounce to the last switched language. Clock-free fix: snapshot
  the stored `rv-locale` value at page load (inline script) and follow only if it changed. (f) `parseAuthMark` accepts
  an empty time (`"abc@"` → 0) while `localeSwitchedSince` rejects it; harmless (time 0 always loses), inconsistent.
- **Safety data app minors** (2026-11-13, safety data reviews) — `normalizePlate` folds `ı`/`ß` into ASCII via
  `toUpperCase` (DB-safe; stricter option: reject anything outside `[A-Za-z0-9 -]`); `fail()` maps any 23505 to
  `contactLimit` (only contacts raise it today); a truncated long contact name can hide the "(ana kişi)" suffix;
  `BloodSelect` keeps its initial value across back/forward while mounted; the safety card content collapses during
  the close animation and its close button isn't in `DialogFooter`; `SafetyFilters` `side` prop is typed
  `string | null`; `visibility-form.tsx` indentation. All cosmetic or harmless today.

### UI / accessibility
- **Pager accessibility** (2026-11-13, list UX final review) — pressing "›" to reach the last page swaps the focused
  button for a `span`, so focus falls to `<body>`; after a page change the view scrolls to the list top but focus stays
  on the pager; the disabled end `<span aria-label>` has no role (ARIA forbids `aria-label` on generic elements). Fix:
  `<button disabled>` for the ends and/or move focus to the list after a page change (`pager-buttons.tsx`,
  `pager.tsx`). Deferred: found in the final review; keyboard/screen-reader use of the pager is rare on phones.
- **Language switch drops the list's query** (2026-11-13, list UX final review) — `locale-switcher.tsx` calls
  `router.replace(pathname)`, so switching TR/EN on `/members?q=ali&page=2` lands on the unfiltered list in the same
  tab, while the cross-tab follow keeps `location.search`. Predates this branch, but it matters more now that the URL
  holds the view. Deferred: out of the list-UX scope; fix by passing the current search params.
- **Widest pager on 360px phones** (2026-11-13, list UX E2E) — from 7 pages the pager shows 7 numbers + 2 arrows
  (36px each, 356px). It fits a 390px screen inside the page padding (spec) and still fits on a 360px screen, but
  there it spills 14px into each side padding (`scripts/e2e/lists-e2e.mjs` prints it as INFO). If it looks cramped:
  `size-8` buttons below `sm`, or a smaller gap.
- **Focus drops to `<body>` when the install banner unmounts** (2026-11-12, install-prompt final review) — pressing
  "Şimdi değil", or a dismissed system dialog, removes the banner with focus on its button, so keyboard and
  screen-reader users land on `<body>` (`src/components/pwa/install-banner.tsx`). Deferred: the banner is a phone
  feature for touch users; fix: move focus to the main heading (or announce) before unmounting.
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
- **Hide-Başvur review minors** (2026-11-11, hide-Başvur review) — nav/hero: the guess plumbing is duplicated in
  `desktop-nav.tsx` / `bottom-nav.tsx` (a `useApplyNavItems` helper); `group-data-apply-hidden` relies on an unnamed
  Tailwind `group`; `useApplyHiddenGuess` also runs in the streamed nav (one no-op re-render); `noSubscribe` is
  defined 3×; `hero-apply-guess.tsx` builds its className with a template string instead of `cn`; the hero guess link
  carries no UTM params; the inline script in `apply-hint.ts` reads `doc.cookie` outside its `try` and uses an
  optional catch binding (same as `markSessionHint`); the parity test doesn't assert `hasSessionCookie(c)` against
  the list label. E2E (`scripts/e2e/apply-nav-e2e.mjs`): the language-switch check prints INFO instead of failing
  when the fallback isn't re-shown (~line 146); the stored-"1" visitor check doesn't assert the guess was on screen
  first (`fr[0]?.guess`, ~line 156); the frame logger skips frames where the nav or hero is missing (~line 53), so a
  briefly vanishing bar isn't caught; a thrown error skips `ctx.close()`/`browser.close()`; "success card stays" is
  read only once. Behaviour: sign-out clears the "just submitted" store before `signOut()` resolves (same as
  `rememberShownUser(null)`; a failed sign-out shows Başvur until reload); the hero doesn't read the submitted store
  (Back to a preserved `/` after a signed-in submit can still show the hero's Başvur, a one-click dead end to "under
  review"; harmless).

### Loading states
- **Empty admin tab: the skeleton's range line shifts the content** (2026-11-13, list UX final review) — `ListSkeleton`
  reserves the pager's range line, but an empty tab renders no pager (only the "empty" text), so the page ends up
  shorter by the range line and its gap (16 + 24px) (`src/components/admin/list-skeleton.tsx`,
  `src/app/[locale]/admin/applications/page.tsx`, `src/components/admin/members-list.tsx`). Deferred: the default tabs
  (pending, new) usually have rows.
- **`AccountSkeleton` only mirrors the active-member page** (2026-11-10, members) — pending and inactive accounts see a
  shorter page (no profile sections, or only the photo consent), so their skeleton overshoots. The status is
  request-time data, so the fallback can't know it. (Default-state heights are measured: all Δh 0, 2026-11-10.)
  Members without a birth date (2026-11-11) see a taller visibility card (date field, hint, button) than the skeleton.
  Members without an emergency contact (2026-11-13, safety data) also get the prompt card (~146px at 390px) above the
  account card, which the skeleton doesn't have: the page below jumps down once when it streams in. The Acil durum
  skeleton mirrors the default state "no contact, no blood-type consent" (Δh 0 at 390 and 1280, dark and light);
  members with contacts or a stored blood type see a different height. Inactive members' section is shorter.
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
- **English application rows are taller on phones** (2026-11-13, list UX skeleton measurements) — at 390px the first
  row of `/en/admin/applications` measured 130px against the 104px row skeleton (`h-26`; Turkish rows: 0px). The
  English badge/source labels wrap to an extra line for some rows; content-dependent, like the member cards below.
- **Members skeleton card height varies** (2026-11-10, members E2E) — the card skeleton is 94px (name, location, one
  bike, measured); real cards are 74px (no bike) to 114px+ (bike + birthday + Instagram, more bikes), so the list can
  jump a little on load. Accepted: card content varies per member.

### Tooling
- **Dead-code sweep** (2026-11-11, iltan) — iltan wants dead code removed when there is no reason to keep it, and a
  sweep now and then. First sweep: unused exports/files/dependencies (tool still open, see "Dead-code tool?" under
  Open decisions), unused message keys in `messages/*.json`, stale comments and follow-up items that point at removed
  code.
  Known: `hasStaffAccess` in `src/lib/auth/permissions.ts` has no callers (pre-existing, 2026-11-13).
- **Session hint script has the same chunk-boundary risk** (2026-11-14) — `sessionHintScript` (user-menu skeleton)
  still follows its element and marks `previousElementSibling`; the apply hint moved to first-child/`parentElement`
  (`docs/learnings/ui.md`). Move it too if `header-e2e` ever shows an unmarked frame.
- **Supabase CLI 3.1.0 is available** (2026-11-10; installed 3.0.0).
- **Members E2E looseness** (2026-11-10, members review) — some assertions are loose or vacuous in
  `scripts/e2e/members-e2e.mjs`: pending "no member cards" (passes if the list simply didn't render), the English
  label check is a loose regexp; bikes planted for the 10-bike cap stay if a check
  throws mid-run (the next run resets them); the instant-navigation check is evidenced only by the dev log and the
  browser console.
- **Home redesign review minors** (2026-11-14, home redesign review) — polish, none urgent:
  - `src/components/home/route.tsx`: `-mr-5` mirrors `Route`'s `pr-5` (expose a `--route-pr` custom property); the
    line colour pair is repeated in `DOT.place` and `RoutePhoto` instead of reusing `LINE`; `RouteStop`'s `as` is typed
    `ElementType`; `RoutePhoto`'s fixed `md:h-130` can leave space under the photo; its `lg` size says 400px vs a ~420px
    column.
  - `home-who.tsx`: ruler labels laid out with `justify-between` drift off the even-percentage ticks; redundant
    `aria-hidden` inside `role="img"`.
  - `home-closing.tsx`: fixed `md:h-155` could clip text at large font scales.
