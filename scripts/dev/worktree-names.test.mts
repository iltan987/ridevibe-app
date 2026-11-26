import assert from "node:assert/strict";
import { test } from "node:test";
import { parseWorktreeList, worktreeBranch, worktreeFolder } from "./worktree-names.mts";

await test("worktreeBranch keeps a branch name with one of our prefixes", () => {
  assert.equal(worktreeBranch("feat/member-conduct"), "feat/member-conduct");
  assert.equal(worktreeBranch("fix/home-image"), "fix/home-image");
  for (const prefix of ["chore", "docs", "refactor", "test", "wip"]) {
    assert.equal(worktreeBranch(`${prefix}/x1`), `${prefix}/x1`);
  }
});

await test("worktreeBranch reads a leading prefix word as the branch prefix", () => {
  assert.equal(worktreeBranch("feat-member-conduct"), "feat/member-conduct");
  assert.equal(worktreeBranch("Fix home image"), "fix/home-image");
  assert.equal(worktreeBranch("feat/a/b"), "feat/a-b");
});

await test("worktreeBranch puts any other name on a wip/ branch", () => {
  assert.equal(worktreeBranch("bright-running-fox"), "wip/bright-running-fox");
  assert.equal(worktreeBranch("home image"), "wip/home-image");
  assert.equal(worktreeBranch("feature/x"), "wip/feature-x");
  assert.equal(worktreeBranch("main"), "wip/main");
  assert.equal(worktreeBranch("feat/"), "wip/feat");
  assert.equal(worktreeBranch("  --Etkinlik: Gelmiyorum!  "), "wip/etkinlik-gelmiyorum");
});

await test("worktreeBranch folds Turkish letters to ASCII", () => {
  assert.equal(worktreeBranch("İLAN ışık çğöşü"), "wip/ilan-isik-cgosu");
  assert.equal(worktreeBranch("IMAGE"), "wip/image");
});

await test("worktreeBranch caps the slug at 40 characters without a trailing dash", () => {
  const branch = worktreeBranch(`${"a".repeat(39)} bcd`);
  assert.equal(branch, `wip/${"a".repeat(39)}`);
});

await test("worktreeBranch refuses names with nothing usable", () => {
  for (const name of ["", "  ", "---", "!!"]) {
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
