# Follow-ups

The single backlog for everything that was consciously **not** done: open decisions, deferred features, parked edge
cases, polish and tech debt. Every session reads it before planning, and every iteration adds what it defers (review
findings marked minor/deferred/parked, "out of scope" items, ideas) **in the same commit as the work**. Remove an item
when it is done or dropped (say which in the commit message). Bigger roadmap items live in `docs/PLAN.md`; this file
holds the rest and links there.

Item format: `- **Title** (YYYY-MM-DD, origin) — what and where. Why deferred / risk if left.`

## Next up (iltan asked for these; in priority order; start in a new session)

- **Events branch 2b: the release** (2026-11-22, events joining; iltan) — joining (branch 2a, `feat/events-joining`)
  is built behind the gate; spec `docs/superpowers/specs/2026-11-20-events-design.md` §3, §9. Left for the release,
  after iltan's production check below: open the gate (one migration replacing `private.can_see_events()`'s body with
  `select private.is_club_member()`; flip the pgTAP gate assertions in `events.test.sql` / `event_signups.test.sql`
  and drop their in-transaction swap; `events-join-e2e.mjs` then needs no gate swap), visitor teaser (area line
  only), home section + "Etkinlikleri Gör" hero button, the
  event link back in the share text (`shareText` / `ShareEventButton`, absolute URL from the origin + `getPathname`;
  members would meet a 404 before), a per-event link preview (2026-11-24, iltan: WhatsApp fetches it signed out, so a
  public read of teaser-safe fields only: title, kind, day, area line, "İptal edildi"; never time, places,
  description, counts or names; meet-ups too, unlike the teaser: the link reaches only whom it was shared with; a
  generated Open Graph image per event in the club style, iltan wants it over the generic image; today
  `generateMetadata` in `events/[id]/page.tsx` returns the generic title), privacy notice + one
  `PRIVACY_NOTICE_VERSION` bump. Restore iltan's local admin before any local browser review (the build reset the local
  DB: iltan signs in with Google locally once, then set the admin role by SQL).
  Leftovers that still say or do "organisers only" once the body flips (final review): `scripts/e2e/events-e2e.mjs`
  `gateScenario` (~555-619: expects `member@` to get "Çok yakında" / a 404); `events-join-e2e.mjs`'s gate
  open/restore and its hard-coded "gate restored to organisers only" check; spec §6 "Members get a plain share of the
  event link too" (not built yet). `/events` for members with no upcoming event says "Yenisini “Etkinlik oluştur” ile
  ekleyebilirsin" (`Events.empty`, `events-list.tsx`) to everyone, but only organisers have that button: give
  non-organisers a plain "Yaklaşan etkinlik yok." (seen in the Task 8 navigation check, 2026-11-24).
