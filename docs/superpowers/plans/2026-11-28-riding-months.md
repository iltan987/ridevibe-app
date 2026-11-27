# Riding Months Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Applicants who have ridden for under a year answer "0" years and then the months (0–11); staff see "5 ay".

**Architecture:** A nullable `applications.riding_months` column (0–11, only with `riding_years = 0`), a conditional
required field in step 1 of `/apply` (same pattern as the bike details), and one label helper for the staff page.

**Tech Stack:** Supabase (declarative schemas, pgTAP), Zod 4, Next.js 16 App Router, next-intl, `node --test`,
puppeteer E2E.

**Spec:** `docs/superpowers/specs/2026-11-28-riding-months-design.md`

## Global Constraints

- Branch `feat/riding-months` in this worktree; never create worktrees; never `git add -A` / `commit -a`; never
  discard changes you didn't make (no `git checkout -- .`, `restore .`, `reset --hard`, `stash`, `clean`).
- No `Co-Authored-By` or other trailers in commits. Conventional Commits.
- Node 26: prefix commands with `export PATH=$HOME/.nvm/versions/node/v26.13.1/bin:$PATH;` (this shell starts on 24).
- Months: whole number `0`–`11`; only when `riding_years = 0`; `null` otherwise and on old rows.
- Copy: TR field label "Kaç aydır?", EN "How many months?". Staff: "{months} ay" / months (EN plural), "1 aydan az" /
  "Less than a month" (0 months), "1 yıldan az" / "Less than a year" (0 years, no months).
- Privacy notice unchanged, `PRIVACY_NOTICE_VERSION` unchanged.
- Lint rules (CLAUDE.md "Write it so lint passes"): no `as` casts, `!`, `any`; every promise awaited or `void`ed.
- Before every code commit: `pnpm lint && pnpm exec tsc --noEmit && pnpm test` (build in Task 5). The pre-commit hook
  runs eslint --fix + Prettier on staged files; check `git show --stat` after committing.

## Review Focus

- Years typed as `00` counts as 0: months shown and required (unit tests in Tasks 2).
- Months typed, then years changed from 0 to 3: months is not submitted and the row stores `null` (E2E in Task 4).
- A crafted request with `riding_years=3&riding_months=5` succeeds and stores `riding_months = null`, never a DB
  error (unit test in Task 2).
- Reload or language switch with years `0` in the draft: the months field is visible with its draft value (E2E in
  Task 4).
- Old applications (years 0, months null) read "1 yıldan az", not "0 yıl" or "0 ay" (unit test in Task 3).

---

### Task 1: Database column, constraint, grant, pgTAP, types

**Files:**
- Modify: `supabase/schemas/20_applications.sql` (table at line ~32, insert grant at line ~686)
- Create: `supabase/migrations/<timestamp>_riding_months.sql` (generated)
- Modify: `supabase/tests/database/applications.test.sql`
- Modify: `src/lib/supabase/database.types.ts` (generated)

**Interfaces:**
- Produces: `applications.riding_months smallint null`; `TablesInsert<"applications">["riding_months"]` is
  `number | null | undefined`.

- [ ] **Step 1: Write the failing pgTAP tests** in `applications.test.sql`: add `riding_months` to both column lists of
  `pg_temp.submit` (after `riding_years`), add these four in the anonymous section and raise `plan(26)` to `plan(30)`.
  Each uses its own `@pgtap.invalid` email (one open application per email):

```sql
select lives_ok(
  $$ select pg_temp.submit('{"email": "months-ok@pgtap.invalid", "riding_years": 0, "riding_months": 5}') $$,
  'anon can submit riding months with 0 years'
);
select throws_ok(
  $$ select pg_temp.submit('{"email": "months-12@pgtap.invalid", "riding_years": 0, "riding_months": 12}') $$,
  '23514', null, 'riding months above 11 are refused'
);
select throws_ok(
  $$ select pg_temp.submit('{"email": "months-neg@pgtap.invalid", "riding_years": 0, "riding_months": -1}') $$,
  '23514', null, 'negative riding months are refused'
);
select throws_ok(
  $$ select pg_temp.submit('{"email": "months-yrs@pgtap.invalid", "riding_years": 3, "riding_months": 5}') $$,
  '23514', null, 'riding months with a year or more are refused'
);
```

