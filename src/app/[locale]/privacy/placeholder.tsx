import type { ReactNode } from "react";

// Highlights text that still has to be filled in before the notice is final.
export function Placeholder({ children }: { children: ReactNode }) {
  return (
    <mark className="rounded bg-amber-200/70 px-1 font-medium text-amber-950 dark:bg-amber-400/30 dark:text-amber-100">
      [{children}]
    </mark>
  );
}
