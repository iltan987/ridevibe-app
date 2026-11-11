# Application form in steps — design

Status: **agreed in chat with iltan (2026-11-11)**, awaiting spec review. Backlog entry "Application form UX: same
questions, less effort" in `docs/follow-ups.md`. Form spec: `docs/application-form.md`.

## Why

Applicants say the form is long. Samet keeps every question. Goal: **same questions, as little effort as possible**.
What exactly people struggle with is unknown (no analytics yet), so the design addresses all likely causes: one long
page without a sense of progress, the writing questions, and losing input when interrupted (Instagram in-app browser,
switching to WhatsApp).

**Done when:** `/apply` shows the application in 4 steps with a progress indicator (easy, tap-only steps first);
answers of steps 1–3 survive a reload or a Google sign-in round trip; signed-out visitors can fill name and email via
Google on the last step; the writing questions ask for one short sentence (min. 15 characters); the server, the
database and the admin view are unchanged apart from the new minimum length.

## Decisions (iltan, 2026-11-11)

- **Easy first:** steps are Sürüş → Kulüp → Kendi sözlerinle → Seni tanıyalım (+ Onaylar). Contact data comes last,
  after people have invested; the admin view and `docs/application-form.md` keep their section order for reviewing.
- **Writing questions: one short sentence**, not a paragraph and not a single word. Production check (2026-11-11,
  lengths only): the 16 existing applications are imported Google Form answers of existing members (median 23–31
  characters, some 3); they don't set the bar for new applicants.
- **Draft only for steps 1–3** (contact details and consents are never stored in the browser).
- **Google sign-in suggested on step 4**, not before step 1.
- **Tap instead of type:** only bike-brand suggestions are new; district stays a native select, riding years a number
  input, languages without a preselection (licence, group experience, yes/no and city are already tap pills).
- **Out of scope:** funnel measurement (waits for the Vercel Web Analytics decision; moves into that follow-up),
  riding-year chips, a searchable district box, a preselected language, any change to the admin view or the DB.

## 1. Steps and navigation

| Step | Title (TR) | Fields |
|---|---|---|
| 1 `riding` | Sürüş | license_class, riding_years, owns_motorcycle, motorcycle_brand/model/cc, riding_styles, group_experience |
| 2 `club` | Kulüp | in_other_clubs, other_club_names, heard_from, referrer_name, event_interests, other_event_interests |
| 3 `words` | Kendi sözlerinle | expectations, alienating_behaviors, conflict_handling |
| 4 `you` | Seni tanıyalım | Google fill, full_name, phone, email, birth_date, city_choice, city, district, instagram, languages, other_languages; sub-heading "Onaylar": consent_privacy, consent_rules, consent_photos; submit |

- **Approach:** one `<form>` keeps every field mounted; inactive steps are `hidden`. `FormData` always holds the whole
  application, so the schema, the touched/blur logic, the honeypot, the UTM inputs and the single server action stay
  as they are.
- **Header of each step:** "Adım 2/4 · Kulüp" and a thin progress bar. Intro becomes "4 kısa adım, yaklaşık 3 dakika"
  (wording finalised in the plan).
- **Buttons** at the bottom, full width on phones: "Devam" (primary; on step 4 "Başvuruyu gönder") and "Geri" (from
  step 2).
- **"Devam":** validates the whole form, looks only at the current step's errors. Errors → show them (all fields of
  that step count as touched), focus the first invalid field, stay. No errors → next step, scroll to top, focus the
  step heading (screen readers announce the new step).
- **Submit:** validates everything; an error on an earlier step (e.g. after deep-linking to `?step=4`) jumps to that
  step and focuses the field. Server results (`duplicate`, generic error, server-side `invalid`) behave as today; a
  server-side field error also jumps to its step.
- **URL:** `?step=N` (1–4) next to the UTM parameters, via `window.history.pushState` (integrates with
  `useSearchParams` per the bundled Next 16 docs, "Native History API"). Back/forward move between steps. Missing or
  invalid → step 1.
- **Skeleton:** `ApplySkeleton` is redrawn to the new step 1 (progress header + Sürüş fields) and measured with JS off
  (`docs/learnings/testing.md`); language switch checked both ways.

## 2. Writing step ("Kendi sözlerinle")

- Hint at the top of the step: "Kısa bir cümle yeter."
- 2-row textareas (grow with content), max 1000 as today.
- **Minimum 15 characters** for all three (`expectations` was 10, the other two 3). Too short → existing
  `tooShort` message ("Biraz daha detay yazar mısın?"). No character counter.
- Example placeholder **only on expectations** (e.g. "ör. Yeni rotalar keşfetmek ve birlikte güvenli sürüşler"). The
  other two are screening questions; an example would be copied.

## 3. Bike-brand suggestions