- [ ] **Step 2: Run `pnpm db:test`.** Expected: FAIL (`riding_months` is not a column of `applications`).
- [ ] **Step 3: Edit the schema.** After `riding_years`: `riding_months smallint check (riding_months between 0 and
  11),`; a table constraint `applications_riding_months_under_a_year check (riding_months is null or riding_years =
  0)`; a column comment ("Months riding when under a year (riding_years = 0); null otherwise and on rows before
  2026-11-28."); add `riding_months` after `riding_years` in the `grant insert (…) to anon, authenticated` list.
- [ ] **Step 4: Generate and apply.** Run `node scripts/dev/worktree.mts db-check` (another branch listed → stop and
  ask iltan). Then `pnpm db:migration riding_months`, review the file (an `alter table … add column`, the two
  checks, the comment, the grant; delete any `cron.unschedule(...)` line), `pnpm exec supabase migration up`.
- [ ] **Step 5: Run `pnpm db:test`.** Expected: all files PASS.
- [ ] **Step 6: Run `pnpm db:types`**, then `pnpm exec tsc --noEmit`. Expected: no errors (the new insert field is
  optional).
- [ ] **Step 7: Commit** schema, migration, test and types: `feat: riding months column for riders under a year`.

### Task 2: Form field, validation and steps

**Files:**
- Create: `src/lib/applications/riding-experience.ts`, `src/lib/applications/riding-experience.test.ts`
- Modify: `src/lib/applications/schema.ts`, `src/lib/applications/schema.test.ts`, `src/lib/applications/steps.ts`
- Modify: `src/components/apply/apply-form.tsx` (step 1, lines ~389–399, state near line ~118)
- Modify: `messages/tr.json`, `messages/en.json` (`Apply.fields.riding_months`)
- Modify: `docs/application-form.md` (step 1 row, line 19)

**Interfaces:**
- Consumes: Task 1's column.
- Produces: `asksRidingMonths(years: string | undefined): boolean` in `riding-experience.ts` (true when the trimmed
  value is non-empty and numerically 0, e.g. `"0"`, `"00"`); the schema field `riding_months`.

- [ ] **Step 1: Write the failing tests.** In `riding-experience.test.ts`: `asksRidingMonths` is true for `"0"` and
  `"00"`, false for `undefined`, `""`, `"1"`, `"12"`, `"abc"`. In `schema.test.ts`:

```ts
test("0 riding years requires the months", () => {
  assert.equal(validateField("riding_years", "0"), undefined);
  const result = validateApplication(formData({ riding_years: "0" }));
  assert.equal(result.ok ? undefined : result.fieldErrors.riding_months, "required");
  const ok = validateApplication(formData({ riding_years: "00", riding_months: "5" }));
  assert.equal(ok.ok && ok.data.riding_months, 5);
});

test("riding months must be 0-11", () => {
  for (const bad of ["12", "-1", "2.5"]) {
    const result = validateApplication(formData({ riding_years: "0", riding_months: bad }));
    assert.equal(result.ok ? undefined : result.fieldErrors.riding_months, "invalidNumber");
  }
  const zero = validateApplication(formData({ riding_years: "0", riding_months: "0" }));
  assert.equal(zero.ok && zero.data.riding_months, 0);
});

test("riding months are dropped when the years are 1 or more", () => {
  const result = validateApplication(formData({ riding_years: "3", riding_months: "5" }));
  assert.equal(result.ok && result.data.riding_months, null);
});
```

- [ ] **Step 2: Run `pnpm test`.** Expected: FAIL (`riding-experience.ts` missing; `riding_months` unknown).
- [ ] **Step 3: Implement.**
  - `asksRidingMonths` in `riding-experience.ts`.
  - `schema.ts`: field `riding_months` after `riding_years` (`z.coerce.number(err("invalidNumber")).int(…)
    .min(0, …).max(11, …).optional()`); a refine `v.riding_years !== 0 || v.riding_months !== undefined` with
    `rule("riding_months")` and `when: onlyIf("riding_years", "riding_months")`; in the transform
    `riding_months: v.riding_years === 0 ? <months, or a "required" issue on riding_months like answer()> : null`.
  - `steps.ts`: `"riding_months"` right after `"riding_years"` (the steps test requires every field in one step).
  - `apply-form.tsx`: a `ridingYears` state initialised from `draftText(draft, "riding_years")`, set from the years
    input's `onChange` (`event.currentTarget.value`); when `asksRidingMonths(ridingYears)`, render below it a
    `TextField name="riding_months" type="number" label={t("fields.riding_months")} error={error("riding_months")}
    defaultValue={draftText(draft, "riding_months")} inputMode="numeric" min={0} max={11} className="max-w-32"`.
  - Messages: `Apply.fields.riding_months` = "Kaç aydır?" / "How many months?".
  - `docs/application-form.md` step 1: "riding years (and the months when under a year)".
- [ ] **Step 4: Run `pnpm test`, `pnpm lint`, `pnpm exec tsc --noEmit`.** Expected: all pass.
- [ ] **Step 5: Commit**: `feat: ask riding months when the years answer is 0`.

### Task 3: Staff label

**Files:**
- Modify: `src/lib/applications/riding-experience.ts`, `src/lib/applications/riding-experience.test.ts`
- Modify: `src/app/[locale]/admin/applications/[id]/page.tsx:274`
- Modify: `messages/tr.json`, `messages/en.json` (`Admin.*` next to `years`)

**Interfaces:**
- Consumes: `riding_months` on the `applications` row (Task 1 types; the page selects `*`).
- Produces: `ridingExperience(years: number, months: number | null): RidingExperience` with
  `type RidingExperience = { key: "years"; years: number } | { key: "months"; months: number } | { key: "underMonth" }
  | { key: "underYear" }`.

- [ ] **Step 1: Write the failing tests** in `riding-experience.test.ts`:

```ts
test("ridingExperience picks the staff label", () => {
  assert.deepEqual(ridingExperience(3, null), { key: "years", years: 3 });
  assert.deepEqual(ridingExperience(0, 5), { key: "months", months: 5 });
  assert.deepEqual(ridingExperience(0, 0), { key: "underMonth" });
  assert.deepEqual(ridingExperience(0, null), { key: "underYear" });
});
```

- [ ] **Step 2: Run `pnpm test`.** Expected: FAIL (`ridingExperience` not exported).
- [ ] **Step 3: Implement** `ridingExperience` and use it in the page's riding-years `Row` (`t(label.key, label)` or
  a small switch). Messages under `Admin`: TR `"months": "{months} ay"`, `"underMonth": "1 aydan az"`,
  `"underYear": "1 yıldan az"`; EN `"months": "{months, plural, one {# month} other {# months}}"`, `"underMonth":
  "Less than a month"`, `"underYear": "Less than a year"`; fix EN `"years"` to
  `"{years, plural, one {# year} other {# years}}"` (today "1 years").
