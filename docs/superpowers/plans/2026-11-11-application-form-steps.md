# Application Form in Steps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/apply` becomes a 4-step form (easy steps first) with a progress indicator, a browser draft for steps 1–3,
a "Google ile doldur" shortcut on step 4, one-short-sentence writing questions (min. 15 characters) and bike-brand
suggestions — same questions, less effort.

**Architecture:** One `<form>` keeps every field mounted; inactive steps are `hidden`, so `FormData`, the Zod schema,
the touched/blur logic and the single server action stay. A pure step map (`src/lib/applications/steps.ts`) decides
which field belongs to which step; a pure draft module (`src/lib/applications/draft.ts`) builds/parses the
localStorage draft from that map. The step lives in `?step=N` via `window.history.pushState`.

**Tech Stack:** Next.js 16 App Router (Cache Components, React Compiler), next-intl, Zod 4, shadcn/ui `base-nova`
(Base UI), `node --test`, puppeteer-core E2E scripts.

**Spec:** `docs/superpowers/specs/2026-11-11-application-form-steps-design.md` — read it first; this plan argues from it.

## Global Constraints

- Branch `feat/apply-steps` from `main`; Conventional Commits; author `iltan <iltancanerr@gmail.com>`; **no
  `Co-Authored-By` or any attribution trailer**. No worktrees. Don't commit `.claude/settings.json` (iltan's pending
  local change).
- **No DB change, no migration.** The server action and the admin view stay as they are.
- Steps, in order: `riding` "Sürüş" → `club` "Kulüp" → `words` "Kendi sözlerinle" → `you` "Seni tanıyalım" (with the
  sub-heading "Onaylar" for the consents). Step numbers are 1-based everywhere (URL `?step=1..4`).
- Writing questions: `expectations`, `alienating_behaviors`, `conflict_handling` → `text(15, 1000)`.
- Draft: localStorage key `rv-apply-draft`, version `1`, max age 7 days, **only fields of steps 1–3** + UTM; never
  contact fields, never consents.
- No hard-coded UI strings: `messages/tr.json` (source of truth) + `messages/en.json`. Keep `Apply.sections.*` (the
  admin application page uses them). Remove messages that lose their purpose (dead-code rule).
- Client-only reads (localStorage, user agent) never happen during the server render; follow the
  `useSyncExternalStore(noSubscribe, client, server)` pattern used in `src/components/auth/user-menu-skeleton.tsx`
  instead of `setState` inside an effect.
- Unit tests: `node --test` runs `*.test.ts` directly — no `@/` aliases, imports need the `.ts` extension
  (`docs/learnings/testing.md`). Logic under test lives in modules with relative `.ts` imports.
- Read before touching: `docs/learnings/forms.md`, `docs/learnings/testing.md`, `docs/learnings/ui.md`,
  `docs/learnings/nextjs.md`. Add entries for anything non-obvious found on the way, in the same commit.
- Never log personal data. Never `console.log` draft contents.
- Before every code commit: `pnpm lint && pnpm exec tsc --noEmit && pnpm test`. `pnpm build` in Tasks 4, 7 and 9.
- Local server for browser checks: `pnpm build && pnpm start -p 3123`; stop with
  `kill $(ss -ltnp | grep ':3123 ' | grep -oP 'pid=\K[0-9]+')` (never `pkill -f`).

## Review Focus

1. **Enter in a text input on steps 1–3** (e.g. in "riding years") — behaves like "Devam" (validate the step, go on),
   never submits the application early or jumps to step 4's errors. Pinned in Task 4 (helper) and Task 8 (E2E).
2. **A debounced draft save firing after a successful submit** — would re-create the draft that was just deleted.
   Pending saves are cancelled on success; E2E waits longer than the debounce and asserts no draft. Pinned in Tasks 5
   and 8.
3. **Switching language mid-form** (`router.replace` drops `?step`) — answers of steps 1–3 and the step survive via the
   draft; a pending debounced save is flushed on unmount/`pagehide`. Pinned in Tasks 5 and 8.
