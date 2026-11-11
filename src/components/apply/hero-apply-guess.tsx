"use client";

import type { ReactNode } from "react";
import { useApplyHiddenGuess } from "@/components/apply/use-apply-hidden-guess";
import { InlineScript } from "@/components/inline-script";
import { Link } from "@/i18n/navigation";
import { applyHintScript } from "@/lib/applications/apply-hint";

// The hero's "Başvur" in the static shell, before the session is known: shown unless we guess the visitor is a member
// or open applicant (inline script in the server HTML, hook on client renders). No UTM params here (see HeroApplyForUser).
export function HeroApplyGuess({ className, children }: { className?: string; children: ReactNode }) {
  const hidden = useApplyHiddenGuess();
  return (
    <>
      <Link
        href="/apply"
        data-apply-link=""
        data-apply-hidden={hidden ? "" : undefined}
        suppressHydrationWarning
        className={`${className ?? ""} data-[apply-hidden]:hidden`}
      >
        {children}
      </Link>
      {/* Must directly follow the <Link>: the script marks its previous element sibling. */}
      <InlineScript html={applyHintScript} />
    </>
  );
}
