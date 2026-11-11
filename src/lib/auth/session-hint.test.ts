// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import { hasSessionCookie, sessionHintScript } from "./session-hint.ts";

test("hasSessionCookie: Supabase auth cookie, plain or chunked", () => {
  assert.equal(hasSessionCookie("sb-127-auth-token=base64-abc"), true);
  assert.equal(hasSessionCookie("theme=x; sb-igqqicbfejhnsggfuydh-auth-token.0=base64-abc; NEXT_LOCALE=en"), true);
  assert.equal(hasSessionCookie("a=1;sb-127-auth-token.1=xyz"), true);
});

test("hasSessionCookie: no session", () => {
  for (const c of [
    "",
    "NEXT_LOCALE=tr",
    "sb-127-auth-token-code-verifier=abc", // OAuth flow in progress, not signed in
    "xsb-127-auth-token=abc",
    "sb-127-auth-tokens=abc",
    "foo=sb-127-auth-token=abc",
  ]) {
    assert.equal(hasSessionCookie(c), false, c);
  }
});

function runScript(cookie: string, previous: object | null) {
  const attrs = new Map<string, string>();
  const el = { setAttribute: (k: string, v: string) => attrs.set(k, v) };
  const context = {
    document: { cookie, currentScript: { previousElementSibling: previous === null ? null : el } },
  };
  vm.runInNewContext(sessionHintScript, context);
  return attrs;
}

test("sessionHintScript marks the previous sibling only when signed in (self-contained in node:vm)", () => {
  assert.equal(runScript("sb-127-auth-token=abc", {}).get("data-session"), "");
  assert.equal(runScript("NEXT_LOCALE=tr", {}).has("data-session"), false);
  assert.doesNotThrow(() => runScript("sb-127-auth-token=abc", null));
});