4. **Deep link `/apply?step=4` with empty earlier steps** (or a server `invalid` result for an earlier step) — submit
   jumps to the first step with an error and focuses the field. Pinned in Task 1 (`firstStepWithError`) and Task 8.
5. **Restoring conditional answers** ("owns a motorcycle: yes" + brand/model, "other" event + text) — the dependent
   fields are visible and filled after a reload. Pinned in Task 8.

---

### Task 1: Step map and schema changes

**Files:**
- Create: `src/lib/applications/steps.ts`, `src/lib/applications/steps.test.ts`, `src/lib/applications/schema.test.ts`
- Modify: `src/lib/applications/schema.ts`

**Interfaces:**
- Produces (`steps.ts`, imports only `./schema.ts` types):
  - `type ApplyStepId = "riding" | "club" | "words" | "you"`
  - `const APPLY_STEPS: readonly { id: ApplyStepId; fields: readonly string[] }[]` — field lists exactly as in the
    spec's §1 table (`you` = full_name, phone, email, birth_date, city_choice, city, district, instagram, languages,
    other_languages, consent_privacy, consent_rules, consent_photos)
  - `const STEP_COUNT = 4`
  - `parseStep(value: string | null | undefined): number | null` — `"1"`…`"4"` → number; anything else → `null`
  - `stepOfField(field: string): number | null` (1-based)
  - `errorsOfStep(fieldErrors: ApplicationFieldErrors, step: number): ApplicationFieldErrors`
  - `firstStepWithError(fieldErrors: ApplicationFieldErrors): number | null` — lowest step that has an error; an error
    on a field outside every step (e.g. `locale`) counts as step 1
  - `isLastStep(step: number): boolean`
- Produces (`schema.ts`): `export const APPLICATION_FIELDS: readonly string[]` (keys of the base `z.object`, before
  refines/transform — split the object into its own `const`), `export const ARRAY_FIELDS: ReadonlySet<string>`
  (existing set, now exported).

- [ ] **Step 1: Make `schema.ts` importable by `node --test`** — replace `@/lib/birth-date`, `@/lib/istanbul-districts`
  with `../birth-date.ts`, `../istanbul-districts.ts`, and `./contact`, `./options` with `.ts` paths (the
  `database.types` import is `import type`, erased). Check `contact.ts`/`options.ts` the same way. Run
  `pnpm exec tsc --noEmit` → clean.

- [ ] **Step 2: Write the failing tests**

`schema.test.ts`:
```ts
test("writing questions need at least 15 characters", () => {
  for (const field of ["expectations", "alienating_behaviors", "conflict_handling"]) {
    assert.equal(validateField(field, "a".repeat(14)), "tooShort");
    assert.equal(validateField(field, "Sakin konuşurum!"), undefined); // 16 chars
  }
});
```
(`validateField` = a local test helper: a valid baseline `FormData`, one field overridden, returns
`fieldErrors[field]`.) Plus: `"a valid baseline application passes"`.

`steps.test.ts`:
```ts
test("every schema field except locale and UTM belongs to exactly one step", () => {
  const stepFields = APPLY_STEPS.flatMap((s) => s.fields);
  assert.equal(new Set(stepFields).size, stepFields.length);
  const expected = APPLICATION_FIELDS.filter((f) => f !== "locale" && !f.startsWith("utm_"));
  assert.deepEqual([...stepFields].sort(), [...expected].sort());
});
test("steps are riding, club, words, you", () =>
  assert.deepEqual(APPLY_STEPS.map((s) => s.id), ["riding", "club", "words", "you"]));
test("parseStep accepts 1-4 only", () => {
  assert.equal(parseStep("3"), 3);
  for (const v of [null, undefined, "", "0", "5", "2.5", "abc", " 2"]) assert.equal(parseStep(v), null);
});
test("firstStepWithError picks the earliest step", () => {
  assert.equal(firstStepWithError({ email: "required", expectations: "tooShort" }), 3);
  assert.equal(firstStepWithError({ license_class: "required", consent_rules: "mustAccept" }), 1);
  assert.equal(firstStepWithError({}), null);
  assert.equal(firstStepWithError({ locale: "invalidOption" }), 1);
});
test("errorsOfStep keeps only that step's fields", () =>
  assert.deepEqual(errorsOfStep({ email: "required", riding_years: "invalidNumber" }, 1), { riding_years: "invalidNumber" }));
```

