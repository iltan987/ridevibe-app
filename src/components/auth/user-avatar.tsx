"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/initials";

export type ShownUser = { name: string; avatarUrl: string | null };

// The header avatar: the user-menu trigger and its placeholder (UserMenuSkeleton) render the same markup.
export function UserAvatar({ name, avatarUrl }: ShownUser) {
  return (
    <Avatar>
      {avatarUrl && <AvatarImage src={avatarUrl} alt="" referrerPolicy="no-referrer" />}
      <AvatarFallback>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

// The user the header showed last in this tab, in memory only (gone on reload; never stored). A language switch
// remounts the [locale] layout and shows the user-menu fallback again while the server re-sends the menu; the
// fallback shows this avatar instead of a grey circle.
let lastShown: ShownUser | null = null;

export function rememberShownUser(user: ShownUser | null): void {
  lastShown = user;
}

export function lastShownUser(): ShownUser | null {
  return lastShown;
}
