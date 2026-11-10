"use client";

import { useLinkStatus } from "next/link";
import { useEffect } from "react";
import { beginNavigation } from "@/lib/navigation/pending-store";

/**
 * Rendered inside every `Link`: marks its anchor (`a:has(> [data-link-pending])`
 * styles it) and reports the pending navigation to the shared store.
 */
export function LinkPending() {
  const { pending } = useLinkStatus();

  useEffect(() => {
    if (!pending) return;
    return beginNavigation();
  }, [pending]);

  return pending ? <span data-link-pending hidden /> : null;
}
