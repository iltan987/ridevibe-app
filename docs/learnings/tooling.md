# Tooling learnings (ESLint, typescript-eslint, Prettier, Tailwind class lint, git hooks and recipes)

## Contents

- [Lint, format and types](#lint-format-and-types)
- [Git hooks and git recipes](#git-hooks-and-git-recipes)
- [Worktrees and parallel sessions](#worktrees-and-parallel-sessions)

## Lint, format and types

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
- **Symptom (risk):** flat config fails with "Cannot redefine plugin".
- **Cause:** two versions load two plugin objects under the same `@typescript-eslint` key.
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

### Overriding a preset rule's options falls back to the rule's own defaults, not the preset's (2026-11-15)
- **Symptom:** `restrict-template-expressions: ["error", { allowNumber: true }]` silently allowed booleans, null,
  undefined, RegExp and `any` in templates.
- **Cause:** options in a flat-config rule entry replace the preset's options entirely; unlisted options take the
  rule's `defaultOptions`, which are looser than `strictTypeChecked`'s.
- **Related:** the preset itself is not as strict as it sounds: `strictTypeChecked` sets `ban-ts-comment` to
  `{ minimumDescriptionLength: 10 }`, so `@ts-expect-error` with a description is allowed; we ban it explicitly.
- **Do:** when you set options for a rule a preset already configures, spell out every option, and don't assume a
  preset bans what our rules ban. Prove it with a stdin or scratch-file probe that must report the case the rule is
  meant to catch.
- **Source:** whole-branch review of the lint-format branch; probes on this repo.

### Node scripts run directly: use `.mts`, not `.ts` (2026-11-17)
- **Symptom:** `node scripts/x.ts` prints `[MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of … is not
  specified` on stderr (for every `.ts` module it loads); in a Claude Code hook that stderr is what Claude is shown.
- **Cause:** `package.json` has no `"type"`, so Node guesses per file and reparses ESM syntax.
- **Do:** standalone scripts and their helpers use `.mts` (always ESM; tsconfig, ESLint, lint-staged and
  `node --test` already include it), e.g. `scripts/db/`. Unit tests under `src/` still warn; harmless there.
- **Source:** found by testing (Node 24.20).

## Git hooks and git recipes

### lint-staged's default backup is a `git stash` + `reset --hard` on failure: run it with `--no-stash` (2026-11-15)
- **Symptom:** risk only (iltan's local `.claude/settings.json` stays unstaged on purpose; a tree-wide restore wiped it
  once). lint-staged 17 by default stores a backup stash and, if a task errors, runs `git reset --hard HEAD` and
  `git stash apply` of that backup.
- **Cause:** `restoreOriginalState` in `node_modules/lint-staged/lib/gitWorkflow.js`.
- **Do:** keep `--no-stash` in `.husky/pre-commit`: no backup, no hard reset; on failure the fixes stay in the index.
  Partially staged files are still handled: their unstaged hunks go to a patch file, those files only get
  `git restore --worktree`, and the patch is applied back. Verified in a throwaway clone: an unstaged untouched file
  kept its hash, the unstaged hunk of a partially staged file stayed out of the commit, no stash entry appeared.
- **Source:** lint-staged README + source; clone test.

### A throwaway clone with a symlinked `node_modules`: `pnpm exec` installs through the link (2026-11-15)
- **Symptom:** `pnpm exec husky` in a scratch clone (with `node_modules` symlinked to the real repo's) downloaded
  packages and ran the clone's `prepare` script.
- **Cause:** pnpm checks dependencies before `exec`/`run` and installs when the clone's lockfile differs; the install
  writes into the linked (real) `node_modules`.
- **Do:** copy the lockfile into the clone too, and afterwards run `pnpm install --frozen-lockfile` in the real repo
  to confirm it is intact.
- **Source:** hook test for the pre-commit setup.

### Merging a branch that changed `.claude/settings.json` while iltan's local edit sits there (2026-11-18)
- **Symptom:** `git switch main` aborts: "Your local changes to the following files would be overwritten by checkout:
  .claude/settings.json" (the branch committed hook lines; iltan's own uncommitted edit stays in that file).
- **Cause:** the file differs between the branches and has local changes; stashing or discarding them is off-limits.
- **Do:** while still on the branch, if `main` is an ancestor of it (`git merge-base --is-ancestor main <branch>`),
  build the `--no-ff` merge commit without a checkout:
  `git update-ref refs/heads/main $(git commit-tree "<branch>^{tree}" -p main -p <branch> -m "Merge branch '<branch>'") $(git rev-parse main)`,
  then `git switch main` (the file is now identical on both sides, the local edit carries over). If `main` moved,
  ask iltan to commit or set aside their edit instead.
- **Staging only your lines of that file** (2026-11-15, pre-push backup Task 1): build the index blob from `HEAD`, not
  from the working tree: `git show HEAD:.claude/settings.json` into a scratchpad file, add your change there (same
  formatting), `git hash-object -w <file>`, then `git update-index --cacheinfo 100644,<hash>,.claude/settings.json`.
  Check: `git diff --cached .claude/settings.json` shows only your change, `git diff .claude/settings.json` still
  only iltan's.
- **Source:** found while merging `chore/pre-push-backup`.

### Scrubbing text from history: filter-repo in a fresh clone, then `reset --keep` (2026-11-19)
- **Symptom:** a value must leave every commit (blobs **and** commit messages), but `git filter-repo` refuses to run
  in a non-fresh clone and its `--force` would rewrite the working repo in place (iltan's local edits).
- **Cause:** filter-repo is meant for fresh clones; `--replace-text` touches blobs only, messages need
  `--replace-message`.
- **Do:** `git clone --no-local <repo> <scratchpad>/rewrite`; write `old==>new` lines (literal, longest first: a short
  pattern that is a prefix of a longer one must come after it); run `git filter-repo --replace-text f
  --replace-message f` there. Verify: grep every old value in `git log --all -p -a` and `--format=%B` (expect 0),
  compare the binary blobs' ids with `ls-tree`, `git diff --stat` old vs new HEAD. Then in the real repo: fetch the
  new `main` into a temp ref, keep the old tip as another ref, `git reset --keep <new>` (refuses instead of
  overwriting local changes), run the tests, force-push with iltan's OK, delete the temp refs. GitHub still serves old
  commits by SHA until its GC; clones/forks keep them. Save filter-repo's "NOTE: First Changed Commit(s)" lines before
  deleting the clone: a GitHub Support purge needs them (`docs/runbooks/website-photo-removal.md`, step 3). Lost them?
  The old tip stays in the reflog: the earliest commit introducing a value (`git log <old> --reverse -S'<value>'`) is
  it. Never write an old SHA into the repo: it points straight at the scrubbed data.
- **Source:** public-repo audit, 2026-11-19.

## Worktrees and parallel sessions

### Claude Code's worktrees land inside the repo on `worktree-<name>`: a `WorktreeCreate` hook replaces both (2026-11-26)
- **Symptom:** `claude -w name` creates `.claude/worktrees/<name>` on branch `worktree-<name>` from
  `origin/<default branch>`. Inside the repo, tsc (`**/*.ts`), ESLint (no gitignore) and `node --test` would also
  sweep the nested checkout, and the branch breaks our `feat/…` names. No setting moves it or renames the branch
  (`worktree.baseRef` is only `fresh` / `head`).
- **Do:** our `WorktreeCreate` / `WorktreeRemove` hooks (`scripts/dev/worktree.mts`, registered in
  `.claude/settings.json`). Contract: stdin JSON with `name` (verbatim, slash included: `claude -w feat/x` passes
  `feat/x`) or `worktree_path`; the last stdout line is the path (everything else to stderr); a non-zero exit fails
  the step. With a hook, `.worktreeinclude` is ignored (the hook links files itself) and Claude Code never deletes the
  branch (the hook runs `git branch -d`, never `-D`). A nameless `claude -w` (and an Agent with
  `isolation: "worktree"`) passes a generated name (`stateless-discovering-tulip`): the hook puts it on
  `wip/<name>`, which the session renames later (the hook finds a worktree by folder or by branch, so a rename
  doesn't lose it). Claude Code validates the name before the hook runs: each `/` segment only letters, digits, dots,
  underscores and dashes, so no spaces.
- **Source:** code.claude.com/docs/en/worktrees and /hooks (checked 2026-11-26); throwaway-clone test with Claude Code
  2.1.332.

### A new worktree has no project plugins, and `claude plugin install` rewrites `.claude/settings.json` (2026-11-26)
- **Symptom:** a session in a fresh worktree: `Plugin "superpowers" is enabled in project settings but isn't installed`
  (all project plugins fail to load).
- **Cause:** `~/.claude/plugins/installed_plugins.json` records project-scope installs per `projectPath`; a worktree is
  a new path. `claude plugin install <id> --scope project` also re-serialises `.claude/settings.json` (moves keys,
  unwraps the one-line hooks), even when `enabledPlugins` already lists the plugin.
- **Do:** the hook installs every enabled plugin from inside the new worktree and writes the original file text back
  (~40 s for six). Nothing is uninstalled on removal (`~/.claude/plugins/data/<id>` is per plugin, not per project);
  entries for removed paths are harmless.
- **Source:** throwaway-clone test.

### What a worktree shares with the main checkout (2026-11-26)
- **Shared:** `.git` (branches, `core.hooksPath=.husky/_`, relative, so each worktree's `pnpm install` makes its own
  `.husky/_`: the pre-commit hook runs there); the one local Supabase stack (Docker project `ridevibe`, fixed ports:
  `db:reset` from any checkout rebuilds it from *that* checkout's migrations and wipes the E2E fixture users for
  everyone); auto memory (`autoMemoryDirectory` is absolute: the main checkout's `.claude/memory/`, so memory is
  committed on `main`); the pnpm store (`pnpm install` in a worktree takes about a second).
- **Per worktree:** `node_modules`, `.next`, `supabase/.temp` (no `linked-project.json`, so `config diff` / `push`
  only from the main checkout), `.claude/settings.local.json`, and the committed `.claude/settings.json` (iltan's
  uncommitted edit stays in the main checkout). Symlinked by the hook: `.env`, `.env.local`, `.vercel`; they are
  git-ignored, so `git worktree remove` without `--force` still works.
- **Ports:** `next dev` without `-p` moves to the next free port (up to 10 tries,
  `next/dist/server/lib/start-server.js`); `next start` doesn't. Local sign-in redirects allow 3000, 3001 and 3124
  (`supabase/config.toml`).
- `$CLAUDE_PROJECT_DIR` is set for hooks only; it is empty in the Bash tool.
- **Source:** throwaway-clone test, 2026-11-26.

### A `claude -w` session can't run git in the main checkout, not even via `!` (2026-11-26)
- **Symptom:** `git -C ~/projects/ridingclub merge …` (also with the absolute path, and typed by iltan as
  `! <command>`) fails: "This session is isolated in the worktree … Refusing to run it — a worktree-isolated
  session's git operations must target its own worktree."
- **Cause:** Claude Code guards every git command of a worktree session, the `!` prefix included, and refuses any
  that point at another checkout.
- **Do:** merge, push `main`, roll out and commit memory from a session started in the main checkout
  (`cd ~/projects/ridingclub && claude`) or from iltan's own terminal. The worktree session prepares everything
  (branch committed, checks green, `git merge-base --is-ancestor main <branch>` from inside the worktree) and hands
  over the exact commands. Never move `main` from the worktree with `git update-ref`: the main checkout has `main`
  checked out, so its index and files would fall behind its `HEAD`.
- **Source:** found while merging `docs/kvkk-legal-basis`.
