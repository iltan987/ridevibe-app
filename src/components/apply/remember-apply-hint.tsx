"use client";

import { useEffect } from "react";
import { writeApplyHint } from "@/lib/applications/apply-hint";

/** Stores the streamed answer for the next first-paint guess (`useApplyHiddenGuess`, `applyHintScript`). */
export function RememberApplyHint({ hidden }: { hidden: boolean }) {
  useEffect(() => {
    writeApplyHint(() => localStorage, hidden);
  }, [hidden]);
  return null;
}
