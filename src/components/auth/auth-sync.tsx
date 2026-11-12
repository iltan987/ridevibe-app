"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { AUTH_SYNC_KEY, authChanged, authMark, authRenderAction, tabChannel } from "@/lib/cross-tab";

// The stored mark this tab last refreshed for (see `authRenderAction`); per page, like the channel.
let refreshedFor: string | null = null;

/**
 * Keeps open tabs on the same account. Each server render of `UserMenu` passes who it shows (`user`: a short hash,
 * "" = signed out) and when (`renderedAt`); a newer render than the stored mark publishes it, an older one of another
 * user refreshes. When another tab stores a different user, this tab refreshes and the server decides where it lands
 * (private pages → sign-in with `next`, `/sign-in` → its `next`). Rendered by `UserMenu` (every page header).
 */
export function AuthSync({ user, renderedAt }: { user: string; renderedAt: number }) {
  const router = useRouter();

  useEffect(() => {
    const channel = tabChannel(AUTH_SYNC_KEY);
    const stored = channel.current();
    if (stored === null) return; // storage blocked: no sync
    const action = authRenderAction(stored, user, renderedAt, refreshedFor);
    if (action === "publish") channel.publish(authMark(user, renderedAt));
    if (action === "refresh") {
      refreshedFor = stored;
      router.refresh();
    }
  }, [user, renderedAt, router]);

  useEffect(
    () =>
      tabChannel(AUTH_SYNC_KEY).subscribe((stored) => {
        if (authChanged(stored, user)) router.refresh();
      }),
    [user, router],
  );

  return null;
}
