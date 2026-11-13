import type { ReactNode } from "react";

/** Shown above a list that loaded only the first `LIST_CEILING` rows (the rest is missing: fail loudly). */
export function CeilingNotice({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">
      {children}
    </p>
  );
}
