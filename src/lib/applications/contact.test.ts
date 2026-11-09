// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { isGoogleMailAddress, isTurkishMobileOrForeign } from "./contact.ts";

test("accepts Turkish mobile numbers and foreign numbers", () => {
  assert.equal(isTurkishMobileOrForeign("+905001234567"), true);
  assert.equal(isTurkishMobileOrForeign("+4915112345678"), true);
});

test("rejects Turkish numbers that are not mobile or have the wrong length", () => {
  assert.equal(isTurkishMobileOrForeign("+904001234567"), false);
  assert.equal(isTurkishMobileOrForeign("+90500123456"), false);
});

test("recognises Google mail domains, trimmed and case-insensitive", () => {
  assert.equal(isGoogleMailAddress("Ali@GMAIL.com "), true);
  assert.equal(isGoogleMailAddress("a@googlemail.com"), true);
  assert.equal(isGoogleMailAddress("a@icloud.com"), false);
  assert.equal(isGoogleMailAddress("a@gmail.com.tr"), false);
});
