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
  /** Whether "Başvur" is shown; undefined = guess (fallback in the static shell, see `BottomNavForUser`). */
  showApply?: boolean;
};

// App-style tab bar for phones; hidden from md breakpoint up. Active state
// streams in behind Suspense (see DesktopNav for why).
export function BottomNav({ showApply }: Props) {
  return (
    <Suspense fallback={<BottomNavLinks showApply={showApply} />}>
      <BottomNavWithPathname showApply={showApply} />
    </Suspense>
  );
}

function BottomNavWithPathname({ showApply }: Props) {
  return <BottomNavLinks pathname={usePathname()} showApply={showApply} />;
}

function BottomNavLinks({ pathname, showApply }: Props & { pathname?: string }) {
  const t = useTranslations("Nav");
  const guess = showApply === undefined;
  const guessHidden = useApplyHiddenGuess();
  const items = showApply === false ? navItems.filter(({ href }) => href !== "/apply") : navItems;

  return (
    <>
      {/* Guess mode: the inline script (server HTML) or the hook (client renders) sets data-apply-hidden. */}
      <nav
        aria-label={t("menu")}
        data-apply-hidden={guess && guessHidden ? "" : undefined}
        suppressHydrationWarning={guess}
        className="group fixed inset-x-0 bottom-0 z-40 border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul
          className={cn(
            "mx-auto grid max-w-md",
            showApply === false ? "grid-cols-4" : "grid-cols-5 group-data-apply-hidden:grid-cols-4",
          )}
        >
          {items.map(({ href, labelKey, icon: Icon }) => (
            <li key={href} className={href === "/apply" ? "group-data-apply-hidden:hidden" : undefined}>
              <Link
                href={href}
                data-apply-link={href === "/apply" ? "" : undefined}
                aria-current={pathname && isActive(pathname, href) ? "page" : undefined}
                className="flex flex-col items-center gap-1 py-2 text-xs font-medium text-muted-foreground transition-colors aria-[current=page]:font-semibold aria-[current=page]:text-accent-text"
              >
                <Icon className="size-5" aria-hidden />
                {t(labelKey)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {/* Must directly follow the <nav>: the script marks its previous element sibling. */}
      {guess && <InlineScript html={applyHintScript} />}
    </>
  );
}
