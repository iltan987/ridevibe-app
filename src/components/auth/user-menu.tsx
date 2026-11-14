import { createHash } from "node:crypto";
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
  // Cross-tab sync (AuthSync): who this render shows and when. A short hash, not the account id, goes to the
  // browser's storage: enough to tell accounts apart. `Date.now()` is allowed here: the session read made this
  // render request-time (`connection()` in createClient).
  const syncUser = user ? createHash("sha256").update(user.id).digest("base64url").slice(0, 12) : "";
  const renderedAt = Date.now(); // eslint-disable-line react-hooks/purity -- async Server Component: one render per request, the time is request data

  if (!user) {
    // UserMenuSkeleton mirrors this box (outline/sm with the same label); keep them in sync.
    return (
      <>
        <AuthSync user={syncUser} renderedAt={renderedAt} />
        <Link
          href="/sign-in"
          data-skeleton-result="user-menu"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          {t("signIn")}
        </Link>
      </>
    );
  }

  return (
    <>
      <AuthSync user={syncUser} renderedAt={renderedAt} />
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
