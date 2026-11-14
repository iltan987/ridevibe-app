// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { foldSearch } from "../search-fold.ts";
import { membersView, type StaffStatus } from "./members-view.ts";

type Row = { name: string; status: StaffStatus; search: string };
const row = (name: string, status: StaffStatus, email: string | null = null): Row => ({
  name,
  status,
  search: foldSearch(`${name} ${email ?? ""}`),
});

const rows: Row[] = [
  row("Çelik Cem", "pending", "cem@example.com"),
  row("İlker Işık", "active", "ilker@example.com"),
  row("Zehra Ak", "inactive"),
  ...Array.from({ length: 27 }, (_, i) => row(`Bekleyen ${i + 1}`, "pending")),
];
const names = (items: Row[]) => items.map((r) => r.name);

test("no query: counts per status, the status tab's first page of 25 in the given order", () => {
  const view = membersView(rows, { query: "", status: "pending", page: 1 });
  assert.deepEqual(view.counts, { pending: 28, active: 1, inactive: 1 });
  assert.equal(view.total, 28);
  assert.equal(view.items.length, 25);
  assert.equal(view.items[0].name, "Çelik Cem");
  assert.deepEqual([view.page, view.pageCount, view.from, view.to], [1, 2, 1, 25]);
});

test("the query matches the name or the email, folds Turkish letters and case; counts honour it", () => {
  const byName = membersView(rows, { query: "ISIK", status: "active", page: 1 });
  assert.deepEqual(names(byName.items), ["İlker Işık"]);
  assert.deepEqual(byName.counts, { pending: 0, active: 1, inactive: 0 });

  const byEmail = membersView(rows, { query: "cem@exam", status: "pending", page: 1 });
  assert.deepEqual(names(byEmail.items), ["Çelik Cem"]);
  assert.deepEqual(byEmail.counts, { pending: 1, active: 0, inactive: 0 });
});

test("other tabs: only rows of that status", () => {
  assert.deepEqual(names(membersView(rows, { query: "", status: "inactive", page: 1 }).items), ["Zehra Ak"]);
});

test("activating the only row of the last page: the page is clamped and the counts follow", () => {
  const activate = (list: Row[], name: string) =>
    list.map((r) => (r.name === name ? { ...r, status: "active" as const } : r));
  const twentySix = activate(activate(rows, "Bekleyen 27"), "Bekleyen 26");
  const before = membersView(twentySix, { query: "", status: "pending", page: 2 });
  assert.deepEqual([before.page, before.pageCount, before.total, names(before.items)], [2, 2, 26, ["Bekleyen 25"]]);

  const after = membersView(activate(twentySix, "Bekleyen 25"), { query: "", status: "pending", page: 2 });
  assert.deepEqual([after.page, after.pageCount, after.items.length], [1, 1, 25]);
  assert.deepEqual(after.counts, { pending: 25, active: 4, inactive: 1 });
});

test("no match: no items, page 1, an empty range", () => {
  const view = membersView(rows, { query: "zzz", status: "pending", page: 3 });
  assert.deepEqual(view.counts, { pending: 0, active: 0, inactive: 0 });
  assert.deepEqual([view.items.length, view.page, view.pageCount, view.from, view.to, view.total], [0, 1, 1, 0, 0, 0]);
});
