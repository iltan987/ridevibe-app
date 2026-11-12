import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { InstallBanner } from "@/components/pwa/install-banner";
import { PendingCard } from "@/components/account/pending-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LocationForm } from "@/components/profile/location-form";
import { MotorcyclesSection } from "@/components/profile/motorcycles-section";
import { PhotoConsentForm } from "@/components/profile/photo-consent-form";
import { VisibilityForm } from "@/components/profile/visibility-form";
import { getPathname, redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth/user";
import { initials } from "@/lib/initials";
import { getMyProfile } from "@/lib/members/queries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Account");
  return { title: t("title"), robots: { index: false } };
}

export default function AccountPage() {
  const t = useTranslations("Account");

  return (
    <section className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="heading text-3xl">{t("title")}</h1>
      <Suspense fallback={<AccountSkeleton />}>
        <AccountDetails />
      </Suspense>
    </section>
  );
}

async function AccountDetails() {
  const [user, locale, t, tp] = await Promise.all([
    getCurrentUser(),
    getLocale(),
    getTranslations("Account"),
    getTranslations("Profile"),
  ]);

  if (!user) {
    const next = getPathname({ href: "/account", locale });
    return redirect({ href: { pathname: "/sign-in", query: { next } }, locale });
  }

  const profile = user.profile;
  const name = profile?.full_name || user.email || "";
  // Active members edit everything; inactive ones only keep the photo consent
  // (withdrawal must stay possible). Pending accounts have no profile data yet.
  const myProfile =
    profile?.status === "active" || profile?.status === "inactive" ? await getMyProfile() : null;

  return (
    <>
      {profile?.status === "pending" && <PendingCard />}
      <Card data-skeleton-result="account">
        <CardHeader className="flex flex-row items-center gap-4">
          <Avatar className="size-14">
            {profile?.avatar_url && (
              <AvatarImage src={profile.avatar_url} alt="" referrerPolicy="no-referrer" />
            )}
            <AvatarFallback>{initials(name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <CardTitle className="truncate text-lg">{name}</CardTitle>
            {user.email && <CardDescription className="truncate">{user.email}</CardDescription>}
            {profile && <p className="mt-1 text-xs text-muted-foreground">{tp("nameHint")}</p>}
          </div>
        </CardHeader>
        {profile && (
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-3 text-sm">
              <dt className="text-muted-foreground">{t("status")}</dt>
              <dd>
                <Badge variant={profile.status === "active" ? "status" : "secondary"}>
                  {t(`statuses.${profile.status}`)}
                </Badge>
              </dd>
              <dt className="text-muted-foreground">{t("role")}</dt>
              <dd>{user.role ? (user.role.isAdmin ? t("roles.admin") : user.role.name) : t("roles.member")}</dd>
            </dl>
          </CardContent>
        )}
      </Card>
      {myProfile && (
        <>
          {profile?.status === "active" && (
            <>
              <LocationForm city={myProfile.city} district={myProfile.district} />
              <MotorcyclesSection motorcycles={myProfile.motorcycles} />
              <VisibilityForm
                instagram={myProfile.instagram}
                showInstagram={myProfile.showInstagram}
                showBirthday={myProfile.showBirthday}
                birthDate={myProfile.birthDate}
              />
            </>
          )}
          <PhotoConsentForm consent={myProfile.consentPhotos} consentAt={myProfile.consentPhotosAt} />
        </>
      )}
      {(profile?.status === "active" || profile?.status === "pending") && <InstallBanner />}
    </>
  );
}

/**
 * Mirrors the default (active member) page: the account card plus the four profile sections (heights measured with
 * `scripts/e2e/skeletons.mjs`: inputs are `h-10 md:h-9`, the native select `h-10 md:h-8`, the visibility hint wraps to
 * two lines on a phone). Pending and inactive pages are shorter (status is request-time data).
 */
function AccountSkeleton() {
  return (
    <>
      <Card data-skeleton="account">
        <CardHeader className="flex flex-row items-center gap-4">
          <Skeleton className="size-14 rounded-full" />
          <div className="flex min-w-0 flex-col">
            <Skeleton className="my-1.5 h-4 w-32" />
            <Skeleton className="my-[3px] h-3.5 w-44" />
            <Skeleton className="mt-1 h-4 w-56" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-3">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-[21px] w-16 rounded-full" />
            <Skeleton className="h-4 w-8" />
            <Skeleton className="h-5 w-20" />
          </div>
        </CardContent>
      </Card>
      <SectionSkeleton id="profile-location">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-[19.25px] w-12" />
          <Skeleton className="h-10 w-full md:h-8" />
        </div>
        <Skeleton className="h-8 w-20" />
      </SectionSkeleton>
      <SectionSkeleton id="profile-motorcycles">
        <Skeleton className="h-5 w-52" />
        <Skeleton className="mb-2 h-8 w-36" />
      </SectionSkeleton>
      <SectionSkeleton id="profile-visibility" description>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-[19.25px] w-40" />
          <Skeleton className="h-10 w-full md:h-9" />
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-8 w-20" />
      </SectionSkeleton>
      <SectionSkeleton id="profile-consent">
        {/* consent label: 3 lines on phones, 2 from sm (Turkish copy) */}
        <Skeleton className="h-15 w-full sm:h-10" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-8 w-20" />
      </SectionSkeleton>
    </>
  );
}

/** A profile section card: title (22px, like `CardTitle`), optional description, then the rows. */
function SectionSkeleton({ id, description, children }: { id: string; description?: boolean; children: React.ReactNode }) {
  return (
    <Card data-skeleton={id}>
      <CardHeader>
        <Skeleton className="my-px h-5 w-32" />
        {description && <Skeleton className="h-10 w-full sm:h-5" />}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}
