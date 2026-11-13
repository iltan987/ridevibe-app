import type { ReactNode } from "react";
import { ApplyLink } from "@/components/apply/apply-link";
import { getApplyView } from "@/lib/applications/get-apply-view";

// The home page's "Başvur" buttons (hero and closing) exactly when /apply would show the form; keeps the ad's UTM params. Reads the session, so render
// it behind <Suspense> with `HeroApplyGuess` as the fallback.
export async function HeroApplyForUser({ className, children }: { className?: string; children: ReactNode }) {
  const view = await getApplyView();
  if (view !== "form") return null;
  return (
    <ApplyLink data-apply-link="" className={className}>
      {children}
    </ApplyLink>
  );
}
