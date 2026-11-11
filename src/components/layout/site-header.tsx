import { Suspense } from "react";
import { UserMenu } from "@/components/auth/user-menu";
import { UserMenuSkeleton } from "@/components/auth/user-menu-skeleton";
import { Wordmark } from "@/components/brand/wordmark";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { Link } from "@/i18n/navigation";
import { DesktopNav } from "./desktop-nav";
import { LocaleSwitcher } from "./locale-switcher";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-4 px-4">
        <Link href="/" className="text-foreground">
          <Wordmark className="h-7" />
        </Link>
        <DesktopNav />
        <div className="ml-auto flex items-center gap-2">
          <LocaleSwitcher />
          <ThemeSwitcher />
          {/* Session-dependent: streams in while the rest of the page is static. */}
          <Suspense fallback={<UserMenuSkeleton />}>
            <UserMenu />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