- [ ] **Step 3: Run** `pnpm test` → the new tests FAIL (missing module / `tooShort` not raised for 14 chars on
  `alienating_behaviors`).

- [ ] **Step 4: Implement** `steps.ts` and the schema changes (`text(15, 1000)` ×3, `APPLICATION_FIELDS`, exported
  `ARRAY_FIELDS`).

- [ ] **Step 5: Run** `pnpm lint && pnpm exec tsc --noEmit && pnpm test` → all PASS.

- [ ] **Step 6: Commit** `feat(apply): step map and 15-character minimum for the writing questions`

---

### Task 2: Draft module

**Files:**
- Create: `src/lib/applications/draft.ts`, `src/lib/applications/draft.test.ts`

**Interfaces:**
- Consumes: `APPLY_STEPS`, `STEP_COUNT` (Task 1), `ARRAY_FIELDS` (Task 1), `UTM_KEYS` (`options.ts`).
- Produces:
  - `const DRAFT_KEY = "rv-apply-draft"`, `const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000`
  - `type ApplyDraft = { v: 1; savedAt: string; step: number; fields: Record<string, string | string[]>; utm: Partial<Record<(typeof UTM_KEYS)[number], string>> }`
  - `const DRAFT_FIELDS: ReadonlySet<string>` — fields of steps 1–3 (derived from `APPLY_STEPS`, not hand-listed)
  - `buildDraft(formData: FormData, step: number, now: Date): ApplyDraft | null` — keeps only `DRAFT_FIELDS` (arrays
    via `getAll` for `ARRAY_FIELDS`), drops empty strings/arrays, keeps values untrimmed (it's the person's typing);
    UTM from the form's hidden UTM inputs; `null` when no draft field has a value (UTM alone doesn't count)
  - `parseDraft(raw: string | null, now: Date): ApplyDraft | null` — `null` for: not JSON, `v !== 1`, `savedAt`
    unparsable or older than `DRAFT_MAX_AGE_MS` (or in the future by more than a day), wrong shapes; drops keys not in
    `DRAFT_FIELDS` and non-string values; clamps `step` to 1..`STEP_COUNT`
  - `type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">`
  - `browserStorage(): DraftStorage | null` — `window.localStorage` inside try/catch (throws in some private modes /
    webviews)
  - `readDraft(storage: DraftStorage | null, now: Date): ApplyDraft | null` — removes the key when the stored value is
    invalid/expired
  - `writeDraft(storage: DraftStorage | null, draft: ApplyDraft | null): void` — `null` removes the key; storage errors
    (quota, disabled) are swallowed
  - `clearDraft(storage: DraftStorage | null): void`

- [ ] **Step 1: Write the failing tests** (`draft.test.ts`, with an in-memory `DraftStorage` fake):
  - `"buildDraft keeps steps 1-3 and never contact fields or consents"` — a `FormData` with every field of every step
    plus UTM → `Object.keys(draft.fields)` equals `DRAFT_FIELDS` filled ones; none of `full_name, phone, email,
    birth_date, city_choice, city, district, instagram, languages, other_languages, consent_privacy, consent_rules,
    consent_photos`; `riding_styles` is an array.
  - `"buildDraft returns null without any step 1-3 answer"` — only `locale`, UTM and `full_name` → `null`.
  - `"parseDraft round-trips a fresh draft"`, `"parseDraft rejects expired, future, other-version and malformed drafts"`
    (8 days old → null; `v: 2` → null; `"{"` → null; `fields: []` → null), `"parseDraft drops unknown fields and
    clamps the step"` (`fields.email` dropped, `step: 9` → 4).
  - `"readDraft removes an invalid stored draft"`, `"writeDraft(null) removes the key"`, `"storage that throws doesn't
    break read/write"`.

