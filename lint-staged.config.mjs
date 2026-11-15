// Runs on `git commit` (husky pre-commit hook, `--no-stash`: no backup stash, no hard reset; only the unstaged parts of
// partially staged files are hidden and put back). Fixes what the tools can fix and adds it to the commit; anything
// left fails the commit. Typecheck, unit tests, build and a full `pnpm lint` stay in the manual check (CLAUDE.md).
const lintThenFormat = ["eslint --fix --no-warn-ignored", "prettier --write --ignore-unknown"];

export default {
  "*.{ts,tsx,mts,js,mjs,cjs}": lintThenFormat,
  "*.{css,json}": "prettier --write --ignore-unknown",
};
