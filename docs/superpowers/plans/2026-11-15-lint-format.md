# Stricter Linting and Formatting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prettier (with Tailwind class sorting) plus type-aware, bypass-banning ESLint rules and Tailwind class
linting, run as one batch before each commit, with every current hit fixed.

**Architecture:** Config-only tooling (`prettier.config.mjs`, `eslint.config.mjs`, `package.json` scripts,
`.vscode/`); no hooks of any kind. The code changes are the fixes the new rules demand, done task by task so every
commit passes `lint`, `tsc`, `test` and `build`.

**Tech Stack:** Prettier 3.10, prettier-plugin-tailwindcss 0.8, ESLint 9 flat config, typescript-eslint 8.72
(`projectService`), @eslint-community/eslint-plugin-eslint-comments 4.8, eslint-plugin-better-tailwindcss 4.11,
Tailwind CSS 4, Next 16.

**Spec:** `docs/superpowers/specs/2026-11-15-lint-format-design.md`

## Global Constraints

- Install only: `prettier`, `prettier-plugin-tailwindcss`, `typescript-eslint`,
  `@eslint-community/eslint-plugin-eslint-comments`, `eslint-plugin-better-tailwindcss` (all `-D`). Not
  `eslint-plugin-prettier`; `eslint-config-prettier` only if a real conflict appears (Task 1 step).
- No PostToolUse hooks, no git hooks, no husky/lint-staged. Tools run as a batch before a commit:
  `pnpm format` → `pnpm lint:fix` → `pnpm lint`, then review the diff.
- Prettier: `printWidth: 120`, defaults otherwise; plugin options `tailwindStylesheet: "./src/app/globals.css"`,
  `tailwindFunctions: ["cn", "cva"]`. Ignore Markdown, SQL, `src/lib/supabase/database.types.ts`, build output.
- Rule principle: a rule is on only if it catches a bug or a type bypass; a stylistic rule only if `--fix` fixes it
  unaided. A rule turned off gets a one-line `// why` in the config.
- Casts: `assertionStyle: "never"` (`as const` allowed). No `!`, no `any`, no `@ts-*`. A remaining exception is an
  `eslint-disable-next-line <rule> -- <reason>` (never a file-wide or blanket disable).
- Every fix keeps behaviour: UI text, rendered markup and DB calls unchanged unless the fix removes a real bug, which
  the commit message names.
- CLAUDE.md git rules apply: stage by path, never `git add -A` / `commit -a`, never `git checkout -- .` / `restore .`
  / `reset --hard` / `stash` / `clean`; leave `.claude/settings.json` unstaged. No `Co-Authored-By` trailers.
- Verification for every commit touching code: `pnpm format:check && pnpm lint && pnpm exec tsc --noEmit &&
  pnpm test && pnpm build`.

## Review Focus

1. **Class sorting flips a merge winner** — `cn` (the `cn` package) merges like tailwind-merge: within one string the
   later conflicting class wins, so sorting a string with conflicting classes can change the rendered style. Expected:
   no visual change. Pinned by Task 1 Step 3 (conflicts resolved *before* the reformat).
2. **A cast replaced by parsing now throws or rejects** (FormData values, locale/select `onValueChange`, JSON from
   `localStorage`, RPC rows). Expected: same behaviour for valid input; invalid input falls back the way the old code
   effectively did (e.g. ignored), never an uncaught throw in a render or event handler. Pinned by Task 3 Step 4.
3. **Template/`String()` fixes change visible text** (`${a.motorcycle_brand} ${a.motorcycle_model}` with a null
   part, `String(formData.get(...))`). Expected: identical text for present values; a missing part no longer prints
   "null"/"undefined". Pinned by Task 2 Step 5.
4. **Prettier changes inline-script or JSX whitespace semantics** (`InlineScript` sources run via `toString()`/vm in
   tests; JSX text spacing). Expected: same rendered text and the vm-based unit tests still pass. Pinned by Task 1
   Step 6 (tests + a rendered-HTML spot check).
5. **Type-aware lint is slow or misses files** (`.mjs` scripts, `*.test.ts`, `next-env.d.ts`). Expected: TS files
   linted with types, JS files linted without type info and no parser errors. Pinned by Task 2 Step 2.

