import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isUuid,
  maxCc,
  parseAuthorsRow,
  parseChangeRows,
  parseCountsRows,
  parseDeclinerRows,
  parseRosterRows,
} from "./signup-rows.ts";

test("roster rows keep nulls for hidden organiser fields and removed names", () => {
  const rows = parseRosterRows([
    {
      profile_id: "p1",
      full_name: null,
      avatar_url: null,
      role: "rider",
      guests: 2,
      probation: null,
      has_emergency_contact: null,
    },
  ]);
  assert.deepEqual(rows, [
    {
      profileId: "p1",
      fullName: null,
      avatarUrl: null,
      role: "rider",
      guests: 2,
      probation: null,
      hasEmergencyContact: null,
    },
  ]);
});

test("roster rows reject an unknown role", () => {
  assert.throws(() =>
    parseRosterRows([
      {
        profile_id: "p",
        full_name: "A",
        avatar_url: null,
        role: "driver",
        guests: 0,
        probation: null,
        has_emergency_contact: null,
      },
    ]),
  );
});

test("counts rows map to camelCase", () => {
  assert.deepEqual(parseCountsRows([{ event_id: "e", people: 5, bikes: 3, members: 4, guests: 1, probation: 2 }]), [
    { eventId: "e", people: 5, bikes: 3, members: 4, guests: 1, probation: 2 },
  ]);
});

test("change rows parse fields, keep equal place lists and a null author", () => {
  const rows = parseChangeRows([
    {
      id: "c1",
      changed_at: "2026-11-21T10:00:00+00:00",
      changes: [
        { field: "starts_at", old: "2026-11-22T08:00:00+00:00", new: "2026-11-22T09:00:00+00:00" },
        { field: "places", old: ["A", "B"], new: ["A", "B"] },
        { field: "limit_people", old: null, new: 20 },
      ],
      changed_by_name: null,
    },
  ]);
  assert.equal(rows[0]?.changes.length, 3);
  assert.deepEqual(rows[0]?.changes[1], { field: "places", old: ["A", "B"], new: ["A", "B"] });
  assert.equal(rows[0]?.changedByName, null);
});

test("change rows reject an unknown field", () => {
  assert.throws(() =>
    parseChangeRows([
      { id: "c", changed_at: "x", changes: [{ field: "title", old: "a", new: "b" }], changed_by_name: null },
    ]),
  );
});

test("authors: no row is null, nulls survive", () => {
  assert.equal(parseAuthorsRow([]), null);
  assert.deepEqual(parseAuthorsRow([{ created_by_name: null, updated_by_name: "B", edited_by_other: true }]), {
    createdByName: null,
    updatedByName: "B",
    editedByOther: true,
  });
});

test("maxCc is the largest known cc, null without one", () => {
  assert.equal(maxCc([]), null);
  assert.equal(maxCc([null]), null);
  assert.equal(maxCc([null, 250, 650, 125]), 650);
});

test("isUuid accepts event ids and refuses what the uuid cast would reject", () => {
  assert.equal(isUuid("5b0c1d2e-3f40-4a5b-8c6d-7e8f9a0b1c2d"), true);
  for (const id of ["abc", "", "5b0c1d2e-3f40-4a5b-8c6d-7e8f9a0b1c2", "5b0c1d2e-3f40-4a5b-8c6d-7e8f9a0b1c2d'"]) {
    assert.equal(isUuid(id), false, id);
  }
});

test("decliner rows keep null names and avatars", () => {
  assert.deepEqual(parseDeclinerRows([{ profile_id: "p1", full_name: null, avatar_url: null, probation: true }]), [
    { profileId: "p1", fullName: null, avatarUrl: null, probation: true },
  ]);
});

test("decliner rows reject a row without probation", () => {
  assert.throws(() => parseDeclinerRows([{ profile_id: "p1", full_name: "A", avatar_url: null }]));
});
