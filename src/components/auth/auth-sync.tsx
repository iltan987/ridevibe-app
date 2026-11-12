"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { AUTH_SYNC_KEY, tabChannel } from "@/lib/cross-tab";

/**
 * Keeps open tabs on the same account: publishes who this tab's server render says is signed in, and refreshes when
 * another tab signs in, out or switches account. The refresh lets the server decide where the tab lands (private
 * pages → sign-in with `next`, `/sign-in` → its `next`). Rendered by `UserMenu` (every page header), signed in or out.
 */
export function AuthSync({ userId }: { userId: string | null }) {
  const router = useRouter();

  useEffect(() => {
    tabChannel(AUTH_SYNC_KEY).publish(userId ?? "");
  }, [userId]);

  useEffect(() => tabChannel(AUTH_SYNC_KEY).subscribe(() => router.refresh()), [router]);

  return null;
}
