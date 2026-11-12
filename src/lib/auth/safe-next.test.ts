// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { safeNextPath, signedInDestination } from "./safe-next.ts";

test("keeps same-site paths, including query and hash", () => {
  assert.equal(safeNextPath("/account"), "/account");
  assert.equal(safeNextPath("/en/admin/applications?status=new#top"), "/en/admin/applications?status=new#top");
});

test("rejects other origins and non-strings", () => {
  for (const next of [
    "//evil.example",
    "/\\evil.example",
    "https://evil.example",
    "evil.example",
    "javascript:alert(1)",
    "",
    null,
    undefined,
    ["/account"],
  ]) {
    assert.equal(safeNextPath(next, "/fallback"), "/fallback", JSON.stringify(next));
  }
});

test("rejects tab/newline tricks that parse as protocol-relative URLs", () => {
  for (const next of ["/\t/evil.example", "/\n/evil.example", "/\r/evil.example", "/\t\\evil.example"]) {
    assert.equal(safeNextPath(next, "/fallback"), "/fallback", JSON.stringify(next));
  }
});

test("normalizes harmless oddities instead of passing them through", () => {
  assert.equal(safeNextPath("/acc\tount"), "/account");
  assert.equal(safeNextPath("/a/../account"), "/account");
});

test("signed-in destination: follows next, falls back for unsafe values", () => {
  assert.equal(signedInDestination("/members?q=a", "/account"), "/members?q=a");
  assert.equal(signedInDestination("/en/admin/applications", "/en/account"), "/en/admin/applications");
  assert.equal(signedInDestination("//evil.example", "/account"), "/account");
  assert.equal(signedInDestination(undefined, "/en/account"), "/en/account");
});

test("signed-in destination: never the sign-in page itself (it would redirect forever)", () => {
  for (const next of ["/sign-in", "/sign-in/", "/sign-in?next=%2Fmembers", "/en/sign-in", "/en/sign-in#x", "/./sign-in"]) {
    assert.equal(signedInDestination(next, "/account"), "/account", next);
  }
  assert.equal(signedInDestination("/sign-in-help", "/account"), "/sign-in-help");
});
