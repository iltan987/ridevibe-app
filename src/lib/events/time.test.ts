// Run with: pnpm test
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { isoToIstanbul, istanbulToIso } from "./time.ts";

test("istanbulToIso converts a wall time by the fixed +03:00 offset", () => {
  assert.equal(istanbulToIso("2026-11-22T08:30"), "2026-11-22T05:30:00.000Z");
  assert.equal(istanbulToIso("2026-07-01T01:15"), "2026-06-30T22:15:00.000Z");
});

test("istanbulToIso rejects malformed or impossible times", () => {
  assert.equal(istanbulToIso("2026-02-30T08:30"), null);
  assert.equal(istanbulToIso("2026-11-22T24:00"), null);
  assert.equal(istanbulToIso("2026-11-22 08:30"), null);
  assert.equal(istanbulToIso("2026-11-22T08:30:00"), null);
  assert.equal(istanbulToIso(""), null);
});

test("isoToIstanbul is the inverse", () => {
  assert.equal(isoToIstanbul("2026-11-22T05:30:00.000Z"), "2026-11-22T08:30");
  assert.equal(isoToIstanbul("2026-06-30T22:15:00Z"), "2026-07-01T01:15");
  assert.equal(isoToIstanbul(istanbulToIso("2026-12-31T23:59") ?? ""), "2026-12-31T23:59");
});

test("the result does not depend on the machine time zone", () => {
  const script = `import { istanbulToIso, isoToIstanbul } from ${JSON.stringify(import.meta.resolve("./time.ts"))};
    console.log(istanbulToIso("2026-11-22T08:30"), isoToIstanbul("2026-11-22T05:30:00.000Z"));`;
  for (const tz of ["America/New_York", "Pacific/Auckland", "UTC"]) {
    const out = execFileSync(process.execPath, ["--input-type=module", "-e", script], {
      env: { ...process.env, TZ: tz },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    assert.equal(out.trim(), "2026-11-22T05:30:00.000Z 2026-11-22T08:30", tz);
  }
});
