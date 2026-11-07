"use client";

import { cn } from "cn";
import { useTranslations } from "next-intl";
import { Suspense } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { isActive, navItems } from "./nav-items";

// usePathname() can't be resolved while prerendering routes with unknown
// dynamic params (e.g. /admin/applications/[id]), so the active-state version
// streams in behind Suspense; the fallback is the same nav without highlight.
export function DesktopNav() {
  return (
    <Suspense fallback={<DesktopNavLinks />}>
      <DesktopNavWithPathname />
    </Suspense>
  );
}

function DesktopNavWithPathname() {
  return <DesktopNavLinks pathname={usePathname()} />;
}

function DesktopNavLinks({ pathname }: { pathname?: string }) {
  const t = useTranslations("Nav");

  return (
    <nav className="hidden items-center gap-1 md:flex">
      {navItems.map(({ href, labelKey }) => (
        <Link
          key={href}
          href={href}
          aria-current={pathname && isActive(pathname, href) ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
            "aria-[current=page]:bg-muted aria-[current=page]:text-foreground",
          )}
        >
          {t(labelKey)}
        </Link>
      ))}
    </nav>
  );
}
