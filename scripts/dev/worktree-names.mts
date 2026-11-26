// Pure helpers for `worktree.mts`: which branch a worktree name means, and what `git worktree list` says.

/** Our branch prefixes (CLAUDE.md "Git"). */
const PREFIXES = ["feat", "fix", "chore", "docs", "refactor", "test"];
const BRANCH = new RegExp(`^(${PREFIXES.join("|")})[/-]([a-z0-9][a-z0-9-]*)$`);

/**
 * The branch a worktree name stands for: `feat/member-conduct` as is, `feat-member-conduct` with the dash after the
 * prefix read as the slash. Anything else (no prefix, capitals, a generated name) is null.
 */
export function worktreeBranch(name: string): string | null {
  const match = BRANCH.exec(name);
  if (match === null) return null;
  const [, prefix, slug] = match;
  return `${prefix}/${slug}`;
}

/** The worktree's folder name: the branch with its slash as a dash. */
export function worktreeFolder(branch: string): string {
  return branch.replace("/", "-");
}

export type WorktreeEntry = { path: string; branch: string | null };

/** Parses `git worktree list --porcelain`; a detached worktree has branch null. */
export function parseWorktreeList(porcelain: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = [];
  for (const block of porcelain.split("\n\n")) {
    const lines = block.split("\n");
    const path = lines.find((line) => line.startsWith("worktree "))?.slice("worktree ".length);
    if (path === undefined) continue;
    const ref = lines.find((line) => line.startsWith("branch "))?.slice("branch ".length);
    entries.push({ path, branch: ref?.replace(/^refs\/heads\//, "") ?? null });
  }
  return entries;
}
