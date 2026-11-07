"use client";

import { cn } from "cn";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { isActive, navItems } from "./nav-items";

export function DesktopNav() {
  const t = useTranslations("Nav");
  const pathname = usePathname();

  return (
    <nav className="hidden items-center gap-1 md:flex">
      {navItems.map(({ href, labelKey }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(pathname, href) ? "page" : undefined}
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
