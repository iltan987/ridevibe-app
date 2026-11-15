# Tooling learnings (ESLint, typescript-eslint, Prettier, Tailwind class lint)

### Prettier's class sorting can flip which class wins a `cn` merge (2026-11-15)
- **Symptom (risk):** after `pnpm format`, an element renders with a different padding/colour although only the class
  order changed.
- **Cause:** `cn` merges like tailwind-merge: inside one string the *later* conflicting class wins.
  `prettier-plugin-tailwindcss` reorders the classes of a string (`cn`/`cva` arguments included), so two conflicting
  classes in one string can swap places.
- **Do:** never put conflicting classes in one string (`better-tailwindcss/no-conflicting-classes` reports them);
  overrides go in a separate, later `cn` argument (sorting stays within a string, the argument order is kept).
- **Source:** spec 2026-11-15 lint-format; Task 1 check (no conflicts in the code at the time).

### node:test's `test()` returns a promise: `no-floating-promises` flags every test (2026-11-15)
- **Symptom:** ~230 `no-floating-promises` errors, one per `test(...)` / `describe(...)` call in `*.test.ts`.
- **Cause:** node:test's functions return promises the runner awaits itself.
- **Do:** keep `allowForKnownSafeCalls: [{ from: "package", package: "node:test", name: ["test", "describe", "it",
  "suite"] }]` in `eslint.config.mjs` instead of `void test(...)`.
- **Source:** typescript-eslint `no-floating-promises` docs; measured on this repo.

### `void el.prop` (force a style recalculation) trips `no-meaningless-void-operator`, and its fix breaks lint (2026-11-15)
- **Symptom:** the autofix turns `void style.opacity` into a bare `style.opacity;`, which `no-unused-expressions` then
  rejects.
- **Cause:** the rule (typescript-eslint 8.72) flags `void` on anything that isn't a call.
- **Do:** use a call that reads the value, e.g. `getComputedStyle(el).getPropertyValue("opacity")` (`src/lib/theme.ts`).
- **Source:** found by linting (Task 2).

### A disable comment for a rule that is still off fails lint (2026-11-15)
- **Symptom:** `Unused eslint-disable directive (no problems were reported from '…')` on a justified disable.
- **Cause:** `linterOptions.reportUnusedDisableDirectives: "error"` counts a directive for an off rule as unused.
- **Do:** add the disable in the same commit that turns the rule on (or later), never before.
- **Source:** found by linting (Task 3).

### `assert.equal` narrows: an optional chain after it is "unnecessary" (2026-11-15)
- **Symptom:** `no-unnecessary-condition` on `r.error?.issues` right after `assert.equal(r.success, false)`.
- **Cause:** `node:assert/strict`'s `equal` is typed as an assertion function (`asserts actual is T`), so TypeScript
  narrows the union after it.
- **Do:** drop the `?.` (the assertion already guarantees the branch); use `assert.ok(x)` to narrow away `undefined`
  before using a value.
- **Source:** `@types/node` `assert` typings; found by linting (Task 2).

### `satisfies` keeps the narrow literal: a mutable fake can't be set to another value (2026-11-15)
- **Symptom:** `Type '"hidden"' is not assignable to type '"visible"'` when a test sets `state.visibilityState`.
- **Cause:** `{ visibilityState: "visible" } satisfies T` checks against `T` but keeps the inferred literal type.
- **Do:** annotate the variable instead (`const state: T = { … }`) when the value changes later.
- **Source:** checked with `tsc --strict` (2026-11-15).

### typescript-eslint is a direct dependency and comes with `eslint-config-next`: keep one version (2026-11-15)
- **Risk:** two versions load two plugin objects under the same `@typescript-eslint` key; flat config then fails with
  "Cannot redefine plugin".
- **Do:** after upgrading `typescript-eslint` or `eslint-config-next`, check `pnpm why typescript-eslint` shows one
  version (today 8.72.1, inside `eslint-config-next`'s `^8.56.0`).
- **Source:** ESLint flat config docs; checked on this repo (Task 2).

### better-tailwindcss: `dark` is "unknown", and canonical renames aren't always pixel-equal (2026-11-15)
- **Symptom:** `no-unknown-classes` on `className="dark …"`; `enforce-canonical-classes` rewrites `rounded` to
  `rounded-sm`.
- **Cause:** `dark` is no utility but the marker class our `dark` custom variant matches. `rounded` is a fixed 0.25rem,
  while this theme's `rounded-sm` is `calc(var(--radius) * 0.6)` = 0.225rem.
- **Do:** keep the `^dark$` ignore in `eslint.config.mjs`; review canonical renames that touch theme scales (radius,
  shadows) instead of trusting the autofix blindly.
- **Source:** found by linting (Task 4); compiled CSS compared.
