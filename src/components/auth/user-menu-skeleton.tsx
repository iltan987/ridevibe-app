"use client";

import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { lastShownUser, UserAvatar } from "@/components/auth/user-avatar";
import { InlineScript } from "@/components/inline-script";
import { Skeleton } from "@/components/ui/skeleton";
import { hasSessionCookie, sessionHintScript } from "@/lib/auth/session-hint";
import { cn } from "@/lib/utils";

const noSubscribe = () => () => {};

// Fallback for <UserMenu />. The static shell can't know the session, so the shape comes from the auth cookie:
// signed out → the outline `sm` "Giriş Yap" button box with the real (invisible) label, so the width matches in every
// locale; signed in → the 32px avatar circle. Server HTML: the inline script sets `data-session` before first paint;
// client renders (fallback shown again after a language switch) read the cookie directly.
// If this tab already showed the user's avatar (fallback shown again after a language switch), it shows that avatar
// instead of a grey circle. Keep the box in sync with the signed-out link in user-menu.tsx (buttonVariants outline/sm).
export function UserMenuSkeleton() {
  const t = useTranslations("Auth");
  const signedIn = useSyncExternalStore(noSubscribe, () => hasSessionCookie(document.cookie), () => false);
  const shown = useSyncExternalStore(noSubscribe, lastShownUser, () => null);
  if (signedIn && shown) {
    return (
      <span data-skeleton="user-menu" aria-hidden className="rounded-full">
        <UserAvatar {...shown} />
      </span>
    );
  }
  return (
    <>
      <Skeleton
        data-skeleton="user-menu"
        data-session={signedIn ? "" : undefined}
        aria-hidden
        suppressHydrationWarning
        className={cn(
          // outline/sm button box: h-7, 1px border, px-2.5, text-[0.8rem] medium, radius
          "inline-flex h-7 shrink-0 items-center overflow-hidden rounded-[min(var(--radius-md),12px)] border",
          "border-transparent px-2.5 text-[0.8rem] font-medium whitespace-nowrap text-transparent select-none",
          // signed in: the 32px avatar
          "data-session:size-8 data-session:rounded-full data-session:border-0 data-session:p-0",
        )}
      >
        {t("signIn")}
      </Skeleton>
      <InlineScript html={sessionHintScript} />
    </>
  );
}
