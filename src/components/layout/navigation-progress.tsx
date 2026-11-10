"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  getPendingCount,
  getServerPendingCount,
  subscribePending,
} from "@/lib/navigation/pending-store";

const SHOW_DELAY_MS = 150;

/**
 * Thin top bar shown while any `Link` navigation is pending. Appears only after
 * a short delay so instant (prefetched) navigations never flash it.
 */
export function NavigationProgress() {
  const count = useSyncExternalStore(
    subscribePending,
    getPendingCount,
    getServerPendingCount,
  );
  const pending = count > 0;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => {
      clearTimeout(timer);
      setVisible(false);
    };
  }, [pending]);

  if (!visible || !pending) return null;

  return (
    <div
      aria-hidden
      data-nav-progress
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5"
    >
      <div className="h-full origin-left animate-[nav-progress_8s_ease-out_forwards] bg-primary motion-reduce:animate-none motion-reduce:scale-x-100" />
    </div>
  );
}
