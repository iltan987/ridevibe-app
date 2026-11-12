import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { can } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/user";
import { AuthSync } from "./auth-sync";
import { UserMenuDropdown } from "./user-menu-dropdown";

// Reads the session, so it must render inside <Suspense fallback={<UserMenuSkeleton />}> (user-menu-skeleton.tsx).
export async function UserMenu() {
  const [user, t] = await Promise.all([getCurrentUser(), getTranslations("Auth")]);

  if (!user) {
    // UserMenuSkeleton mirrors this box (outline/sm with the same label); keep them in sync.
    return (
      <>
        <AuthSync userId={null} />
        <Link href="/sign-in" data-skeleton-result="user-menu" className={buttonVariants({ variant: "outline", size: "sm" })}>
          {t("signIn")}
        </Link>
      </>
    );
  }

  return (
    <>
      <AuthSync userId={user.id} />
      <UserMenuDropdown
        name={user.profile?.full_name || user.email || ""}
        avatarUrl={user.profile?.avatar_url ?? null}
        showApplications={can(user.access, "applications.view")}
        showMembers={can(user.access, "members.manage")}
        showRoles={user.access.isAdmin}
        showInstall={user.profile?.status === "active" || user.profile?.status === "pending"}
      />
    </>
  );
}