---

### Task 1: Prettier, Tailwind class sorting, editor settings and the reformat

**Files:**
- Create: `prettier.config.mjs`, `.prettierignore`, `.vscode/extensions.json`, `.vscode/settings.json`,
  `.git-blame-ignore-revs`
- Modify: `package.json` (devDeps + scripts), `pnpm-lock.yaml`, then every file Prettier rewrites

**Interfaces:**
- Produces: scripts `format` = `prettier --write .`, `format:check` = `prettier --check .`, `lint:fix` =
  `eslint --fix`. All five dev dependencies installed (later tasks only configure them).

- [ ] **Step 1: Install the five dev dependencies** — `pnpm add -D prettier prettier-plugin-tailwindcss
  typescript-eslint @eslint-community/eslint-plugin-eslint-comments eslint-plugin-better-tailwindcss`. Pin
  `typescript-eslint` to the version `eslint-config-next` already resolves (8.72.x) so only one plugin instance
  exists.
- [ ] **Step 2: Add config files.** `prettier.config.mjs` with the Global Constraints options and
  `plugins: ["prettier-plugin-tailwindcss"]`; `.prettierignore` listing `*.md`, `*.sql`,
  `src/lib/supabase/database.types.ts`, `.next/`, `pnpm-lock.yaml`, `supabase/.temp/`, `.superpowers/`;
  `.vscode/extensions.json` recommending `esbenp.prettier-vscode`, `dbaeumer.vscode-eslint`,
  `bradlc.vscode-tailwindcss`; `.vscode/settings.json` with `editor.defaultFormatter` = Prettier and
  `editor.formatOnSave: true` for TS/TSX/JS/CSS/JSON. Add the three scripts.
- [ ] **Step 3: Resolve conflicting classes before sorting.** Run ESLint once with only
  `better-tailwindcss/no-conflicting-classes` (inline: `pnpm exec eslint --no-config-lookup` with a throwaway config in
  the scratchpad, or `--rule` on a temp config that sets `settings["better-tailwindcss"].entryPoint =
  "src/app/globals.css"`). For each hit, keep the class that wins today (the later one in its string) and delete the
  other. Commit `fix(ui): drop conflicting Tailwind classes` (or record "none found" in the task report).
- [ ] **Step 4: Check for formatting-rule conflicts** — `pnpm exec eslint --print-config src/app/layout.tsx` and
  look for core/stylistic formatting rules that are on (e.g. `indent`, `quotes`, `react/jsx-indent`). Expected: none,
  so `eslint-config-prettier` is not added. If any are on, report them instead of installing.
- [ ] **Step 5: Commit the setup** (config, scripts, lockfile) — `chore: add prettier with tailwind class sorting`.
- [ ] **Step 6: Reformat** — `pnpm format`, then `pnpm lint && pnpm exec tsc --noEmit && pnpm test && pnpm build`
  (all pass; vm-based `install-script` / `apply-hint` / theme tests included). Spot-check rendered HTML of `/` and
  `/apply` against `main` (`pnpm start -p 3123`, `curl -s` both, diff text content): no text change.
  Commit only the reformatted files (by path from `git diff --name-only`, excluding `.claude/settings.json`):
  `style: format with prettier`.
- [ ] **Step 7: Hide the reformat from blame** — put the Step 6 commit hash in `.git-blame-ignore-revs` with a
  comment line; run `git config blame.ignoreRevsFile .git-blame-ignore-revs` locally. Commit
  `chore: ignore the prettier reformat in git blame`.

### Task 2: Type-aware typescript-eslint rules (without casts / `!`) and their fixes

**Files:**
- Modify: `eslint.config.mjs`; fixes across `src/**` and `scripts/**` as the rules demand

**Interfaces:**
- Consumes: Task 1 deps and scripts.
- Produces: `eslint.config.mjs` structured as: Next presets → typed TS block → JS block without type info →
  ignores. Task 3 and 4 add rules to the typed block / a Tailwind block.

