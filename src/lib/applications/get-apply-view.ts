import "server-only";
import { cache } from "react";
import { unstable_rethrow } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/user";
import { type ApplyView, applyView } from "./apply-view";
import { getMyApplicationStatus } from "./queries";

/**
 * What /apply shows for the current visitor. Reads the session, so callers
 * must render behind <Suspense>. The application status is only read for
 * pending accounts (the only ones it can change the answer for).
 */
export const getApplyView = cache(async (): Promise<ApplyView> => {
  const user = await getCurrentUser();
  const profileStatus = user?.profile?.status;
  if (profileStatus !== "pending") return applyView(profileStatus, null);

  const application = await getMyApplicationStatus().catch((error: unknown) => {
    // Fall back to the form (a duplicate submit is still refused by the DB).
    // The message only carries the error code, no personal data (KVKK).
    unstable_rethrow(error);
    console.error("getApplyView:", error instanceof Error ? error.message : "getMyApplicationStatus failed");
    return null;
  });
  return applyView(profileStatus, application);
});
