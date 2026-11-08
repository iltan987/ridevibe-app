import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { can } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/user";
import { UserMenuDropdown } from "./user-menu-dropdown";

// Reads the session, so it must render inside <Suspense fallback={<UserMenuSkeleton />}>.
export async function UserMenu() {
  const [user, t] = await Promise.all([getCurrentUser(), getTranslations("Auth")]);

  if (!user) {
    return (
      <Link href="/sign-in" className={buttonVariants({ variant: "outline", size: "sm" })}>
        {t("signIn")}
      </Link>
    );
  }

  return (
    <UserMenuDropdown
      name={user.profile?.full_name || user.email || ""}
      avatarUrl={user.profile?.avatar_url ?? null}
      showApplications={can(user.access, "applications.view")}
      showMembers={can(user.access, "members.manage")}
      showRoles={user.access.isAdmin}
    />
  );
}

export function UserMenuSkeleton() {
  return <Skeleton className="size-8 rounded-full" />;
}