- [ ] **Step 1: Configure.** `tseslint.configs.strictTypeChecked` for `**/*.{ts,tsx,mts}` with
  `parserOptions.projectService: true, tsconfigRootDir: import.meta.dirname`; `tseslint.configs.disableTypeChecked`
  for `**/*.{js,mjs,cjs}`. Rules: `switch-exhaustiveness-check: "error"`;
  `no-floating-promises: ["error", { allowForKnownSafeCalls: [{ from: "package", package: "node:test", name:
  ["test", "describe", "it", "suite"] }] }]`; `no-confusing-void-expression: "off"` (stylistic, 90 hits, no bugs);
  `consistent-type-assertions` and `no-non-null-assertion`: `"off"` for now (Task 3). Keep `linterOptions.
  reportUnusedDisableDirectives: "error"`. Add autofix-only members of `stylisticTypeChecked` only where
  `pnpm lint:fix` resolves every hit (e.g. `prefer-optional-chain`, `prefer-includes`); `consistent-type-definitions`
  stays off.
- [ ] **Step 2: Measure** — `time pnpm lint` and the per-rule counts (`-f json`). Expected: no parser errors for
  `.mjs` or `next-env.d.ts`; test files type-checked; runtime noted in the task report (~50 s expected).
- [ ] **Step 3: Autofix** — `pnpm lint:fix`, review the diff, commit nothing yet.
- [ ] **Step 4: Fix the remaining hits by hand, rule by rule** — `no-deprecated` (React `FormEvent` → the current
  type the deprecation note names), `no-misused-promises` (`in-app-browser-notice.tsx` copy handler),
  `no-unnecessary-condition`, `no-base-to-string`, `require-await`, `unbound-method` (type methods as arrow
  properties in the install store's type), `no-unsafe-*` (`i18n/request.ts` messages import: type it from
  `messages/tr.json`; `install-script.ts`: replace `Record<string, any>` with a minimal typed window shape and drop
  its disable), `no-empty-function` (shared `noSubscribe` from one module; also closes the "defined 3×" follow-up).
- [ ] **Step 5: Template/`String()` fixes keep text** — for each `restrict-template-expressions` /
  `no-base-to-string` hit, render the same text for present values and nothing for missing ones. Add unit tests for
  any helper introduced (e.g. `formDataText(form, name): string` returning `""` for a missing or `File` value;
  `assert.equal(formDataText(fd, "x"), "")` for a file entry, `"abc"` for a string entry).
- [ ] **Step 6: Verify and commit** — full verification line; commit `build(lint): type-aware typescript-eslint
  rules` (config) and the fixes as `fix:`/`refactor:` commits grouped by area; any real bug fixed is named in its
  message.

### Task 3: Ban casts, non-null assertions and unexplained disables

**Files:**
- Modify: `eslint.config.mjs`; fixes in the ~62 cast sites and ~10 `!` sites (`src/lib/applications/schema.ts`,
  `apply-hint.ts`, `phone-field.tsx`, `locale-switcher.tsx`, `blood-type-form.tsx`, `location-form.tsx`,
  `emergency-contact-dialog.tsx`, `apply-form.tsx`, `access/actions.ts`, `globals-contrast.test.ts`, …)

**Interfaces:**
- Consumes: Task 2 config.

- [ ] **Step 1: Configure** — `consistent-type-assertions: ["error", { assertionStyle: "never" }]`,
  `no-non-null-assertion: "error"`; eslint-comments plugin with `require-description: ["error", { ignore: [] }]`,
  `no-unlimited-disable`, `disable-enable-pair`, `no-unused-disable`.
- [ ] **Step 2: Measure** — list every hit (`-f json`) in the task report.
- [ ] **Step 3: Replace casts** — preferred order: (a) the value is already the type (`no-unnecessary-type-assertion`
  showed 12) → delete; (b) narrow with a type guard (`isLocale(v)`, `isBloodType(v)`, `instanceof HTMLElement`);
  (c) Zod `safeParse` where data comes from outside (FormData, `localStorage`, JSON); (d) better types at the source
  (e.g. `schema.ts` `!` → a discriminated union or a refined Zod output). Guards live next to the type they guard and
  get unit tests: `isLocale("tr") === true`, `isLocale("de") === false`; same pattern for each new guard.
