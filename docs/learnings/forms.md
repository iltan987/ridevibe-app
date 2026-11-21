# Forms & validation learnings

### Zod 4: cross-field rules are skipped while other fields have errors (2026-11-08)
- **Cause:** refinements/superRefine don't run after non-continuable issues.
- **Do:** one `.refine()` per rule with `{ path, error, when: onlyIf("a", "b") }` — `when` checks only the issues of
  the fields the rule depends on (see `src/lib/applications/schema.ts`).
- Zod 4 API reminders: `{ error: "key" }` (not `message`), `z.email()`, `z.iso.date()`, `z.flattenError()`.
- **Source:** zod.dev v4 docs ("when").

### Error messages as i18n keys (2026-11-07)
- **Do:** schema errors are keys (`ApplyErrorKey`); the form maps them with `t(\`errors.${key}\`)`. Same schema runs in
  the browser and in the server action.

### Don't use `<form action={serverAction}>` for long forms (2026-11-07)
- **Cause:** React 19 resets uncontrolled forms after a form action, wiping input on validation errors.
- **Do:** `onSubmit` + `preventDefault` + `startTransition(async () => await action(formData))`.

### Errors only for touched fields (2026-11-08)
- **Do:** track touched names via form-level `onBlur` (`closest("[data-field]")`), show all errors after a submit
  attempt, re-validate the whole form on change/blur. Every field wrapper has `data-field={name}`.

### Bot protection: honeypot, not a timer (2026-11-07)
- **Do:** hidden `website` field → pretend success. A "submitted too fast" check depends on the client clock and can
  reject real users — skipped. Vercel BotID is the planned upgrade.

### react-phone-number-input (v3.4) (2026-11-08)
- Built on libphonenumber-js; `onChange` gives E.164. With `international withCountryCallingCode
  countryCallingCodeEditable={false} defaultCountry="TR"` it shows `+90 546 123 45 67`.
- **Gotcha:** typing a Turkish trunk `0` ("0546…") → the **value** drops it (`+90546…`) but the **displayed text**
  keeps `+90 0546…`. So submit the value via a hidden input (visible input has no `name`), and re-format on blur by
  re-mounting (`key`) — only when focus leaves the whole field, otherwise the country `<select>` breaks.
  Pasted `90546…` must be fixed manually (`fixTurkishNumber`).
- Pass `flags` from `react-phone-number-input/flags` — the default loads flag images from a third-party site
  (privacy/KVKK).
- Validate with `isPossiblePhoneNumber` (author's advice: `isValidPhoneNumber` can go stale on new number ranges).

### Native `<input type="date">` (2026-11-08)
- Displays in the **device/browser** locale (e.g. mm/dd/yyyy on a US-region PC) but the value is always
  `YYYY-MM-DD`, so the server reads it correctly. No custom date picker needed.

### No `refresh()` after submitting the application (2026-11-09)
- **Cause:** `/apply` renders through `ApplyGate`, which shows "under review" to a signed-in applicant with an open
  application. A `refresh()` after a successful insert would re-render the page server-side and swap the client
  success card (which repeats the submitted email) for that notice.
- **Do:** `submitApplication` deliberately skips `refresh()` (exception to the Server Action convention); the next
  visit to `/apply` shows the notice anyway.
- **Consequence (2026-11-11):** other streamed parts of the page keep their old answer too: the nav's "Başvur" stayed
  after a signed-in submit (browser check). Anything that must react to the submit goes through client state set where
  the result is handled (`markApplySubmitted` in `apply-form.tsx`, read by the navs).
- **Source:** design decision from how `ApplyGate` and `refresh()` work; the nav consequence found by testing.

### A form inside a form: link controls with the `form` attribute, render the `<form>` outside (2026-11-11)
- **Symptom:** the one-time birth-date entry inside the visibility card did nothing on submit: no request, no error.
- **Cause:** its (empty) `<form id>` was rendered by a child component that sat *inside* the visibility `<form>`, so the
  forms were nested after all. Nested forms are invalid HTML; the browser ignores the inner form when submitting.
- **Do:** render the extra `<form id=… onSubmit=…/>` as a sibling *after* the outer form and point its controls at it
  with `form={id}` (input and submit button). Enter in such an input submits only that form. Example:
  `src/components/profile/visibility-form.tsx` (`BIRTH_DATE_FORM_ID`).
- **Source:** found by testing (members E2E, birth-date-once).

### `useState(prop)` keeps its first value after `refresh()`; don't derive it from another prop (2026-11-11)
- **Symptom:** after the one-time birth-date entry, the birthday switch showed "off" although the DB (and the
  directory) said on; pressing the card's "Kaydet" would then have written `show_birthday = false`.
- **Cause:** `useState(birthDate ? showBirthday : false)` ran once while `birthDate` was null. `refresh()` re-renders
  the Server Component with new props, but a mounted client component keeps its state, so the switch stayed false.
- **Do:** initialise state from the stored value only (`useState(showBirthday)`) and apply display conditions at
  render (`checked={!!birthDate && birthdayOn}`). Never send a value the user couldn't see or change (a disabled
  switch) as anything but the stored one. Example: `src/components/profile/visibility-form.tsx`.
- **Source:** found by the members E2E (birthday-shown-by-default).

### Stepped form: one `<form>`, Enter = "Next", hidden steps (2026-11-11)
- **Symptom (risk):** Enter in a text input of an early step would submit the whole application.
- **Cause:** implicit submission fires the form's `submit` event from any single-line input (the default button is the
  first `type="submit"` in tree order); textareas keep Enter as a newline.