- [ ] **Step 4: Run `pnpm test`, `pnpm lint`, `pnpm exec tsc --noEmit`.** Expected: all pass (messages parity too).
- [ ] **Step 5: Commit**: `feat: staff see riding months on the application page`.

### Task 4: Apply E2E

**Files:**
- Modify: `scripts/e2e/apply-e2e.mjs`, `scripts/e2e/README.md` (the `apply-e2e.mjs` entry)

- [ ] **Step 1: Add check `riding-months`** (new block after `back-button`, using the file's helpers): years `0` →
  `input[name=riding_months]` visible; "Devam" with months empty → stays on step 1 with an error on
  `[data-field=riding_months]`; months `5`, reload → years `0`, months `5` restored; years `3` → months field gone;
  then submit flow unaffected. PASS line: `riding-months — shown=… required=… restored=… hiddenAt3=…`.
- [ ] **Step 2: Extend `submit-clears-draft`**: submit with years `0` / months `4` and check the row through the
  existing `docker exec … psql` helper (`riding_years = 0 and riding_months = 4`). In `riding-months` (Step 1), after
  typing months `4` and changing years to `3`, also assert `new FormData(form).has("riding_months") === false`
  (Review Focus 2; the server side is the Task 2 unit test).
- [ ] **Step 3: Run** `pnpm build`, `pnpm start -p 3124` (background), then
  `BASE_URL=http://localhost:3124 OUT_DIR=<scratchpad>/e2e PUPPETEER_DIR=~/e2e-tools node scripts/e2e/apply-e2e.mjs`
  (create `OUT_DIR` first). Expected: `ALL PASS` (the signed-in check may `SKIP`). Stop the server
  (`kill $(ss -ltnp | grep ':3124 ' | grep -oP 'pid=\K[0-9]+')`).
- [ ] **Step 4: Update the README entry** (mention the months check), commit: `test: apply E2E covers riding months`.

### Task 5: Verification and docs

- [ ] **Step 1: Run the full set:** `pnpm format:check && pnpm lint && pnpm exec tsc --noEmit && pnpm test &&
  pnpm db:test && pnpm build`. Expected: all pass (one pre-existing lint warning).
- [ ] **Step 2: Drift check:** `pnpm db:migration drift_check` produces only `cron.unschedule` noise (or nothing);
  delete the generated file.
- [ ] **Step 3: Review:** `superpowers:requesting-code-review` on the branch, then `/security-review` (insert-grant
  change). Fix or record every finding; deferred minors go into `docs/follow-ups.md` in the same commit.
- [ ] **Step 4: Iteration index:** add the row for this iteration to `docs/superpowers/README.md` (format of the
  existing rows: date, title, spec, plan, `feat/riding-months` with its last commit and date, later changes "—").
