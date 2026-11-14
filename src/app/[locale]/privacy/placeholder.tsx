import type { ReactNode } from "react";

// Highlights text that still has to be filled in before the notice is final.
export function Placeholder({ children }: { children: ReactNode }) {
  return <mark className="rounded bg-sun/30 px-1 font-medium text-foreground">[{children}]</mark>;
}
