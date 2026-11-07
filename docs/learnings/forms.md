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
