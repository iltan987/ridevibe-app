// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import { applyHintScript, guessApplyHidden, readApplyHint, writeApplyHint } from "./apply-hint.ts";

const SIGNED_IN = [
  "sb-127-auth-token=base64-abc",
  "theme=x; sb-igqqicbfejhnsggfuydh-auth-token.0=base64-abc; NEXT_LOCALE=en",
];
const SIGNED_OUT = ["", "NEXT_LOCALE=tr", "sb-127-auth-token-code-verifier=abc"];
const STORED = [null, "1", "0", "x"];

test("guessApplyHidden: no session always shows", () => {
  for (const s of STORED) assert.equal(guessApplyHidden(false, s), false, String(s));
});

test("guessApplyHidden: session hides unless stored is exactly '0'", () => {
  assert.equal(guessApplyHidden(true, null), true);
  assert.equal(guessApplyHidden(true, "1"), true);
  assert.equal(guessApplyHidden(true, "0"), false);
  assert.equal(guessApplyHidden(true, "garbage"), true);
});

test("readApplyHint: returns the stored value, null when storage throws", () => {
  assert.equal(
    readApplyHint(() => ({ getItem: () => "1" })),
    "1",
  );
  assert.equal(
    readApplyHint(() => ({ getItem: () => null })),
    null,
  );
  assert.equal(
    readApplyHint(() => {
      throw new Error("denied");
    }),
    null,
  );
  assert.equal(
    readApplyHint(() => ({
      getItem: () => {
        throw new Error("denied");
      },
    })),
    null,
  );
});

test("writeApplyHint: writes '1' / '0' and swallows errors", () => {
  const writes: [string, string][] = [];
  const storage = { setItem: (k: string, v: string) => void writes.push([k, v]) };
  writeApplyHint(() => storage, true);
  writeApplyHint(() => storage, false);
  assert.deepEqual(writes, [
    ["rv-apply-hidden", "1"],
    ["rv-apply-hidden", "0"],
  ]);
  assert.doesNotThrow(() =>
    writeApplyHint(() => {
      throw new Error("denied");
    }, true),
  );
  assert.doesNotThrow(() =>
    writeApplyHint(
      () => ({
        setItem: () => {
          throw new Error("quota");
        },
      }),
      true,
    ),
  );
});

/**
 * Runs the inline script in node:vm (proves it is self-contained); returns the attributes set on the script's parent
 * element. `stored` "throw": reading localStorage throws.
 */
function runScript(cookie: string, stored: string | null, hasParent = true) {
  const attrs = new Map<string, string>();
  const el = { setAttribute: (k: string, v: string) => attrs.set(k, v) };
  const view =
    stored === "throw"
      ? {
          get localStorage(): never {
            throw new Error("denied");
          },
        }
      : { localStorage: { getItem: () => stored } };
  const context = {
    document: { cookie, defaultView: view, currentScript: { parentElement: hasParent ? el : null } },
  };
  vm.runInNewContext(applyHintScript, context);
  return attrs;
}

test("applyHintScript sets data-apply-hidden exactly when guessApplyHidden says so", () => {
  for (const c of [...SIGNED_IN, ...SIGNED_OUT]) {
    const hasSession = SIGNED_IN.includes(c);
    for (const s of STORED) {
      const attrs = runScript(c, s);
      assert.equal(attrs.has("data-apply-hidden"), guessApplyHidden(hasSession, s), `${c} / ${String(s)}`);
      if (attrs.has("data-apply-hidden")) assert.equal(attrs.get("data-apply-hidden"), "");
    }
  }
});

test("applyHintScript: throwing localStorage with a session still hides; missing parent doesn't throw", () => {
  assert.equal(runScript(SIGNED_IN[0], "throw").get("data-apply-hidden"), "");
  assert.equal(runScript(SIGNED_OUT[0], "throw").has("data-apply-hidden"), false);
  assert.doesNotThrow(() => runScript(SIGNED_IN[0], "1", false));
});
