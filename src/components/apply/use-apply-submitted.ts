"use client";

import { useSyncExternalStore } from "react";
import { getApplySubmitted, subscribeApplySubmitted } from "@/lib/applications/apply-submitted";

/** True once this tab sent an application linked to the signed-in account: the navs hide "Başvur" at once. */
export function useApplySubmitted(): boolean {
  return useSyncExternalStore(subscribeApplySubmitted, getApplySubmitted, () => false);
}
