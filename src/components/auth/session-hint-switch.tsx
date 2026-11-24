"use client";

import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";
import { InlineScript } from "@/components/inline-script";
import { hasSessionCookie, sessionHintParentScript } from "@/lib/auth/session-hint";
import { noSubscribe } from "@/lib/no-subscribe";

/**
 * A Suspense fallback whose shape depends on whether the visitor is signed in, for the static shell, which can't know
 * the session: renders both and shows `signedIn` when a Supabase auth cookie exists (`hasSessionCookie`), else
 * `signedOut`. Server HTML: the inline script (first child) marks this wrapper with `data-session` before first paint;
 * client renders (fallback shown again after a language switch) read the cookie directly. Pass server components:
 * they render on the server as props.
 */
export function SessionHintSwitch({ signedIn, signedOut }: { signedIn: ReactNode; signedOut: ReactNode }) {
  const session = useSyncExternalStore(
    noSubscribe,
    () => hasSessionCookie(document.cookie),
    () => false,
  );
  return (
    <div data-session={session ? "" : undefined} suppressHydrationWarning>
      <InlineScript html={sessionHintParentScript} />
      <div className="hidden in-data-session:block">{signedIn}</div>
      <div className="in-data-session:hidden">{signedOut}</div>
    </div>
  );
}