- [ ] **Step 2: Run** `pnpm test` → FAIL (module missing).
- [ ] **Step 3: Implement** `draft.ts` (relative `.ts` imports only).
- [ ] **Step 4: Run** `pnpm lint && pnpm exec tsc --noEmit && pnpm test` → PASS.
- [ ] **Step 5: Commit** `feat(apply): browser draft for the first three steps`

---

### Task 3: Move the field building blocks out of `apply-form.tsx`

Pure refactor, no visible change: `apply-form.tsx` is 600 lines and Tasks 4–6 add to it.

**Files:**
- Create: `src/components/apply/apply-fields.tsx` (`"use client"`)
- Modify: `src/components/apply/apply-form.tsx`

**Interfaces:**
- Produces (exported from `apply-fields.tsx`): `TextField`, `TextAreaField`, `ChoiceRadios`, `ChoiceChips`,
  `ConsentCheckbox`, `OptionalTag` with their current props, plus the additions later tasks need:
  - `TextAreaField`: `placeholder?: string`, `defaultValue?: string`
  - `ChoiceChips`: `defaultValues?: readonly T[]` (initial `selected`)
  - `TextField`: `list?: string` passes through already via input props — no change

- [ ] **Step 1: Move** the five components (+ `OptionalTag`) to `apply-fields.tsx`, add the props above, import them in
  `apply-form.tsx`. `TextAreaField` drops `rows={3}` (the shadcn `Textarea` uses `field-sizing-content` +
  `min-h-16`, i.e. ~2 rows that grow).
- [ ] **Step 2: Run** `pnpm lint && pnpm exec tsc --noEmit && pnpm test` → PASS; `pnpm dev`, open `/apply`: the form
  looks and validates as before (textareas now start at 2 rows).
- [ ] **Step 3: Commit** `refactor(apply): move the form's field components to their own file`

---

### Task 4: Steps, navigation and the writing step

**Files:**
- Modify: `src/components/apply/apply-form.tsx`, `src/app/[locale]/apply/page.tsx` (intro only),
  `src/lib/applications/options.ts`, `messages/tr.json`, `messages/en.json`
- Possibly create: `src/components/apply/step-header.tsx` (progress label + bar) if it keeps `apply-form.tsx` readable

**Interfaces:**
- Consumes: `APPLY_STEPS`, `STEP_COUNT`, `parseStep`, `errorsOfStep`, `firstStepWithError`, `isLastStep`, `stepOfField`
  (Task 1); field components (Task 3).
- Produces: in `options.ts`, `MOTORCYCLE_BRAND_SUGGESTIONS: readonly string[]` = Honda, Yamaha, Kawasaki, Suzuki, BMW,
  KTM, Ducati, Triumph, Harley-Davidson, CFMoto, Benelli, Bajaj, Kuba, Mondial, RKS, Voge, Kymco, SYM, Vespa,
  Royal Enfield, Aprilia, Husqvarna, Piaggio, Zontes. In `apply-form.tsx`, a `goToStep(step: number, mode: "push" |
  "replace")` helper that Task 5 and Task 6 reuse.

Behaviour (spec §1–§3):
- **Current step** = `parseStep(searchParams.get("step")) ?? 1` (Task 5 adds the draft's step as the middle fallback).
  `goToStep` writes `?step=N` with `window.history.pushState` (or `replaceState`), keeping every other param (UTM);
  then scrolls to top and focuses the step heading (`tabIndex={-1}`).
- Each step is a wrapper with `hidden={step !== n}` around today's fields, in the new order and grouping (spec §1
  table). Step 4 = contact fields, then a `FieldSet` with legend `Apply.sections.consents`, then the server-status
  alert and the submit button.
