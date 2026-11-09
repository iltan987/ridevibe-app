import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getPathname, redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth/user";
import { initials } from "@/lib/initials";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Account");
  return { title: t("title"), robots: { index: false } };
}

export default function AccountPage() {
  const t = useTranslations("Account");

  return (
    <section className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="heading text-3xl">{t("title")}</h1>
      <Suspense fallback={<Skeleton className="h-40 w-full rounded-xl" />}>
        <AccountDetails />
      </Suspense>
    </section>
  );
}

async function AccountDetails() {
  const [user, locale, t] = await Promise.all([
    getCurrentUser(),
    getLocale(),
    getTranslations("Account"),
  ]);

  if (!user) {
    const next = getPathname({ href: "/account", locale });
    return redirect({ href: { pathname: "/sign-in", query: { next } }, locale });
  }

  const profile = user.profile;
  const name = profile?.full_name || user.email || "";

  return (
    <>
      {profile?.status === "pending" && (
        <Card className="border-sun/40 bg-sun/10">
          <CardHeader>
            <CardTitle>{t("pendingTitle")}</CardTitle>
            <CardDescription>{t("pendingBody")}</CardDescription>
          </CardHeader>
        </Card>
      )}
      <Card>
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
    </>
  );
}
