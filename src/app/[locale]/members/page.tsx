import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { PendingCard } from "@/components/account/pending-card";
import { DirectoryList } from "@/components/members/directory-list";
import { DirectorySkeleton } from "@/components/members/directory-skeleton";
import { SafetyFilters } from "@/components/members/safety-filters";
import { InstallBanner } from "@/components/pwa/install-banner";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPathname, redirect } from "@/i18n/navigation";
import { can } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/user";
import { parseBloodTypeParam } from "@/lib/members/blood-type";
import { loadDirectory } from "@/lib/members/queries";
import { LIST_CEILING } from "@/lib/pagination";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Members");
  return { title: t("title"), robots: { index: false } };
}

export default function MembersPage({ searchParams }: PageProps<"/[locale]/members">) {
  const t = useTranslations("Members");

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <h1 className="heading text-3xl">{t("title")}</h1>
      <Suspense fallback={<DirectorySkeleton />}>
        <Directory searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function Directory({ searchParams }: { searchParams: PageProps<"/[locale]/members">["searchParams"] }) {
  const [user, locale, t] = await Promise.all([getCurrentUser(), getLocale(), getTranslations("Members")]);

  if (!user) {
    const next = getPathname({ href: "/members", locale });
    return redirect({ href: { pathname: "/sign-in", query: { next } }, locale });
  }

  if (user.profile?.status !== "active") {
    return (
      <>
        {user.profile?.status === "pending" && <PendingCard />}
        <Card>
          <CardHeader className="items-start gap-3">
            <CardTitle>{t("activeOnlyTitle")}</CardTitle>
            <CardDescription>{t("activeOnlyBody")}</CardDescription>
          </CardHeader>
        </Card>
      </>
    );
  }

  const params = await searchParams;
  // Safety filters exist only for members.safety holders; for everyone else the params are ignored entirely.
  // They stay server-side (a blood filter is logged); search, side and page are handled in the browser.
  const safety = can(user.access, "members.safety");
  const bloodType = safety ? parseBloodTypeParam(params.blood) : null;
  const noContact = safety && params.noContact === "1";

  const { members, overCeiling } = await loadDirectory({ bloodType, noContact });
  if (overCeiling) console.error("member directory over ceiling", { count: `${LIST_CEILING}+` });

  return (
    <>
      <DirectoryList members={members} safety={safety} overCeiling={overCeiling} filtered={!!bloodType || noContact}>
        {safety && <SafetyFilters bloodType={bloodType} noContact={noContact} />}
      </DirectoryList>
      <InstallBanner />
    </>
  );
}