- **Header:** `t("progress", { step, total })` + " · " + step title, and a progress bar (`role="progressbar"` with
  `aria-valuenow/min/max`, or the shadcn `progress` component if added via `pnpm dlx shadcn@latest add progress`).
- **Buttons:** "Geri" (outline, from step 2: `goToStep(step - 1, "push")`) and "Devam" / "Başvuruyu gönder"; full width
  on phones, side by side from `sm`.
- **Error visibility:** an error shows when the field was touched, or its step is in a `checkedSteps` set (added when
  "Devam" was pressed on it), or after a submit attempt (all steps).
- **`onSubmit`** (also fired by Enter in an input): validate the whole form. On steps 1–3: if `errorsOfStep` for the
  current step is non-empty → mark step checked, focus its first invalid field, stay; otherwise `goToStep(step + 1,
  "push")`. On step 4: today's flow; on client errors `goToStep(firstStepWithError(errors)!, "push")` and focus the
  first invalid field of that step (replace today's scroll-to-first-invalid effect, which can't see hidden steps); on a
  server `invalid` result do the same with the server's field errors. Success/duplicate/error as today.
- **Writing step:** hint `Apply.wordsHint` under the step header; `expectations` gets
  `placeholder={t("fields.expectationsPlaceholder")}`; the other two no placeholder.
- **Brand:** `motorcycle_brand` gets `list="motorcycle-brands"` and a `<datalist id="motorcycle-brands">`.

Messages (TR / EN):
- `Apply.intro`: "4 kısa adımda, yaklaşık 3 dakikada biter. Başvurunu inceledikten sonra WhatsApp üzerinden sana
  ulaşacağız." / "4 short steps, about 3 minutes. We'll review your application and reach out on WhatsApp."
- `Apply.progress`: "Adım {step}/{total}" / "Step {step} of {total}"
- `Apply.steps.{riding,club,words,you}`: "Sürüş", "Kulüp", "Kendi sözlerinle", "Seni tanıyalım" / "Riding", "Club",
  "In your own words", "About you"
- `Apply.next`: "Devam" / "Next"; `Apply.back`: "Geri" / "Back"
- `Apply.wordsHint`: "Kısa bir cümle yeter." / "A short sentence is enough."
- `Apply.fields.expectationsPlaceholder`: "ör. Yeni rotalar keşfetmek ve birlikte güvenli sürüşler" / "e.g. Discovering
  new routes and riding safely together"
- `Apply.formHasErrors` stays (used on step 4). Grep every `Apply.*` key after the change; remove keys no longer used
  anywhere (keep `sections.*`).

- [ ] **Step 1: Implement** the above.
- [ ] **Step 2: Run** `pnpm lint && pnpm exec tsc --noEmit && pnpm test && pnpm build` → PASS.
- [ ] **Step 3: Browser check** (`pnpm start -p 3123`, 390px; JS on): step 1 shows "Adım 1/4 · Sürüş"; "Devam" on an
  empty step 1 shows only step-1 errors and focuses "Ehliyet sınıfı"; a filled step 1 → `?step=2`, heading focused;
  phone back → step 1 with answers kept; Enter in "riding years" on a valid step 1 → step 2 (no request to the server
  action in the Network tab); `/apply?step=4` + submit with everything empty → step 1, first field focused; brand input
  suggests "Honda" after "Ho"; `/en/apply` texts English.
- [ ] **Step 4: Commit** `feat(apply): show the application form in four steps, easy ones first`

---

### Task 5: Draft wiring and privacy notice

**Files:**
- Modify: `src/components/apply/apply-form.tsx`, `src/lib/applications/options.ts` (`PRIVACY_NOTICE_VERSION`),
  `src/app/[locale]/privacy/content-tr.tsx`, `src/app/[locale]/privacy/content-en.tsx`, `messages/tr.json`,
  `messages/en.json`

