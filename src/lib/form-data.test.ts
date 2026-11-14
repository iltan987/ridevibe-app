// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { formDataText } from "./form-data.ts";

test("formDataText: a string entry as is (untrimmed)", () => {
  const fd = new FormData();
  fd.set("x", " abc ");
  assert.equal(formDataText(fd, "x"), " abc ");
});

test("formDataText: missing entry → empty string", () => {
  assert.equal(formDataText(new FormData(), "x"), "");
});

test("formDataText: file entry → empty string (never '[object File]')", () => {
  const fd = new FormData();
  fd.set("x", new Blob(["data"]), "a.txt");
  assert.equal(formDataText(fd, "x"), "");
});

test("formDataText: first of several entries, like FormData.get", () => {
  const fd = new FormData();
  fd.append("x", "first");
  fd.append("x", "second");
  assert.equal(formDataText(fd, "x"), "first");
});
