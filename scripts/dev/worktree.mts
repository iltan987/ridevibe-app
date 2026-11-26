// Git worktrees for parallel Claude Code sessions (CLAUDE.md "Parallel sessions", docs/learnings/tooling.md).
//
//   claude -w                                      new session in its own worktree on wip/<generated name> (`hook`)
//   claude -w feat/member-conduct                  the same on a named branch (`fix-home-image`, `home-image` work too;
//                                                  Claude Code refuses spaces)
//   node scripts/dev/worktree.mts create <name>    the same without Claude Code; prints the path
//   node scripts/dev/worktree.mts remove <branch>  remove a worktree (refuses uncommitted work; keeps unmerged branches)
//   node scripts/dev/worktree.mts db-check         which branches in worktrees change the database
//   node scripts/dev/worktree.mts hook             Claude Code WorktreeCreate / WorktreeRemove hook (stdin JSON)
//
// Worktrees live next to the main checkout (`~/projects/ridingclub-wt/<branch with - for />`), not in Claude Code's
// default `.claude/worktrees/`: tsc, ESLint and `node --test` would sweep a nested checkout. A name that isn't one of
// our branches gets a `wip/` branch, which the session renames (`git branch -m`) once the task is clear; the folder
// keeps its first name. A new branch starts from local `main`; the git-ignored `.env`, `.env.local` and `.vercel` are
// symlinked from the main checkout, then `pnpm install` runs and the project's Claude Code plugins are registered for
// the new folder (~40 s). The hook prints only the path on stdout (Claude Code reads its last line); the rest goes to
// stderr.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { text } from "node:stream/consumers";
import { basename, dirname, join, relative, resolve } from "node:path";
import { z } from "zod";
import { parseWorktreeList, worktreeBranch, worktreeFolder, type WorktreeEntry } from "./worktree-names.mts";

class Failure extends Error {}

/** Files the app and the CLIs need that git doesn't carry. */
const LINKED = [".env", ".env.local", ".vercel"];
const DB_PATHS = ["supabase/schemas", "supabase/migrations"];