**Interfaces:**
- Consumes: `buildDraft`, `readDraft`, `writeDraft`, `clearDraft`, `browserStorage`, `ApplyDraft` (Task 2);
  `goToStep` (Task 4).

Mechanism (decided):
- `ApplyForm` becomes a thin wrapper: `const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false)` and
  a `resetCount` state; it renders `<ApplyFormSteps key={`${hydrated}-${resetCount}`} … />`. The inner component reads
  the draft once in a `useState` initializer: `useState(() => hydrated ? readDraft(browserStorage(), new Date()) :
  null)`. The server render (and the hydration pass) has no draft; the client remount picks it up. On client-side
  navigation `hydrated` is already true, so there is no remount.
- Defaults from the draft feed every step 1–3 field (`defaultValue`, `ChoiceRadios defaultValue`, `ChoiceChips
  defaultValues`) and the conditional-section states (`ownsBike`, `otherClubs`, `heardFrom`, `events`).
- Current step = `parseStep(?step) ?? draft?.step ?? 1`.
- UTM hidden inputs: URL value if present, else `draft.utm`.
- **Save:** on form change/blur and on every step change → debounce 500 ms → `writeDraft(storage, buildDraft(new
  FormData(form), step, new Date()))` (`null` → key removed). Flush a pending save on unmount and on `pagehide`.
  On submit success: cancel the pending save, then `clearDraft`.
- **Line when a draft was restored:** above the step header, muted text `Apply.draft.restored` + a link-style button
  `Apply.draft.startOver` → `clearDraft`, `goToStep(1, "replace")`, `resetCount + 1` (remount empty). The inner
  component gets `hydrated` as a prop for its initializer.
- **Privacy notice:** append to the "Teknik veriler" / "Technical data" list item; bump `PRIVACY_NOTICE_VERSION` to
  `"2026-11-11-draft-2"`.

Messages (TR / EN):
- `Apply.draft.restored`: "Kaldığın yerden devam ediyorsun." / "You're continuing where you left off."
- `Apply.draft.startOver`: "Baştan başla" / "Start over"
- Privacy (in the content files, not messages): "Başvuru formunu doldururken cevapların (iletişim bilgileri ve onaylar
  hariç) gönderene kadar yalnızca kendi tarayıcında saklanır ve bize ulaşmaz; başvuruyu gönderdiğinde ya da 7 gün
  sonra silinir." / "While you fill in the application form, your answers (except contact details and consents) are
  kept only in your own browser until you submit and don't reach us; they are deleted when you submit or after 7
  days."

- [ ] **Step 1: Implement** the above.
- [ ] **Step 2: Run** `pnpm lint && pnpm exec tsc --noEmit && pnpm test` → PASS.
- [ ] **Step 3: Browser check** (`pnpm dev`, 390px): fill step 1 + "owns: yes" + brand, go to step 3, type an
  expectation, reload → step 3, all answers back, bike fields visible, line shown; DevTools → localStorage
  `rv-apply-draft` has no contact/consent keys; "Baştan başla" → step 1, empty, key gone; switch language on step 2 →
  `/en/apply` opens on step 2 with answers; no hydration warning in the console.
- [ ] **Step 4: Commit** `feat(apply): keep answers of the first three steps in the browser`

---

### Task 6: "Google ile doldur" on step 4

**Files:**
- Modify: `src/components/apply/apply-form.tsx` (or a new `src/components/apply/google-fill.tsx`), `messages/tr.json`,
  `messages/en.json`

**Interfaces:**
- Consumes: `signInWithGoogle(formData: FormData)` (`src/lib/auth/actions.ts`, field `next`), `detectInAppBrowser`
  (`src/lib/auth/in-app-browser.ts`), `getPathname` (`@/i18n/navigation`), draft save (Task 5), `GoogleIcon`
  (`src/components/auth/google-icon.tsx`).

