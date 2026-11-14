export type DeletionResult = "ok" | "alreadyDeleting" | "lastAdmin" | "error";

/** Days between the deletion request and the permanent purge (matches the SQL grace period). */
export const DELETION_GRACE_DAYS = 14;

/** Maps the error of `request_my_account_deletion()` to what the action does next. */
export function deletionResult(error: { code?: string; hint?: string } | null): DeletionResult {
  if (!error) return "ok";
  if (error.code === "55000") return "alreadyDeleting";
  if (error.code === "42501" && error.hint === "last_admin") return "lastAdmin";
  return "error";
}

/** When a deleting account is purged: the request time plus the grace period. */
export function deletionDate(requestedAt: string): Date {
  return new Date(new Date(requestedAt).getTime() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000);
}