function git(args: string[], cwd: string): { ok: boolean; stdout: string; stderr: string } {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  return { ok: result.status === 0, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

function mustGit(args: string[], cwd: string): string {
  const result = git(args, cwd);
  if (!result.ok) throw new Failure(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout;
}

/** The main checkout, wherever this script runs from (worktrees share its `.git`). */
const MAIN = dirname(mustGit(["rev-parse", "--path-format=absolute", "--git-common-dir"], import.meta.dirname));
const ROOT = join(dirname(MAIN), `${basename(MAIN)}-wt`);

function worktrees(): WorktreeEntry[] {
  return parseWorktreeList(mustGit(["worktree", "list", "--porcelain"], MAIN));
}

function create(name: string): string {
  const branch = worktreeBranch(name);
  if (branch === null) throw new Failure(`"${name}" leaves no usable branch name: use letters or digits.`);
  const path = join(ROOT, worktreeFolder(branch));
  // Reopen: the same folder, or the branch already checked out (a wip/ worktree its session has renamed).
  const existing = worktrees().find((entry) => entry.path === path || entry.branch === branch);
  if (existing !== undefined) return existing.path;
  if (existsSync(path)) throw new Failure(`${path} exists but isn't a worktree: move it away first.`);

  const known = git(["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], MAIN).ok;
  mustGit(known ? ["worktree", "add", path, branch] : ["worktree", "add", "-b", branch, path, "main"], MAIN);
  for (const file of LINKED) {
    if (existsSync(join(MAIN, file))) symlinkSync(join(MAIN, file), join(path, file));
  }
  process.stderr.write(`Worktree ${path} on ${branch}${known ? "" : " (new, from main)"}; installing packages…\n`);
  // stdout must carry only the path: send pnpm's output to stderr.
  const install = spawnSync("pnpm", ["install", "--frozen-lockfile"], { cwd: path, stdio: ["ignore", 2, 2] });
  if (install.status !== 0)
    throw new Failure(`pnpm install failed in ${path}; the worktree is there, rerun it by hand.`);
  installPlugins(path);
  return path;
}

const projectSettings = z.object({ enabledPlugins: z.record(z.string(), z.boolean()).optional() });

/**
 * Project-scope plugins are registered per folder path, so a new worktree starts without them. `claude plugin
 * install` also rewrites `.claude/settings.json` (key order, wrapping): put the committed text back afterwards.
 */
function installPlugins(path: string): void {
  const file = join(path, ".claude", "settings.json");
  const original = readFileSync(file, "utf8");
  const plugins = Object.entries(projectSettings.parse(JSON.parse(original)).enabledPlugins ?? {})
    .filter(([, enabled]) => enabled)
    .map(([id]) => id);
  process.stderr.write(`Registering ${String(plugins.length)} Claude Code plugins for this folder…\n`);
  const failed = plugins.filter((id) => {
    const result = spawnSync("claude", ["plugin", "install", id, "--scope", "project"], {
      cwd: path,
      stdio: ["ignore", 2, 2],
    });
    return result.status !== 0;
  });
  writeFileSync(file, original);
  if (failed.length > 0) {
    process.stderr.write(
      `Plugins not registered (run claude plugin install <id> --scope project): ${failed.join(", ")}\n`,
    );
  }
}

function remove(target: string): void {
  // A branch name (also after a wip/ rename) or the worktree's folder.
  const all = worktrees();
  const entry =
    all.find((candidate) => candidate.branch !== null && candidate.branch === (worktreeBranch(target) ?? target)) ??
    all.find((candidate) => candidate.path === resolve(target));
  if (entry === undefined) throw new Failure(`No worktree for ${target}.`);
  const path = entry.path;
  const inside = relative(ROOT, path);
  if (inside === "" || inside.startsWith("..")) throw new Failure(`${path} isn't under ${ROOT}: not one of ours.`);

  // No --force: git refuses while the worktree holds uncommitted or untracked work (ignored files don't count).
  mustGit(["worktree", "remove", path], MAIN);
  process.stderr.write(`Removed worktree ${path}.\n`);
  if (entry.branch === null) return;
  // -d, never -D: an unmerged branch stays.
  const deleted = git(["branch", "-d", entry.branch], MAIN);
  process.stderr.write(
    deleted.ok
      ? `Deleted branch ${entry.branch} (merged).\n`
      : `Kept branch ${entry.branch}: not merged into the main checkout's HEAD yet.\n`,
  );
}

function dbCheck(): void {
  const here = git(["rev-parse", "--show-toplevel"], process.cwd()).stdout;
  const changing: string[] = [];
  for (const entry of worktrees()) {
    if (entry.branch === null || entry.branch === "main") continue;
    const committed = git(["diff", "--name-only", `main...${entry.branch}`, "--", ...DB_PATHS], MAIN).stdout;
    const uncommitted = git(["status", "--porcelain", "--", ...DB_PATHS], entry.path).stdout;
    if (committed === "" && uncommitted === "") continue;
    changing.push(`  ${entry.branch}  ${entry.path}${entry.path === here ? "  (this checkout)" : ""}`);
  }
  process.stdout.write(
    changing.length === 0
      ? "No checked-out branch changes the database.\n"
      : `Branches that change the database (only one may own the local DB):\n${changing.join("\n")}\n`,
  );
}

const hookInput = z.discriminatedUnion("hook_event_name", [
  z.object({ hook_event_name: z.literal("WorktreeCreate"), name: z.string() }),
  z.object({ hook_event_name: z.literal("WorktreeRemove"), worktree_path: z.string() }),
]);

async function hook(): Promise<void> {
  const input = hookInput.parse(JSON.parse(await text(process.stdin)));
  if (input.hook_event_name === "WorktreeCreate") {
    process.stdout.write(`${create(input.name)}\n`);
  } else {
    remove(input.worktree_path);
  }
}

const command = process.argv.at(2);
const argument = process.argv.at(3);
try {
  if (command === "hook") await hook();
  else if (command === "create" && argument !== undefined) process.stdout.write(`${create(argument)}\n`);
  else if (command === "remove" && argument !== undefined) remove(argument);
  else if (command === "db-check") dbCheck();
  else throw new Failure("Usage: worktree.mts create <name> | remove <branch> | db-check | hook");
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "Unexpected error."}\n`);
  process.exitCode = 1;
}
