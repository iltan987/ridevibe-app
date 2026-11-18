import type { Enums } from "../supabase/database.types.ts";

/** What /apply shows: the form, or one of the notices that replace it. */
export type ApplyView = "form" | "alreadyMember" | "underReview" | "inactive" | "deleting";

/**
 * The one rule for what /apply shows. A visitor, a signed-in user without a
 * profile row, and a pending applicant without an open application see the form.
 * `applicationStatus` only matters for pending accounts (approval moves the
 * account on to ön alım, so "approved" while still pending is transient and shows the form).
 */
export function applyView(
  profileStatus: Enums<"member_status"> | null | undefined,
  applicationStatus: Enums<"application_status"> | null,
): ApplyView {
  if (profileStatus === "deleting") return "deleting";
  if (profileStatus === "active" || profileStatus === "probation") return "alreadyMember";
  if (profileStatus === "inactive") return "inactive";
  if (profileStatus === "pending" && (applicationStatus === "new" || applicationStatus === "contacted")) {
    return "underReview";
  }
  return "form";
}