Behaviour (spec §5):
- Shown only when `defaults` is undefined (signed out — `ApplyGate` passes `defaults` only for signed-in users, so no
  gate change) **and** the user agent is known and not in-app:
  `useSyncExternalStore(noSubscribe, () => navigator.userAgent, () => null)`; `null` (server) → hidden.
- Placement: top of step 4, before "Ad soyad": outline button with `GoogleIcon` + `Apply.google.button`, hint
  `Apply.google.hint` below.
- `type="button"` (it sits inside the application `<form>`; no nested form). On click: flush the draft with step 4,
  then `startTransition(() => signInWithGoogle(fd))` where `fd.next = getPathname({ href: "/apply", locale }) +
  "?step=4"`. Button disabled while pending.

Messages (TR / EN): `Apply.google.button`: "Google ile doldur" / "Fill in with Google"; `Apply.google.hint`: "Ad ve
e-postan otomatik gelir." / "Your name and email are filled in automatically."

- [ ] **Step 1: Implement** the above.
- [ ] **Step 2: Run** `pnpm lint && pnpm exec tsc --noEmit && pnpm test` → PASS.
- [ ] **Step 3: Browser check** (`pnpm dev`): step 4 shows the button; DevTools device "Instagram" UA (append
  `Instagram 300.0.0.0`) → hidden; click (normal UA) → browser goes to the local Supabase `/auth/v1/authorize` URL whose
  `redirect_to` contains `next=%2Fapply%3Fstep%3D4` (`/en/apply` on English). If the programmatic action call doesn't
  follow the external redirect, record it in `docs/learnings/nextjs.md` and switch to a sibling `<form
  id=… action={signInWithGoogle}>` rendered after the application form with `form={id}` on the button (pattern in
  `docs/learnings/forms.md`).
- [ ] **Step 4: Commit** `feat(apply): offer Google sign-in to fill name and email on the last step`

---

### Task 7: Skeleton for the new first step

**Files:**
- Modify: `src/app/[locale]/apply/page.tsx` (`ApplySkeleton`), `src/components/apply/apply-form.tsx`
  (`data-skeleton-result="apply"` on the element the skeleton mirrors: step header + step 1)

- [ ] **Step 1: Redraw** `ApplySkeleton` as: progress line + bar, then step 1 rows (licence pills, riding-years label +
  narrow input, owns-motorcycle pills, riding-styles label + hint + chips, group-experience pills), then the button row.
  Use `cn` in `Line` and document the `InputRow` input heights while touching it (follow-up "ApplySkeleton cleanups").
- [ ] **Step 2: Measure** with JS off: `pnpm build && pnpm start -p 3123`, then
  `PUPPETEER_DIR=~/e2e-tools node scripts/e2e/skeletons.mjs http://localhost:3123 <scratch>/apply.md /apply /en/apply`
  → Δh 0 (or within 1 px) for both locales; switch language and back, the fallback keeps its shape.
- [ ] **Step 3: Run** `pnpm lint && pnpm exec tsc --noEmit && pnpm test && pnpm build` → PASS.
- [ ] **Step 4: Commit** `fix(apply): skeleton mirrors the first step`

---

### Task 8: Browser E2E for the stepped form

**Files:**
- Create: `scripts/e2e/apply-e2e.mjs`
- Modify: `scripts/e2e/README.md`

Structure like `scripts/e2e/members-e2e.mjs` (`check()` PASS/FAIL lines, exit code ≠ 0 on failure, `fresh()`
contexts, `until()` polling, `OUT_DIR` screenshots), against `pnpm start -p 3123`. Test email
`apply-e2e@test.local`; delete its application before and after via `docker exec … psql` (local DB only).

Checks (each one `check(...)`):
- [ ] `step1-errors-only`: "Devam" on empty step 1 → URL has no `?step=2`, step-1 errors visible, no step-2 errors in
  the DOM text, focused element is inside the licence group.
