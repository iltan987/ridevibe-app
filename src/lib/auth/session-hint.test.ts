// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import { hasSessionCookie, sessionHintParentScript, sessionHintScript } from "./session-hint.ts";

const SIGNED_IN = [
  "sb-127-auth-token=base64-abc",
  "theme=x; sb-igqqicbfejhnsggfuydh-auth-token.0=base64-abc; NEXT_LOCALE=en",
  "a=1;sb-127-auth-token.1=xyz",
];
const SIGNED_OUT = [
  "",
  "NEXT_LOCALE=tr",
  "sb-127-auth-token-code-verifier=abc", // OAuth flow in progress, not signed in
  "xsb-127-auth-token=abc",
  "sb-127-auth-tokens=abc",
  "foo=sb-127-auth-token=abc",
];

test("hasSessionCookie: Supabase auth cookie, plain or chunked", () => {
  for (const c of SIGNED_IN) assert.equal(hasSessionCookie(c), true, c);
});

test("hasSessionCookie: no session", () => {
  for (const c of SIGNED_OUT) assert.equal(hasSessionCookie(c), false, c);
});

/** Runs the inline script in node:vm (proves it is self-contained); returns the attributes set on the sibling. */
function runScript(cookie: string, hasPrevious = true) {
  const attrs = new Map<string, string>();
  const el = { setAttribute: (k: string, v: string) => attrs.set(k, v) };
  const context = { document: { cookie, currentScript: { previousElementSibling: hasPrevious ? el : null } } };
  vm.runInNewContext(sessionHintScript, context);
  return attrs;
}

test("sessionHintScript marks the previous sibling exactly when hasSessionCookie is true", () => {
  for (const c of SIGNED_IN) assert.equal(runScript(c).get("data-session"), "", c);
  for (const c of SIGNED_OUT) assert.equal(runScript(c).has("data-session"), false, c);
  assert.doesNotThrow(() => runScript(SIGNED_IN[0], false));
});

/** Same for the first-child variant: returns the attributes set on the script's parent element. */
function runParentScript(cookie: string, hasParent = true) {
  const attrs = new Map<string, string>();
  const el = { setAttribute: (k: string, v: string) => attrs.set(k, v) };
  const context = { document: { cookie, currentScript: { parentElement: hasParent ? el : null } } };
  vm.runInNewContext(sessionHintParentScript, context);
  return attrs;
}

test("sessionHintParentScript marks its parent exactly when hasSessionCookie is true", () => {
  for (const c of SIGNED_IN) assert.equal(runParentScript(c).get("data-session"), "", c);
  for (const c of SIGNED_OUT) assert.equal(runParentScript(c).has("data-session"), false, c);
  assert.doesNotThrow(() => runParentScript(SIGNED_IN[0], false));
});
