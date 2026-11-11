"use client";

import { useSyncExternalStore } from "react";
import { guessApplyHidden, readApplyHint } from "@/lib/applications/apply-hint";
import { hasSessionCookie } from "@/lib/auth/session-hint";

const noSubscribe = () => () => {};

/**
 * Client renders of the nav fallback (shown again after a language switch remounts the [locale] layout): the same
 * guess as the inline `applyHintScript` in the server HTML. Server snapshot `false`: the script sets the attribute.
 */
export function useApplyHiddenGuess(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => guessApplyHidden(hasSessionCookie(document.cookie), readApplyHint(() => localStorage)),
    () => false,
  );
}
