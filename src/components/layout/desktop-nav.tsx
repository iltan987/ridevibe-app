"use client";

import { cn } from "cn";
import { useTranslations } from "next-intl";
import { Suspense } from "react";
import { useApplyHiddenGuess } from "@/components/apply/use-apply-hidden-guess";
import { InlineScript } from "@/components/inline-script";
import { Link, usePathname } from "@/i18n/navigation";
import { applyHintScript } from "@/lib/applications/apply-hint";
import { isActive, navItems } from "./nav-items";

type Props = {
  /** Whether "Başvur" is shown; undefined = guess (fallback in the static shell, see `DesktopNavForUser`). */
  showApply?: boolean;
};

// usePathname() can't be resolved while prerendering routes with unknown
// dynamic params (e.g. /admin/applications/[id]), so the active-state version
// streams in behind Suspense; the fallback is the same nav without highlight.
export function DesktopNav({ showApply }: Props) {
  return (
    <Suspense fallback={<DesktopNavLinks showApply={showApply} />}>
      <DesktopNavWithPathname showApply={showApply} />
    </Suspense>
  );
}

function DesktopNavWithPathname({ showApply }: Props) {
  return <DesktopNavLinks pathname={usePathname()} showApply={showApply} />;
}

function DesktopNavLinks({ pathname, showApply }: Props & { pathname?: string }) {
  const t = useTranslations("Nav");
  const guess = showApply === undefined;
  const guessHidden = useApplyHiddenGuess();
  const items = showApply === false ? navItems.filter(({ href }) => href !== "/apply") : navItems;

  return (
    <>
      {/* Guess mode: the inline script (server HTML) or the hook (client renders) sets data-apply-hidden. */}
      <nav
        data-apply-hidden={guess && guessHidden ? "" : undefined}
        suppressHydrationWarning={guess}
        className="group hidden items-center gap-1 md:flex"
      >
        {items.map(({ href, labelKey }) => (
          <Link
            key={href}
            href={href}
            data-apply-link={href === "/apply" ? "" : undefined}
            aria-current={pathname && isActive(pathname, href) ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
              "aria-[current=page]:bg-card aria-[current=page]:font-semibold aria-[current=page]:text-accent-text",
              href === "/apply" && "group-data-apply-hidden:hidden",
            )}
          >
            {t(labelKey)}
          </Link>
        ))}
      </nav>
      {/* Must directly follow the <nav>: the script marks its previous element sibling. */}
      {guess && <InlineScript html={applyHintScript} />}
    </>
  );
}