- [ ] `enter-acts-as-next` (Review Focus 1): valid step 1, Enter in riding years → `?step=2`, no POST to `/apply`.
- [ ] `back-button`: on step 2 `page.goBack()` → step 1 visible, answers kept.
- [ ] `draft-restore` (Review Focus 5): owns bike yes + brand "Honda" + model, event "other" + text, go to step 3, type
  an expectation, wait 700 ms, reload → step 3, expectation text back, line `Apply.draft.restored` visible; back to
  step 1 → brand "Honda" visible.
- [ ] `draft-no-personal-data`: after filling step 4 name/phone/email and waiting 700 ms, `localStorage` value has none
  of the step-4 keys and none of the typed contact strings.
- [ ] `language-switch-keeps-draft` (Review Focus 3): on step 2, switch to EN via the header switcher → `/en/apply`
  shows step 2 with answers.
- [ ] `start-over`: "Baştan başla" → step 1, empty, `localStorage` key absent.
- [ ] `deep-link-step4` (Review Focus 4): fresh context `/apply?step=4`, fill step 4 + consents, submit → step 1
  visible, focus in step 1.
- [ ] `writing-minimum`: 14 characters → `tooShort` text; 15 → no error.
- [ ] `submit-clears-draft` (Review Focus 2): full valid application → success card; wait 1500 ms → no
  `rv-apply-draft`; DB has the row (then delete it).
- [ ] `google-button`: signed out, step 4 → button visible; click with request interception → request to
  `127.0.0.1:54321/auth/v1/authorize` whose `redirect_to` contains `next=%2Fapply%3Fstep%3D4` (abort it);
  Instagram UA context → button absent.
- [ ] `signed-in-no-google` (needs email sign-in, `docs/learnings/testing.md`): as `pending-noapp@test.local` → step 4
  shows no Google button, email prefilled. Skip with a `SKIP` line when the user doesn't exist.
- [ ] **Run:** `PUPPETEER_DIR=~/e2e-tools node scripts/e2e/apply-e2e.mjs` → all PASS (screenshots of each step at
  390px in `OUT_DIR`; look at them).
- [ ] **README:** add an `apply-e2e.mjs` entry (what it covers, server, fixtures, cleanup).
- [ ] **Commit** `test(apply): browser E2E for steps, draft and Google fill`

---

### Task 9: Docs and final verification

**Files:**
- Modify: `docs/application-form.md`, `docs/follow-ups.md`, `docs/learnings/*.md` (as needed)

- [ ] **Step 1: `docs/application-form.md`** — status line; a "Steps" section (order, mapping, why easy first; the
  section tables keep the review order); writing questions min. 15 characters + hint/placeholder; brand suggestions;
  "Draft" (what is stored, 7 days, deleted on submit, never contact/consents); "Google fill" on step 4.
- [ ] **Step 2: `docs/follow-ups.md`** — remove "Application form UX: same questions, less effort"; add "measure the
  application funnel (opened → each step → sent)" to the Vercel Web Analytics item; update "ApplySkeleton cleanups"
  (remove what Task 7 did); add: the skeleton mirrors step 1 only (a restored draft or `?step=N` opens another step);
  plus every deferred/minor item from the reviews.
- [ ] **Step 3: Full verification** — `pnpm lint && pnpm exec tsc --noEmit && pnpm test && pnpm db:test && pnpm build`;
  `apply-e2e.mjs`, `nav-e2e.mjs`, `header-e2e.mjs` and `skeletons.mjs /apply /en/apply` against `pnpm start -p 3123`
  → all PASS.
- [ ] **Step 4: Commit** `docs(apply): steps, draft and Google fill in the form spec; follow-ups`
- [ ] **Step 5:** whole-branch review (`superpowers:requesting-code-review`); no `/security-review` needed (no RLS or
  grant change), but the reviewer checks: draft whitelist, `next` path, no personal data in logs. Then iltan reviews
  and merges with `--no-ff`; rollout = push `main` (no `db push`).
