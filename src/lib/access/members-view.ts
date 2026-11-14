// What the admin members list shows for a status tab, search and page — computed in the browser from every profile.
// Dependency-free so `node --test` can run its tests.

import type { Enums } from "../supabase/database.types.ts";
import { slicePage } from "../pagination.ts";
import { foldSearch, matchesFolded } from "../search-fold.ts";

export type MemberStatus = Enums<"member_status">;
/** A status staff can see and set: `deleting` accounts are hidden from staff and never settable. */
export type StaffStatus = Exclude<MemberStatus, "deleting">;
export const MEMBER_STATUSES = ["pending", "active", "inactive"] as const satisfies readonly StaffStatus[];

export function isStaffStatus(status: string): status is StaffStatus {
  return MEMBER_STATUSES.some((s) => s === status);
}

/**
 * `search` on each row is `foldSearch(name + " " + email)` (folded once on the server); `query` is normalized.
 * Tab counts honour the search; rows keep their order; out-of-range pages are clamped.
 */
export function membersView<T extends { status: StaffStatus; search: string }>(
  rows: T[],
  { query, status, page }: { query: string; status: StaffStatus; page: number },
) {
  const foldedQuery = foldSearch(query);
  const matched = rows.filter((row) => matchesFolded(row.search, foldedQuery));
  const counts: Record<StaffStatus, number> = { pending: 0, active: 0, inactive: 0 };
  for (const row of matched) counts[row.status] += 1;
  return {
    counts,
    ...slicePage(
      matched.filter((row) => row.status === status),
      page,
    ),
  };
}