- [ ] **Step 4: Invalid-input behaviour** — for each replaced cast on external input, the invalid branch does what
  the old code effectively did (ignore / fall back to the default), never throws in render or an event handler. Test
  each new parse helper with one invalid input.
- [ ] **Step 5: Justified exceptions** — only where no guard is possible (e.g. a library type gap); each gets
  `// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- <reason>`; list them in the report.
  Existing disables get a `-- reason` (`user-menu.tsx` already has one).
- [ ] **Step 6: Verify and commit** — full verification line; `build(lint): ban type casts and non-null assertions`
  plus `refactor:` commits per area.

### Task 4: Tailwind class linting

**Files:**
- Modify: `eslint.config.mjs`; class fixes in `src/**/*.tsx`

- [ ] **Step 1: Configure** — `eslint-plugin-better-tailwindcss` for `**/*.{ts,tsx}` with
  `settings["better-tailwindcss"].entryPoint: "src/app/globals.css"`; rules (error): `no-unknown-classes`,
  `no-conflicting-classes`, `no-concatenated-classes`, `no-duplicate-classes`, `no-deprecated-classes`,
  `enforce-canonical-classes`, `no-unnecessary-whitespace`; explicitly off: `enforce-consistent-class-order`,
  `enforce-consistent-line-wrapping`. Check the plugin's settings doc on GitHub
  (schoero/eslint-plugin-better-tailwindcss, `docs/settings/settings.md`) for the exact key names first.
- [ ] **Step 2: Measure** — `@utility heading` / `eyebrow` and theme tokens must not show up as unknown. Classes
  that aren't Tailwind on purpose (e.g. markers read by scripts or E2E, `group`) go into the rule's ignore list with a
  comment, not into disables.
- [ ] **Step 3: Fix** — `pnpm lint:fix` for canonical/duplicate/whitespace; unknown classes by hand (a typo → the
  intended class; a dead class → delete). Confirm no visual change on `/`, `/apply`, `/members`, `/account` at 390px
  and 1280px (screenshots before/after via the E2E puppeteer setup in `scripts/e2e/README.md`) for every class whose
  meaning changed.
- [ ] **Step 4: Verify and commit** — full verification line; `build(lint): lint Tailwind classes` and
  `fix(ui): …` for real class bugs.

### Task 5: Docs and final verification

**Files:**
- Modify: `CLAUDE.md`, `docs/learnings/<topic>.md` (new `tooling.md` or `environment.md`) + `docs/learnings/README.md`,
  `docs/follow-ups.md`, `docs/PLAN.md` (only if it mentions tooling)

- [ ] **Step 1: CLAUDE.md** — Commands: add `pnpm format`, `pnpm lint:fix`; "before every commit" becomes
  `pnpm format && pnpm lint:fix`, review the diff, then lint/tsc/test/build. Stack & conventions: a short "write it so
  lint passes" list (no `as`: guards/Zod/better types; no `!`; template values are strings; `String()` only on
  strings; promises awaited or `void`ed on purpose; every disable has `-- reason`; Tailwind: no conflicting or unknown
  classes); and "no format-on-edit hooks: they force re-reads" (iltan's anti-goal).
- [ ] **Step 2: Learnings** — one entry per non-obvious finding from Tasks 1–4 (symptom → cause → do), e.g. the
  `cn` merge vs class sorting, `allowForKnownSafeCalls` for node:test, plugin-instance clash if any.
- [ ] **Step 3: Follow-ups** — remove "Stricter ESLint rules" (Next up), the `MEMBER_STATUSES` cast item, the
  `noSubscribe` 3× part of the hide-Başvur minors, `install-script.ts` `any`; add anything deferred in Tasks 1–4
  (e.g. turning on more stylistic rules, ESLint cache).
- [ ] **Step 4: Final verification** — full verification line, `pnpm db:test` unaffected (no DB change: skip if no
  SQL touched), browser E2E suites that cover changed components (`nav`, `apply`, `members`, `safety`, `header`,
  `deletion` per `scripts/e2e/README.md`), `node scripts/e2e/seo-check.mjs`.
- [ ] **Step 5: Commit** — `docs: lint and format workflow`.
