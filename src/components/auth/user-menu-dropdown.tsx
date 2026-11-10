"use client";

import { ClipboardList, LogOut, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "@/i18n/navigation";
import { signOut } from "@/lib/auth/actions";
import { initials } from "@/lib/initials";

export function UserMenuDropdown({
  name,
  avatarUrl,
  showApplications,
  showMembers,
  showRoles,
}: {
  name: string;
  avatarUrl: string | null;
  showApplications: boolean;
  showMembers: boolean;
  showRoles: boolean;
}) {
  const t = useTranslations("Auth");
  const tAdmin = useTranslations("Admin");
  const [isPending, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("userMenu")}
        data-skeleton-result="user-menu"
        className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Avatar>
          {avatarUrl && <AvatarImage src={avatarUrl} alt="" referrerPolicy="no-referrer" />}
          <AvatarFallback>{initials(name)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent keepMounted align="end" className="min-w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="truncate">{name}</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLinkItem render={<Link href="/account" />}>
          <UserRound aria-hidden />
          {t("account")}
        </DropdownMenuLinkItem>
        {showApplications && (
          <DropdownMenuLinkItem render={<Link href="/admin/applications" />}>
            <ClipboardList aria-hidden />
            {tAdmin("applications")}
          </DropdownMenuLinkItem>
        )}
        {showMembers && (
          <DropdownMenuLinkItem render={<Link href="/admin/members" />}>
            <UsersRound aria-hidden />
            {tAdmin("members.title")}
          </DropdownMenuLinkItem>
        )}
        {showRoles && (
          <DropdownMenuLinkItem render={<Link href="/admin/roles" />}>
            <ShieldCheck aria-hidden />
            {tAdmin("roles.title")}
          </DropdownMenuLinkItem>
        )}
        <DropdownMenuItem
          disabled={isPending}
          onClick={() => startTransition(() => signOut())}
        >
          <LogOut aria-hidden />
          {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