`motorcycle_brand` gets a native `<datalist>` of common brands in Turkey (list in the plan, e.g. Honda, Yamaha,
Kawasaki, Suzuki, BMW, KTM, Ducati, Triumph, Harley-Davidson, CFMoto, Benelli, Bajaj, Kuba, Mondial, RKS, Voge, Kymco,
SYM, Vespa, Royal Enfield). Free text still allowed; no DB change.

## 4. Draft (steps 1–3)

- `localStorage`, one versioned key: `{ v: 1, savedAt, step, fields, utm }`. `fields` contains only the fields of steps
  1–3, derived from the step map, so contact data and consents can't end up in it. `utm` carries the ad attribution
  (not personal data) across the Google round trip; UTM parameters in the URL win over stored ones.
- **Save:** on change/blur (debounced) and on every step change, only once at least one answer exists (opening the page
  creates nothing).
- **Restore:** after mount (the server render has no draft): the form remounts with the draft as default values and
  opens at the saved step unless the URL names one. A line above the form: "Kaldığın yerden devam ediyorsun ·
  Baştan başla". "Baştan başla" deletes the draft, empties the form, goes to step 1.
- **Delete:** after a successful submit. Older than 7 days, malformed or another version → ignored and deleted. Values
  that are no longer valid are caught by normal validation.
- localStorage unavailable (private modes, some in-app browsers) → the form works without a draft.
- **Privacy notice:** one sentence under technical data (`src/app/[locale]/privacy/content-{tr,en}.tsx`), roughly
  "Başvuru formundaki cevapların (iletişim bilgileri ve onaylar hariç) gönderene kadar yalnızca kendi tarayıcında
  saklanır, bize ulaşmaz; gönderince ya da 7 gün sonra silinir." Bump `PRIVACY_NOTICE_VERSION`.

## 5. Google fill (step 4)

- Signed-out visitors, not in an in-app browser (`src/lib/auth/in-app-browser.ts`): an outline button with the Google
  icon at the top of step 4, "Google ile doldur", hint "Ad ve e-postan otomatik gelir." Hidden in in-app browsers
  (Google refuses sign-in there) and for signed-in applicants.
- Tap: save the draft with step 4, then call the existing `signInWithGoogle` action with `next` = the locale-aware
  `/apply?step=4` (already checked by `safeNextPath`). Straight to Google, no `/sign-in` page in between. The call is
  not a nested `<form>` (see `docs/learnings/forms.md`).
- Back on `/apply`: `ApplyGate` prefills name and email as today; the draft restores steps 1–3 and opens step 4. Active,
  inactive or under-review accounts get the gate's notices as today.
- Sign-in error → the existing error on `/sign-in`; the draft stays for the next visit.

## 6. Code shape

- `src/lib/applications/steps.ts` (new): step map (`id`, field names) and pure helpers: errors of one step, first step
  with an error, parse/clamp `?step`.
- `src/lib/applications/draft.ts` (new): build a draft from `FormData` (whitelist from the step map), parse a stored
  draft (version, expiry, shape), storage access wrapped in try/catch.
- `src/lib/applications/schema.ts`: `text(15, 1000)` for the three writing questions.
- `src/components/apply/apply-form.tsx`: steps, navigation, draft wiring; the field building blocks may move to their
  own file if the component grows too large.
- `ApplyGate`: passes whether the visitor is signed in (Google fill hidden otherwise) — it already knows.
- Messages (TR source, EN): progress label, Devam/Geri, intro, step titles, writing hint, expectations placeholder,
  draft line, Google fill button + hint. Messages that lose their purpose are removed.

## 7. Testing

- **Unit (`node --test`):** every schema input field (except `locale`, UTM, honeypot) belongs to exactly one step; a
  draft never contains step-4 fields or consents; draft expiry/version/malformed handling; step-error helpers and
  `?step` parsing; the 15-character minimum.
- **Browser E2E** (new `scripts/e2e/apply-e2e.mjs`, 390px, against `pnpm start -p 3123`): "Devam" with errors stays and
  focuses the field; back goes to the previous step; reload restores the draft at the saved step with the line;
  "Baştan başla" clears; localStorage holds no contact/consent keys; full submit → success screen, draft deleted (test
  row deleted afterwards); Google button visible normally, absent with an Instagram user agent, and its tap reaches the
  Google redirect with the right `next`.
- Skeleton re-measured with JS off (`scripts/e2e/skeletons.mjs`); language switch both ways.
- Usual gates: lint, tsc, test, db:test (unchanged DB), build.

## 8. Docs

- `docs/application-form.md`: step order and mapping, draft, minimum lengths, Google fill, brand suggestions.
- `docs/follow-ups.md`: remove this item; add "measure the application funnel (opened → each step → sent)" to the
  Vercel Web Analytics item; anything deferred during the build.
- `docs/learnings/`: whatever is discovered on the way.
