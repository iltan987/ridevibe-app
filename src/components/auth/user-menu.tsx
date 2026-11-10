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
      <Link href="/sign-in" data-skeleton-result="user-menu" className={buttonVariants({ variant: "outline", size: "sm" })}>
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

// Same box as the signed-out "Giriş yap" button (the common case for ad visitors): 28 × 73.6 px in Turkish, "Sign in"
// is a little narrower. Signed-in avatars are 32 × 32; the 4 px difference is accepted.
export function UserMenuSkeleton() {
  return <Skeleton data-skeleton="user-menu" className="h-7 w-[4.6rem] rounded-lg" />;
}
