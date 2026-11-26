import assert from "node:assert/strict";
import { test } from "node:test";
import { parseWorktreeList, worktreeBranch, worktreeFolder } from "./worktree-names.mts";

await test("worktreeBranch accepts a branch name with one of our prefixes", () => {
  assert.equal(worktreeBranch("feat/member-conduct"), "feat/member-conduct");
  assert.equal(worktreeBranch("fix/home-image"), "fix/home-image");
  for (const prefix of ["chore", "docs", "refactor", "test"]) {
    assert.equal(worktreeBranch(`${prefix}/x1`), `${prefix}/x1`);
  }
});

await test("worktreeBranch reads a dash after the prefix as the slash", () => {
  assert.equal(worktreeBranch("feat-member-conduct"), "feat/member-conduct");
  assert.equal(worktreeBranch("docs-runbook"), "docs/runbook");
});

await test("worktreeBranch refuses names that aren't one of our branches", () => {
  for (const name of [
    "bright-running-fox",
    "feat",
    "feat/",
    "feat-",
    "feature/x",
    "feat/Member",
    "feat/a/b",
    "feat/-x",
    "feat/x y",
    "main",
    "",
  ]) {
    assert.equal(worktreeBranch(name), null, name);
  }
});

await test("worktreeFolder turns the branch into one folder name", () => {
  assert.equal(worktreeFolder("feat/member-conduct"), "feat-member-conduct");
});

await test("parseWorktreeList reads paths and branches, detached heads have none", () => {
  const porcelain = [
    "worktree /home/u/projects/ridingclub",
    "HEAD 1111111111111111111111111111111111111111",
    "branch refs/heads/main",
    "",
    "worktree /home/u/projects/ridingclub-wt/feat-member-conduct",
    "HEAD 2222222222222222222222222222222222222222",
    "branch refs/heads/feat/member-conduct",
    "",
    "worktree /home/u/projects/ridingclub-wt/detached",
    "HEAD 3333333333333333333333333333333333333333",
    "detached",
    "",
  ].join("\n");
  assert.deepEqual(parseWorktreeList(porcelain), [
    { path: "/home/u/projects/ridingclub", branch: "main" },
    { path: "/home/u/projects/ridingclub-wt/feat-member-conduct", branch: "feat/member-conduct" },
    { path: "/home/u/projects/ridingclub-wt/detached", branch: null },
  ]);
});