- **Full Events check on production (iltan, before the release step)** — branch 1 feedback (the UI / form / card
  items marked "Deferred: … decide with iltan" below); tick `events.manage` for the Organizatör role in
  `/admin/roles`; on a real Android phone and iPhone check every "Konumu aç" / "Yol tarifi" app link and Yandex Navi
  with and without the app; paste one real `maps.app.goo.gl` link on production to confirm short links resolve from
  Vercel; try joining while the gate is still closed: as an organiser join as Sürücü and Artçı (Sürücü needs a bike
  of at least `min_cc` on `/account`), add and remove guests, set people/bike limits, `min_cc` and "Sadece tam
  üyeler" and tighten them after joining (you can still lower guests, switch to Artçı or leave; "Sınır aşıldı"
  shows), edit the time with someone signed up (the "Güncellendi" box and the share text's first line), check the
  roster (badge, "Acil durum kişisi yok", safety card), "Katıldıklarım", delete disabled / cancel closing joining.
  Only organisers can join until 2b, so a second organiser account helps for the race and the roster.

## Open decisions (need iltan)

- **No lawyer** (iltan, 2026-11-13) — the "lawyer" questions below are Claude's to research and decide; iltan
  confirms the outcome. Reword them as they are settled.

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

- **Organizatör role needs `events.manage` ticked on production** (2026-11-21, events organiser side) — the
  permission is new and no role but the admin role holds it; tick it for Organizatör in `/admin/roles` (UI, no
  migration) after the rollout, or organisers see "Çok yakında" on `/events` like everyone else.

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
  lines in `safety-e2e.mjs` and `members-e2e.mjs`. Low risk: test-only or cosmetic. The blood-filter check failed
  once in three runs (2026-11-14: total `undefined`, then passed twice), likely `page.select` before hydration.
- **Safety data: retention** (2026-11-13, safety data) — how long safety data (contacts, blood type, plates) of
  inactive or departed members is kept, and how long `safety_access_log` rows live; no deletion job exists, the notice
  says "same period as other member data". Decide with the member-data retention rule. Rows about a deleted account
  stay with actor/target null (decided in the account-deletion spec); admins see a `deleting` target's id meanwhile.
- **Safety data: KVKK club processes** (2026-11-13, safety data; spec §6) — not app features, for iltan/Samet: review
  the holders of `members.safety` periodically; ask holders to turn on Google 2-Step Verification (the app can't
  enforce it, sign-in is Google only); training and confidentiality undertaking for holders; never copy safety data
  into WhatsApp groups. Risk if left: decision 2018/10 measures only half met.

## Features

- **Events joining: small features left out** (2026-11-22, events joining, Task 5 review) — (a) leaving a
  cancelled event: the DB allows it (`leave_event`), the panel offers no button; (b) a started event still says
  "Katılıyorsun" (past tense "Katıldın" would read better); (c) "Katıldıklarım" with no sign-ups shows the generic
  "Bu filtreye uyan etkinlik yok." (a dedicated empty state). `src/components/events/join-panel.tsx`,
  `events-list.tsx`; (d) a cancelled event with sign-ups can never be deleted: `delete_event` refuses while sign-ups
  exist and the UI offers no leave on a cancelled event (the copy explains it). Deferred: polish; decide in iltan's
  production check.
- **Events joining E2E gaps** (2026-11-22, events joining) — `scripts/e2e/events-join-e2e.mjs` runs in Turkish and
  the dark theme only; joining as Sürücü, the bike limit, "Katılmaktan vazgeç", "don't make it worse" after a
  tightened rule and a past event's roster (no names for members) are covered by pgTAP / unit tests and Task 5's
  manual smoke run, not in the browser. Risk: a UI regression on those paths goes unseen. Script robustness (final
  review): (a) no SIGINT/SIGTERM handler, so Ctrl-C leaves the local gate open until the next run's `finally` or
  `pnpm db:reset`; (b) the 404 "no title" check (~line 715) has no positive control (it would pass on any 404); (c) the
  "gate restored to organisers only" check (~line 677) hard-codes the old body and must change at release.
- **Probation E2E gaps** (2026-11-18, ön alım + notes, final review) — `scripts/e2e/probation-e2e.mjs`: the district
  check matches only `district":` keys (a district printed as plain text in the crowd card would pass; idea: compare
  bare-word counts with the signed-out page); the HTML render check asserts only the locked sentence (add the summary);
  the RSC capture could pick a prefetch request (filter on path `/members` / no `next-router-prefetch`). Risk: a leak
  or a wrong capture goes unnoticed.
- **Events E2E gaps** (2026-11-21, events organiser side) — `scripts/e2e/events-e2e.mjs`: the origin-absent DB check
  has no positive control (it would also pass on an empty read); the past-page checks assume at most 50 past events in
  the local DB and none newer than the fixtures; a scenario that throws skips the later ones. Risk: a false pass or a
  confusing run on a busy local DB.
- **`/admin/members` skeleton not re-measured** (2026-11-18, ön alım + notes, final review) — rows gained the "Notlar"
  button and two status buttons on probation/inactive rows; `ListSkeleton` (`h-36.75` at 390px) not re-checked. Run
  `scripts/e2e/skeletons.mjs`. Risk: layout shift on load.
- **Notes on the application detail page** (2026-11-18, ön alım + notes; spec non-goal) — notes exist only on
  `/admin/members`; staff reviewing an application can't see or add notes there. Add if staff ask.
- **Reminder for long ön alım periods** (2026-11-18, ön alım + notes; spec non-goal) — ön alım usually lasts days, but
  nothing nudges staff when someone stays in it for weeks (`profiles.status_changed_at` has the date). Add a flag or
  count in `/admin/members` if people get forgotten.
- **Warnings, suspend, ban and the ban list** (2026-11-18, ön alım + notes; spec non-goal) — warnings shown to the
  member, suspend/ban and the ban list stay PLAN step 2b (only the notes part is built).

- **Data download (KVKK m.11)** (2026-11-14, account deletion) — members can delete their account in the app but not
  download their data (PLAN.md KVKK "download and delete"). Today an access request is answered by hand within 30 days
  (notice §9). An export of own profile, contacts, bikes, safety data and application (JSON or a printable page) on
  `/account`.
- **General retention jobs** (2026-11-14, account deletion; spec non-goal) — the notice promises rejected applications
  deleted 6 months after the decision and member data deleted/anonymised 1 year after membership ends, but no job does
  it yet (the account-deletion purge only covers self-deleted accounts and their kept applications). Natural home:
  another step in `private.purge_deleted_accounts`'s nightly job (or a sibling job), with "membership ended" needing a
  date (`profiles.status_changed_at` now records when a member became `inactive`; null for changes before 2026-11-18). Also the retention of pending accounts that never apply (item below).
- **Event poster upload** (2026-11-24, iltan) — organisers already post an AI-made poster per event in the WhatsApp
  channel; let them upload it as the event's cover and link-preview image, the generated preview (Events 2b) staying
  the fallback. Needs image storage (R2), so with the gallery work.
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
- **My garage** (2026-11-10, member request via iltan) — a personal garage per member: their bikes (today's
  `member_motorcycles`) with important dates (insurance/sigorta, inspection/muayene, last and next service or
  maintenance, …) and personal notes. Design questions: private to the owner (unlike the directory's brand/model/cc);
  fixed date types vs. free-form entries; reminders before a date (Web Push / email, needs the notification work);
  plates already exist per bike (`member_motorcycles.plate`, safety data) — build on that column. KVKK:
  plates, insurance details and notes are personal data; collect only what members choose to enter.
- **Web Install API / `<install>` element: switch when stable** (2026-11-12, install prompt) — Chrome's declarative
  install element is in an origin trial (2026), not stable. When it ships broadly, replace our `beforeinstallprompt`
  capture/banner plumbing (`src/lib/pwa/`) with it. Source: developer.chrome.com/blog/install-element-ot.
- **Emergency contact required to join a ride?** (2026-11-13, safety data; decided 2026-11-20, events spec) — not
  required for now (iltan): joining nudges, the organiser's roster marks "acil durum kişisi yok". Revisit if
  organisers keep missing contacts.
- **Organisers without `members.safety`** (2026-11-13, safety data; updated 2026-11-20) — the events spec links the
  roster to the existing safety card for `members.safety` holders (the Organizatör role has it, PLAN). An organiser
  role *without* it would see no cards; a per-event access rule (own log entries) only if such a role appears.
- **Several roles per person** (2026-11-20, iltan asked during the events design) — each profile has one `role_id`;
  combinations are made as combined roles ("Organizatör + Üye Sorumlusu"). If combined roles pile up: a
  `profile_roles` table, `private.has_permission` over all roles, a multi-select on `/admin/members`, pgTAP.
- **Events: map, notifications, waiting list** (2026-11-20, events spec non-goals) — iteration 2: a real map
  (MapLibre + tiles, picking points, place search; coordinates already stored); iteration 3: Web Push (service
  worker, opt-in, reminders via pg_cron, `web-push` package after iltan approves) and the waiting list (only with
  notifications, so the person who moves up is told). Spec: `docs/superpowers/specs/2026-11-20-events-design.md`.
- **Google Places API for place links** (2026-11-21, events organiser side) — a Google place link carries no
  coordinates, so a venue-only place routes by its name/address in Apple/Yandex and gets no Yandex Navi or
  coordinates; organisers who want an exact point long-press the map and share a pin as well. The Places API would
  resolve place links to points but needs a Google Cloud billing account (and a KVKK look at sending the link).
  Revisit if organisers keep adding venue-only places.
- **Access-log viewer for admins** (2026-11-13, safety data) — `safety_access_log` is written but only readable via
  SQL. Add an admin screen (paginated). Risk if left: the log exists but nobody can audit it in the app.
- **Search on `/admin/applications`** (2026-11-13, list UX spec) — the list has status tabs and numbered server pages
  but no search (it grows without bound, so it isn't loaded whole like `/admin/members`). Add a server-side search
  (debounced, `?q=`) only if staff ask for it.

- **Index `/gallery` once it has content** (2026-11-13, SEO round 1) — today it is a thin page (near-empty 200s get
  reported as soft 404s); make it indexable and add it to `src/app/sitemap.ts` with real content. (`/events` became
  indexable with the events release: the public ride teaser.)
- **Index `/privacy` and add it to the sitemap when the notice is final** (2026-11-13, SEO round 1) — it stays
  `noindex` while the notice is a draft.
- **Event structured data only for public events at a physical place** (2026-11-13, SEO round 1) — members-only rides
  are ineligible for Google's Event rich results; add `Event` JSON-LD only if such events appear.

## Parked edge cases (known, judged harmless for now)

- **Pre-scrub commits still fetchable by SHA on GitHub** (2026-11-19, public-repo audit) — the history rewrite
  removed a production company name, a member's name and an unknown phone number, but GitHub serves the orphaned
  commits by SHA until its GC (0 forks/stars at the rewrite, the SHAs were never published elsewhere). If it matters:
  Support ticket per CLAUDE.md photo-removal step 3, 0 PRs; the First Changed Commit is the old
  "docs(plan): application gaps implementation plan" commit (2026-11-09): recompute it from the reflog on iltan's PC
  (`docs/learnings/tooling.md`), never write an old SHA into this public repo (it points straight at the old data).

- **Unknown event link: `og:image` goes through a redirect** (2026-11-24, events release Task 5) — a found event
  names its image URL in its metadata (`eventImageUrl`), but the generic metadata of an unknown or malformed id keeps
  Next's file-derived URL `/tr/events/<id>/opengraph-image?<hash>`, which the locale proxy 307-redirects to the
  unprefixed path (the generic club card, 200). Naming it there too means repeating the layout's `openGraph` fields;
  nobody shares dead links on purpose.

- **Events organiser side: parked edges** (2026-11-21, events organiser side, task reviews) — (a) the event pages
  answer an unknown or gated id with the 404 page but status 200 (soft 404, same as the admin pages); (b) delete
  calls `router.replace("/events")`; the action's `refresh()` could re-render the deleted page first (no flash seen);
  (c) `place-input.ts`: a bare short host with a query (`https://maps.app.goo.gl/?ll=41,29`) is read as a point
  (it isn't a short link without a path); the Yandex org slug class accepts a malformed `%zz`; (d) the schema's venue
  regex accepts a bare prefix (`https://www.google.com/maps/place/`; the parser is the real gate); (e)
  `isoToIstanbul` returns "NaN-…" for an invalid ISO string (only stored times reach it); (f) `listPastEvents`
  trusts `page ≥ 1` (callers clamp with `parsePage`); (g) `/events` and `/events/past` each read their own "now"
  (moot: never rendered together). Harmless today; revisit if a caller changes.
- **Short links from Vercel may come back `unresolved`** (2026-11-21, events organiser side) — Google may answer a
  `maps.app.goo.gl` request from an unknown user agent / server IP with a 200 consent or interstitial page instead
  of a 302, so `resolve-place.ts` would report `unresolved` on Vercel; never verified from production. After the
  deploy paste one real short link into the event form; if it fails, try another user agent or ask for the long link.
- **`profiles.status_changed_at` readable by every active member** (2026-11-18, ön alım + notes) — table-level select
  grant plus the active-member read policy: it shows when someone became a full member. Low sensitivity, accepted; a
  column-level grant would close it.
- **`/members` skeleton vs. the crowd card** (2026-11-18, ön alım + notes) — the skeleton is directory-shaped while an
  ön alım member gets the small crowd card (layout shift; status is request-time, accepted in the spec). Also: a club
  overview with total 0 shows "0 üye" and an empty grid; the ön alım status badge on `/account` uses the same variant
  as inactive.

- **Purge is one transaction for all due accounts** (2026-11-14, account deletion) — `private.purge_deleted_accounts`
  deletes every due account in one statement set: one account that can't be deleted (a future Storage object owner
  blocks `auth.users` deletes) fails the whole run, so nobody is purged and the `cron.job_run_details` pruning doesn't
  run either. Split per account (loop with an exception block, log the failing id) when Storage arrives; then also
  delete the user's objects first (spec "Future").
- **Purge: one kept application matching two due inactive accounts** (2026-11-14, account deletion) — the
  `retained_until` step (`update … from profiles`) picks an arbitrary `deletion_requested_at` if one unlinked
  application's email matches two due inactive accounts. Sign-in emails are unique in practice; out of scope.
- **Last-admin check races a concurrent role change** (2026-11-14, account deletion) — `request_my_account_deletion`
  peeks at other active admins; a role change committing in between could leave no admin (documented in the function;
  needs two admins acting within milliseconds).
- **Backups on a paid plan would keep deleted data longer** (2026-11-14, account deletion; updated 2026-11-18) —
  the Supabase Free plan has no automatic backups (docs checked 2026-11-14: daily backups only for Pro, 7 days; Team
  14; Enterprise up to 30). Notice §6 and `Account.delete.kept` now name our own 14-day pre-push backups; on a paid
  plan, add Supabase's window there too.
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
- **Approve text for an already-active linked account** (2026-11-09, final review; updated 2026-11-18, ön alım +
  notes) — the approve text says the account goes into ön alım (earlier: "becomes an active member"), which is also
  wrong for an already-active linked account: approval changes nothing for it. Cosmetic.
- **Approve text when the linked account is hidden by RLS** (2026-11-09, task 7) — superseded by
  `application_account`, which shows status to every viewer; keep an eye on it if that RPC changes.

- **Telegram link previews** (2026-11-13, SEO round 1) — Telegram has an open bug that drops valid previews
  (bugs.telegram.org/c/61650, active 2026-11); our tags follow the community advice. Test by hand, don't chase.
- **Sitemap `lastmod`** (2026-11-13, SEO round 1) — left out on purpose: Google uses it only when consistently
  accurate. Add it if pages get tracked edit dates.

## Polish and tech debt

- **`profiles.test.sql` with real admins** (2026-11-14, account deletion) — assertions 7 and 16 failed locally while an
  extra non-fixture active admin existed (seen during the account-deletion build; production runs passed before). Check
  that the file is robust to real admins (it also runs against production), like the last-admin case in
  `account_deletion.test.sql` that skips when non-fixture admins exist.
- **Done-state "Ana sayfaya dön" has no pending feedback** (2026-11-14, account deletion) — the account-deletion done
  dialog's button is a plain `<form action={signOut}>` submit: nothing shows while the sign-out and redirect run
  (`delete-account-card.tsx`).
- **Generated grant noise in migrations** (2026-11-14, account deletion) — the CLI adds `grant … to
  postgres/service_role` lines to generated migrations; harmless, left in.
- **Home photos are 1600 px** (2026-11-13, home content) — soft on very wide screens; ask for the originals if it
  bothers (originals never enter the repo, see CLAUDE.md "Removing a website photo").
- **Guard test for forbidden words** (2026-11-13, home content review) — optional: fail if kahve/ücretsiz/sohbet
  appear in the `Home` / `Metadata` messages (iltan's copy rules, `docs/content/home-page-questions.md`).
- **Apply-form option `coffee_meetups`** (2026-11-13, home content review) — still reads "Kahvaltı / kahve buluşmaları"
  (`messages/tr.json`); iltan rejected "kahvede" for the home page. Ask iltan whether the form wording should change too.

### Database / tests
- **Ön alım + notes test gaps** (2026-11-18, ön alım + notes reviews) — pgTAP: the safety filters (blood type /
  no_contact) over probation rows are untested; the `club_overview` initials assertions are weak on production (real
  members can satisfy `= any(initials)`). App: no tests for the notes server actions or dialog (e.g. zero rows deleted
  → `forbidden`); the client `.catch` fallbacks in the notes dialog don't log. Risk if left: a regression in these
  paths goes unseen.
- **Events test gaps** (2026-11-21, events organiser side, task reviews) — unit: `place-input.test.ts` has no
  exact-boundary cases (lat ±90 / lng ±180, venue URL 500 and label 200 characters), no bare `google.com/maps`, no
  `/navi/org/` venue, no multi-waypoint `rtext`, no origin-only route with a trailing empty segment
  (`/maps/dir/41.03,29.02//` → null); `resolve-place.test.ts` has no Yandex short link → `rtext` chain and no A → A
  redirect loop; `schema.test.ts` has no `toRpcArgs` case for a meet-up with `ends_at` null or a place with point and
  venue; `form-state.test.ts` doesn't cover unticking "Başlangıca dönüş" while the finish has a read pending (it is
  dropped, as intended). pgTAP: `-infinity` as a start time is untested (`isfinite` covers it). Risk: a regression in
  these corners goes unseen.
- **Events joining test gaps** (2026-11-22, events joining, task reviews) — pgTAP: a change-log author who is
  `deleting` reads as null (needs a deleting author fixture); `event_change_log` lacks a comment that an unknown id
  returns no rows (unlike `event_roster`'s `P0002`). Unit: `join.test.ts` has no ön alım *edit* that raises the
  footprint on a `fullMembersOnly` event (allowed: the rule only refuses new sign-ups); the query layer
  (`src/lib/events/queries.ts` sign-up reads) has no unit tests (the browser E2E covers it). Risk: low.
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
- **Events joining app minors** (2026-11-22, events joining, task reviews) — (a) the panel's role/guests state is seeded once from `mine` (a
  refresh after another tab's change keeps the old choice); (b) `JoinPanel` receives the whole `EventDetail`; (c) the event page calls
  `getRoster` for active members on past events and then hides it; (d) `REASONS` in `join.ts` is a
  `Record<string, …>`, leaving an unreachable `null`; (e) `isUuid` / `z.uuid()` refuse ids with non-RFC version
  bits (consistent with `getEvent`; only hand-planted fixtures have such ids). Harmless today.
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
- **Members profile validation edges** (2026-11-10, members review) — `instagramUrl` doesn't encode the handle
  (safe: handles are `[A-Za-z0-9._]`); city choice "other" accepts "İstanbul" (check form parity); `z.uuid` is strict
  about fixture-style ids; `fail()` / `finish()` in the profile actions are untested.
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
  `apply-nav-e2e.mjs` "showed the guess first" check flaked once (passed on rerun). Seen 2026-11-15 (lint-format final
  E2E, each passed on the rerun): install's `/account` scenario failed all four banner checks ("Yükle" not shown,
  `prompt()` calls=0) while `/members` just before passed (a late or missing install event?). (Apply-nav's "second
  load, one layout" FAILs were a half-parsed tab bar, fixed 2026-11-19: `docs/learnings/testing.md`.) From the
  fix-wave re-review: the iPhone "installed flag still set" check is near-tautological (`initScript` sets the flag on every document; the real
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
- **Event card details to settle** (2026-11-21, events organiser lists) — a multi-day ride's card shows only the
  start day (the event page shows the range). `src/components/events/`. Deferred: look at real events with iltan
  first. (Stop names: the event page lists every place under the strip.)
- **Event page details to settle** (2026-11-21, events organiser event page) — (a) "Yandex Navigasyon" is a bare
  `yandexnavi://` link: without the app iOS shows an error and Android does nothing (a store fallback needs per-OS
  detection); (b) map-app names are the official Turkish ones ("Google Haritalar", "Apple Haritalar", "Yandex
  Haritalar", "Yandex Navigasyon"; option: "Google Maps" as people say it). `src/components/events/place-actions.tsx`;
  (c) a venue-only place (Google place link, no pin) opens in Yandex and Apple as a text search: Yandex lists every
  matching branch ("Starbucks, Caferağa, …" shows three Starbucks; iltan, 2026-11-22). By design (spec §4, see "Google
  Places API for place links"); options: a form hint or warning when a place has no pin, label those entries as a
  search, or require a pin; iltan chose the form warning (built 2026-11-22: `venueNoPin` in `place-field.tsx`).
  Deferred: check the links on an Android phone and an iPhone and decide (a) and (b) with iltan.
- **Event form details to settle** (2026-11-21, events organiser form) — (a) no warning when leaving with unsaved
  changes; (b) two organisers editing at once: the later save wins silently (no `updated_at` check); (c) an abandoned
  edit draft is kept by Next (hidden route) and shown on a later visit even if someone else changed the event; (d)
  `datetime-local` shows the device's own format (12-hour on an English-region phone); (e) default kind is "Sürüş"
  and the side defaults to "İki yaka / şehir dışı". `src/components/events/event-form.tsx`. Deferred: try the form
  with organisers on real phones first; (b) matters only once several organisers edit the same events.
- **Events UI minors** (2026-11-21, events organiser side, task reviews) — (a) `/events` with a chip pressed: the
  total row still counts every upcoming event ("2 yaklaşan etkinlik") while the pager's range counts the filtered
  ones ("1–1 / 1 etkinlik"); decide in the browser review whether the total should follow the filter; (b) a second
  failed "Koordinatları kopyala" isn't announced again (the live text doesn't change); (c) a label-less (Yandex)
  venue's status line follows the place-name field on every keystroke ("Mekân: …"); (d) two comment lines over 120
  characters (`event-card.tsx`, `events-list.tsx`; Prettier doesn't wrap comments). Cosmetic.
- **Events joining UI minors** (2026-11-22, events joining, Task 5 review) — (b) reason texts aren't tied to the controls
  with `aria-describedby`; (c) the bike-limit reason ("…artçı olarak katılabilirsin") also shows to someone already
  joined as Artçı; (d) copy options: "En az cc" → "En az motor hacmi", "Katılımın silindi." → "Katılımını geri
  çektin.". `src/components/events/join-panel.tsx`, `messages/*.json`. Deferred: polish for the release review.
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
  Tailwind `group`; `useApplyHiddenGuess` also runs in the streamed nav (one no-op re-render);
  `hero-apply-guess.tsx` builds its className with a template string instead of `cn`; the hero guess link
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
- **`/events` and `/events/[id]`: signed-in non-members see the members' skeleton first** (2026-11-24, events release
  Tasks 6 and 8) — the fallbacks pick their shape from the session cookie (`SessionHintSwitch`): signed out → the
  teaser skeleton (`EventsTeaserSkeleton` / `EventTeaserSkeleton`), a session → the members' one (`EventsSkeleton` /
  `EventSkeleton`). Pending, inactive and `deleting` accounts have a session but get the teaser, so they see the wrong
  skeleton for a moment (layout shift; on the event page ~1,150px taller than the 158px teaser). A per-viewer hint
  like `apply-hint.ts` (last streamed answer in `localStorage`) could fix it; few such visitors, so accepted.
- **`/events` teaser: the empty state is 294px shorter than its skeleton** (2026-11-24, events release Task 8) —
  `EventsTeaserSkeleton` reserves the total line and three ride cards; with no upcoming ride the teaser shows one
  paragraph (`py-10`) instead (measured Δh 294 at 390 and 1280, signed out), so the buttons below jump up. Accepted:
  the club rides weekly, so the list is rarely empty, and a padded empty state that tall would look broken.
  `src/components/events/events-teaser-skeleton.tsx`, `events-teaser.tsx`.
- **`/events` member skeleton: a joined card's badge row** (2026-11-21, events organiser side) — `EventsSkeleton` is
  the `/events` fallback for sessions now (measured 2026-11-24: every block Δh 0 at 390/1280, TR/EN, rides with a
  route strip), but a joined card's badge row ("Katılıyorsun" + kind + side) may wrap to two lines at 375px, and a
  meet-up card has no route strip (96px shorter). `CardCounts` and the card skeleton's counts line have no
  `data-skeleton` marks.
- **Event page skeleton is an active member's view** (2026-11-22, events joining; re-measured 2026-11-24, events
  release Task 8) — `EventSkeleton` mirrors an active member who has not joined a ride with two places, a one-line
  description and two sign-ups (Turkish, 390/1280: every block Δh 0; signed out, `EventTeaserSkeleton` Δh 0). Other
  viewers differ, and the fallback can't know the role or the sign-up (request-time data): organisers get the edit
  button (same row), a safety-card button per roster row (roster −72px with two rows) and the cancel/delete row, so
  their page is 181px taller than the skeleton (everything above the roster matches); ön alım members see no roster
  (page 220px shorter); joined, the panel has a summary line (+28px); more participants make the roster longer (data);
  past events hide the roster from members. A per-viewer hint like `apply-hint.ts` could fix the organiser case.
  `src/app/[locale]/events/[id]/page.tsx` (`EventSkeleton`). Accepted: members are the common viewer.
- **Event page skeleton mirrors a ride** (2026-11-21, events organiser event page) — a meet-up has no route strip,
  so its page is 96px shorter than the skeleton (layout shift); a ride with stops, no description or no area is
  another height. `src/app/[locale]/events/[id]/page.tsx` (`EventSkeleton`). Deferred: rides are the common case.
- **Event form skeletons mirror a ride** (2026-11-21, events organiser form) — `/events/new` matches its default
  (ride) form; `/events/[id]/edit` mirrors a ride whose places have one pin each. Editing a meet-up, a ride with stops
  or a place with a venue row makes the page longer than the skeleton (layout shift below the places). Measured in
  Turkish only (English hints wrap differently). `src/components/events/event-form-skeleton.tsx`. Deferred: rides
  with pins are the common case.
- **Empty admin tab: the skeleton's range line shifts the content** (2026-11-13, list UX final review) — `ListSkeleton`
  reserves the pager's range line, but an empty tab renders no pager (only the "empty" text), so the page ends up
  shorter by the range line and its gap (16 + 24px) (`src/components/admin/list-skeleton.tsx`,
  `src/app/[locale]/admin/applications/page.tsx`, `src/components/admin/members-list.tsx`). Deferred: the default tabs
  (pending, new) usually have rows.
- **`AccountSkeleton` only mirrors the active-member page** (2026-11-10, members) — pending and inactive accounts see a
  shorter page (no profile sections, or only the photo consent), so their skeleton overshoots. The status is
  request-time data, so the fallback can't know it. (Default-state heights are measured: all Δh 0, 2026-11-10.) Members
  without a birth date (2026-11-11) see a taller visibility card (date field, hint, button) than the skeleton. Members
  without an emergency contact (2026-11-13, safety data) also get the prompt card (~146px at 390px) above the account
  card, which the skeleton doesn't have: the page below jumps down once when it streams in. The Acil durum skeleton
  mirrors the default state "no contact, no blood-type consent" (Δh 0 at 390 and 1280, dark and light); members with
  contacts or a stored blood type see a different height. Inactive members' section is shorter. The "Hesabı sil" card at
  the bottom (2026-11-14, account deletion) is mirrored (Δh 0 at 390/1280, dark/light, TR/EN); accounts being deleted
  see only the recovery card, much shorter than the skeleton.
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
- **Session hint script has the same chunk-boundary risk** (2026-11-14) — `sessionHintScript` (user-menu skeleton)
  still follows its element and marks `previousElementSibling`; the apply hint moved to first-child/`parentElement`
  (`docs/learnings/ui.md`), and `sessionHintParentScript` (first child, used by `SessionHintSwitch` on `/events`)
  exists since 2026-11-24. Move the user menu to it too if `header-e2e` ever shows an unmarked frame.

### Tooling
- **Dead-code sweep** (2026-11-11, iltan) — iltan wants dead code removed when there is no reason to keep it, and a
  sweep now and then. First sweep: unused exports/files/dependencies (tool still open, see "Dead-code tool?" under
  Open decisions), unused message keys in `messages/*.json`, stale comments and follow-up items that point at removed
  code.
  Known: `hasStaffAccess` in `src/lib/auth/permissions.ts` has no callers (pre-existing, 2026-11-13).
- **Supabase CLI 3.1.0 is available** (2026-11-10; installed 3.0.0).
- **Members E2E looseness** (2026-11-10, members review) — some assertions are loose or vacuous in
  `scripts/e2e/members-e2e.mjs`: pending "no member cards" (passes if the list simply didn't render), the English
  label check is a loose regexp; bikes planted for the 10-bike cap stay if a check
  throws mid-run (the next run resets them); the instant-navigation check is evidenced only by the dev log and the
  browser console.
- **Home redesign review minors** (2026-11-14, home redesign review) — polish, none urgent:
  - `src/components/home/route.tsx`: `-mr-5` mirrors `Route`'s `pr-5` (expose a `--route-pr` custom property); the
    line colour pair is repeated in `DOT.place` and the bend's `text-*` classes instead of one shared constant;
    `RouteStop`'s `as` is typed `ElementType`; `RoutePhoto`'s fixed `md:h-130` can leave space under the photo; its
    `lg` size says 400px vs a ~420px column.
  - `home-who.tsx`: ruler labels laid out with `justify-between` drift off the even-percentage ticks; redundant
    `aria-hidden` inside `role="img"`.
  - `home-closing.tsx`: fixed `md:h-155` could clip text at large font scales.
  - Display sizes are fixed px (`text-[40px]`, `text-[72px]`, …) and don't follow the browser's default font size (zoom
    still works; WCAG 1.4.4 met).
- **Purge failure alerting** (2026-11-14, account deletion) — the nightly job fails silently and all-or-nothing; notice
  a failed run (e.g. a weekly check of the latest `cron.job_run_details` status, or via the keep-alive route). KVKK
  slack is about 16 days.
- **Staff RPCs read the target's status without a row lock** (2026-11-14, account deletion) — `set_member_role` /
  `set_member_status` / `set_member_name`: a deletion request committing in between gives staff a 23514 error (status)
  or silently re-roles/renames a just-deleting row. Add `for update of p` when touching these next.
- **Lint/format review minors** (2026-11-15, lint-format reviews) — none urgent:
  - `normalizePlate` (`src/lib/members/plate.ts`) / `normalizeInstagram` (`src/lib/members/schema.ts`) return
    `string | null` with an `"invalid"` sentinel string; a discriminated result (`{ ok, value }`) would let the type
    checker tell "invalid" from a real handle/plate.
  - The four widened-row types could share a `NullableColumns<T, K>` helper.
  - `CardTitle` / `FieldDescription` now use the `text-X/Y` shorthand; an override like `cn(…, "leading-7")` from a
    caller is untested (no caller does it today; `docs/learnings/ui.md`).
  - Two justified cast disables remain: `setMemberRole` (`src/lib/access/actions.ts`, generated types can't make
    `new_role_id` nullable: a `new_role_id uuid default null` signature would remove it, a production rollout) and the
    fake `Document` in `src/lib/theme.test.ts` (narrowing `applyResolvedTheme` to a structural type fails on
    `querySelectorAll`'s generic and would touch the inline `initTheme` script).
  - `InstallWindow[INSTALL_PROMPT_PROP]` trusts the capture script to store a real prompt event (as the old cast did);
    `findLinkableAccounts` maps any non-`active` status to `pending` (the RPC returns only those two) instead of
    dropping the row, which would shift keyset paging.
- **More lint later?** (2026-11-15, lint-format) — not enabled, each measured: `prefer-nullish-coalescing` (15 hits)
  and `prefer-optional-chain` (6) are suggestion-only (several `||` on strings rely on `""` falling through);
  `no-empty-function` (20) catches nothing; `consistent-type-definitions` (40) is taste; import order isn't enforced
  (see "Install prompt review minors" (d)). `eslint --cache` was not added: `pnpm lint` takes ~30–40 s, and the cache
  can't see that a type changed in another file, so a cached run may miss type-aware errors. Revisit if lint time
  starts to hurt.
- **Purge audit rows on hosted** (2026-11-14, account deletion) — `delete from auth.audit_log_entries` inside the purge
  was verified on the local stack only; after the rollout `db push`, confirm the first real run (or a read-only
  privilege check: `has_table_privilege('postgres', 'auth.audit_log_entries', 'delete')`, and `'insert'` too: the
  purge pgTAP inserts fixture rows there and also runs on production) on production.
- **Audit rows where the person isn't the actor** (2026-11-14, account deletion) — the purge deletes
  `auth.audit_log_entries` by `payload->>'actor_id'`; rows where the person appears only in `payload->'traits'` (an
  admin/service action on them, may carry `user_email`) stay. Rare with Google-only sign-in; extend the match if
  such rows show up.
- **`deletion-e2e.mjs` double-click check** (2026-11-14, account deletion) — it doesn't prove both requests were sent.
- **Unlinked-tab filter duplicated** (2026-11-14, account deletion) — in `listApplications` and
  `countApplicationsByStatus` (`src/lib/applications/queries.ts`); extract a helper.
- **Forms already open in another tab** (2026-11-14, account deletion) — a `deleting` user can still submit forms open
  in another tab (profile, apply); the rows are hidden and purged, or return on restore: harmless, noted.
- **Pre-push backup review minors** (2026-11-18, final review) — (a) guard: text that merely mentions a guarded
  command with a remote flag (a `git commit -m` message, `grep`, a hook smoke test) is blocked (recoverable; rephrase
  or put it in a file); the splitter ignores quotes, so a quoted `;`/`&` before the remote flag hides it
  (`… --password 'p;q' --remote` passes; contrived); other Supabase CLI remote writes (`storage`, `functions`,
  `secrets`, `config push`) are not guarded (no Storage or Edge Functions yet; `config push` has its own diff-first
  rule). (b) `production.mts`:
  SIGTERM/SIGHUP (terminal closed) skip the `exit` handler, so the private temp `.env` with every production secret
  can stay in `os.tmpdir()` (handle them like SIGINT); `/up to date/i` is correct for CLI 3.0.0 (stdout only when
  nothing is pending) but should be re-checked on CLI upgrades or replaced by `--output-format json` + `upToDate`;
  the roles and schema dumps have no content check (a `CREATE TABLE` marker for the schema); when gpg dies first the
  error says "Dump failed" (check gpg's result first). (c) Unverified: whether CLI 3 error output can echo the
  `--remote=<url>` value (try a fake URL on `127.0.0.1:1`). (d) Restore: sessions of accounts created after the
  backup linger until they expire (documented in the runbook); delete `auth.sessions` too if that matters.
- **Backups older than 14 days without a Claude session** (2026-11-18, final review) — pruning runs at every Claude
  Code session start here and before every backup; with neither for over two weeks, the newest backup outlives the
  notice's 14 days. A Windows scheduled task (`wsl … production.mts prune`) would close the gap; open Claude Code here
  every two weeks meanwhile (runbook).
- **Probation `/members` fallback shows the list skeleton** (2026-11-18, ön alım Task 8 E2E) — `skeletons.mjs
  STATES=probation /members` finds the members fallbacks (total, search, chips, row, pager) but no matching
  `data-skeleton-result`: the page streams in the crowd card (`ClubOverview`), so a probation member first sees a list
  skeleton that is replaced by a different card (layout shift). Give the card its own `data-skeleton-result` and let the
  fallback follow `hasSessionCookie()`/a stored hint, or accept it (one-off view for people in their first weeks).
- **`/account` visibility skeleton for members without a birth date** (2026-11-18, ön alım Task 8 E2E) — `profile-visibility`
  measures -208px at 390px for `admin@test.local` and `probation@test.local` (no birth date: the form also holds the
  one-time birth-date block) and 0 for `member@test.local`. Not caused by the probation work; skeleton mirrors the
  with-birth-date form.
