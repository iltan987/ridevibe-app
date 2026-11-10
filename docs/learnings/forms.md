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
- **Source:** design decision from how `ApplyGate` and `refresh()` work (not reproduced in a browser).

### A form inside a form: link controls with the `form` attribute, render the `<form>` outside (2026-11-11)
- **Symptom:** the one-time birth-date entry inside the visibility card did nothing on submit: no request, no error.
- **Cause:** its (empty) `<form id>` was rendered by a child component that sat *inside* the visibility `<form>`, so the
  forms were nested after all. Nested forms are invalid HTML; the browser ignores the inner form when submitting.
- **Do:** render the extra `<form id=… onSubmit=…/>` as a sibling *after* the outer form and point its controls at it
  with `form={id}` (input and submit button). Enter in such an input submits only that form. Example:
  `src/components/profile/visibility-form.tsx` (`BIRTH_DATE_FORM_ID`).
- **Source:** found by testing (members E2E, birth-date-once).