- **Do:** one submit button whose label is "Devam" on steps 1–3; `onSubmit` checks `isLastStep(step)` and only
  validates/advances before the last step. Inactive steps are `hidden` (still in `FormData`); Tailwind 4 preflight's
  `[hidden] { display: none !important }` beats a wrapper's own `flex` class. Focus the first invalid field from the
  error object in page order (`[data-step=N] [data-field]`), not from `[data-invalid=true]`: that attribute renders
  only after the state update and hidden steps can't take focus. Skip Base UI's own hidden inputs
  (`tabIndex -1`) and prefer the typing input over the phone field's country `<select>`.
- **Gotcha (E2E):** shadcn `FieldError` has `role="alert"`; detect the form's status line by its text.
- **Source:** found by testing (application steps Task 4).

### Restoring a browser draft: remount after hydration; a language switch reads it before the old form unmounts (2026-11-11)
- **Symptom:** answers typed just before switching the language (within the 500 ms save debounce) were lost on
  `/en/apply`, although the form flushes a pending save on unmount. Separately, "Baştan başla" (start over) emptied
  the form but the old answers were back in `localStorage` right after.
- **Cause:** `router.replace(pathname, { locale })` renders the new `[locale]` tree, including the new form's
  `useState` initialiser that reads the draft, *before* the old tree commits away and runs its effect cleanups, so an
  unmount flush writes too late. Start over: the button's click also bubbles to the form's `onClick` (which schedules
  a save), and the unmount flush then wrote the old answers back.
- **Do:** read client-only state in a `useState` initialiser of a component keyed by
  `useSyncExternalStore(noSubscribe, () => true, () => false)` (server/hydration render: no draft; the client remount
  restores it; client navigations read it at once). Flush the pending save when focus leaves the form
  (`onBlur` with `relatedTarget` outside `currentTarget`): opening the language menu moves focus first. Keep the
  `pagehide`/unmount flush for reloads. Before throwing a form away (success, start over), `stop()` the saver, not
  just cancel it. A flushed save may read a detached `<form>`: its inputs keep their values. Example:
  `src/components/apply/apply-form.tsx`, `createDraftSaver` in `src/lib/applications/draft.ts`.
- **Source:** found by testing (application steps Task 5, puppeteer: switch 155 ms after typing).

### React 19 types deprecate `FormEvent`: type `onSubmit` handlers with `SubmitEvent` (2026-11-15)
- **Symptom:** `@typescript-eslint/no-deprecated` on `React.FormEvent<HTMLFormElement>`.
- **Cause:** `@types/react` 19 marks `FormEvent` deprecated ("you probably meant ChangeEvent, InputEvent, SubmitEvent
  or SyntheticEvent").
- **Do:** `(event: React.SubmitEvent<HTMLFormElement>)` for submit handlers.
- **Source:** `node_modules/@types/react/index.d.ts`.

### `String(formData.get(name))` can print "null" or "[object File]" (2026-11-15)
- **Cause:** `FormData.get` returns `string | File | null`; `String()` stringifies whatever it gets.
- **Do:** read text fields with `formDataText(form, name)` (`src/lib/form-data.ts`: the string as is, `""` for a
  missing or file entry).
- **Source:** `no-base-to-string` lint hits (Task 2).

### Zod 4 never runs a transform after a failing refine: transform-time checks are safety nets (2026-11-15)
- **Cause:** a pipe stops at the first failing stage (`handlePipeResult`, zod 4.6.7), so a `.transform()` only sees
  values that passed every earlier refine.
- **Do:** when a transform reads an answer the refines already made required, don't assert it with `!`: check it and
  push a `"required"` issue (`ctx.issues.push`) for the field; the branch is unreachable for valid input but typed
  honestly (`src/lib/applications/schema.ts`).
- **Source:** zod source; Task 3.

### A create form left with `router.push` stays alive: reset it once it is hidden (2026-11-21)
- **Symptom (risk):** after "Oluştur" on `/events/new` and the push to the new event, browser back showed the filled
  form again; one more tap would create a duplicate event.
- **Cause:** with Cache Components Next keeps up to 3 left routes in a hidden React `<Activity>` and restores their
  state and DOM on back/forward (`node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md`). Resetting
  state in the submit handler instead flashes the empty form while the navigation runs.
- **Do:** set a `saved` ref on success and reset in a `useLayoutEffect` cleanup (runs when Activity hides the page):
  bump a `key` on the inner form (`EventForm` in `src/components/events/event-form.tsx`). Keep the submit disabled
  from success until the page is hidden (no second request from a double tap). An abandoned draft stays, as intended.
- **Source:** Next guide above; verified in the browser (back after create: empty title).

### An async read inside a list item: keep its request token in form state, not in a ref (2026-11-21)
- **Symptom (risk, review):** a "newest request wins" counter in a `useRef` of `PlaceField` restarts when the field
  remounts (the loop box hides and shows the finish, a key changes), so a late answer for text the organiser had
  already replaced could land; typing in the box didn't cancel the read in flight either.
- **Cause:** refs live and die with the component instance; the place lives in the form's state.
- **Do:** store the token with the item (`PlaceDraft.pending: number | null`): `startResolve` sets it, the answer goes
  through `settleResolve(p, token, …)`, which ignores a token that is no longer current, and typing (`typePaste`)
  clears it. Pure and unit-tested in `src/lib/events/form-state.ts`. Announce outcomes in one always-mounted polite
  status line per item; don't also render the error as `role="alert"` (it would be read twice).
- **Source:** events Task 7 review.
