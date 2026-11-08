"use client";

import { useTranslations } from "next-intl";
import { Suspense } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { isActive, navItems } from "./nav-items";

// App-style tab bar for phones; hidden from md breakpoint up. Active state
// streams in behind Suspense (see DesktopNav for why).
export function BottomNav() {
  return (
    <Suspense fallback={<BottomNavLinks />}>
      <BottomNavWithPathname />
    </Suspense>
  );
}

function BottomNavWithPathname() {
  return <BottomNavLinks pathname={usePathname()} />;
}

function BottomNavLinks({ pathname }: { pathname?: string }) {
  const t = useTranslations("Nav");

  return (
    <nav
      aria-label={t("menu")}
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {navItems.map(({ href, labelKey, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              aria-current={pathname && isActive(pathname, href) ? "page" : undefined}
              className="flex flex-col items-center gap-1 py-2 text-xs font-medium text-muted-foreground transition-colors aria-[current=page]:font-semibold aria-[current=page]:text-primary"
            >
              <Icon className="size-5" aria-hidden />
              {t(labelKey)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
