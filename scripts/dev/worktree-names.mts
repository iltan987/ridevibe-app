// Pure helpers for `worktree.mts`: which branch a worktree name means, and what `git worktree list` says.

/** Our branch prefixes (CLAUDE.md "Git"), plus `wip` for a worktree whose session hasn't named its branch yet. */
const PREFIXES = ["feat", "fix", "chore", "docs", "refactor", "test", "wip"];
const BRANCH = new RegExp(`^(${PREFIXES.join("|")})/([a-z0-9][a-z0-9-]*)$`);
const LEADING_PREFIX = new RegExp(`^(${PREFIXES.join("|")})-([a-z0-9][a-z0-9-]*)$`);
const SLUG_MAX = 40;

const TURKISH: Record<string, string> = { ı: "i", ğ: "g", ş: "s", ç: "c", ö: "o", ü: "u" };

/** Lowercase ASCII words joined by dashes (Turkish letters folded), at most SLUG_MAX characters. */
function slugify(text: string): string {
  return text
    .toLocaleLowerCase("tr-TR")
    .replace(/[ığşçöü]/g, (letter) => TURKISH[letter] ?? letter)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/, "");
}

/**
 * The branch a worktree name stands for: a branch name with one of our prefixes as is; otherwise the name as a slug,
 * where a leading prefix word becomes the prefix (`Fix home image` → `fix/home-image`) and anything else goes on a
 * `wip/` branch the session renames once the task is clear (`bright-running-fox` → `wip/bright-running-fox`). Null
 * when nothing usable is left.
 */
export function worktreeBranch(name: string): string | null {
  if (BRANCH.test(name)) return name;
  const slug = slugify(name);
  if (slug === "") return null;
  const prefixed = LEADING_PREFIX.exec(slug);
  return prefixed === null ? `wip/${slug}` : `${prefixed[1]}/${prefixed[2]}`;
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
