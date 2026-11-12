import { Search } from "lucide-react";
import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { PendingCard } from "@/components/account/pending-card";
import { DirectorySkeleton } from "@/components/members/directory-skeleton";
import { SafetyFilters } from "@/components/members/safety-filters";
import { MemberCard } from "@/components/members/member-card";
import { InstallBanner } from "@/components/pwa/install-banner";
import { Pager } from "@/components/pager";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Link, getPathname, redirect } from "@/i18n/navigation";
import { can } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/user";
import { parseBloodTypeParam } from "@/lib/members/blood-type";
import { countDirectory, type IstanbulSide, listDirectory } from "@/lib/members/queries";
import { decodeNameCursor } from "@/lib/pagination";

const SIDES: IstanbulSide[] = ["asian", "european"];

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
  const side = SIDES.find((s) => s === params.side) ?? null;
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 60) : "";
  const cursor = decodeNameCursor(params.cursor);
  // Safety filters exist only for members.safety holders; for everyone else the params are ignored entirely.
  const safety = can(user.access, "members.safety");
  const bloodType = safety ? parseBloodTypeParam(params.blood) : null;
  const noContact = safety && params.noContact === "1";

  const [page, counts] = await Promise.all([
    listDirectory({ query, side, cursor, bloodType, noContact }),
    countDirectory({ query, bloodType, noContact }),
  ]);
  const filterQuery = { ...(bloodType ? { blood: bloodType } : {}), ...(noContact ? { noContact: "1" } : {}) };

  const chips: { side: IstanbulSide | null; label: string; count: number }[] = [
    { side: null, label: t("sides.all"), count: counts.total },
    { side: "asian", label: t("sides.asian"), count: counts.asian },
    { side: "european", label: t("sides.european"), count: counts.european },
  ];

  return (
    <>
      <div data-skeleton-result="members-total" className="flex min-h-5 items-center justify-between gap-3 text-sm">
        <p className="text-muted-foreground">{t("total", { count: counts.total })}</p>
        <Link href="/account" className="font-medium text-accent-text hover:underline">
          {t("editProfile")}
        </Link>
      </div>

      {/* GET form without action: submits to this page with only these fields (drops the cursor). */}
      <form role="search" data-skeleton-result="members-search" className="flex gap-2">
        {side && <input type="hidden" name="side" value={side} />}
        {bloodType && <input type="hidden" name="blood" value={bloodType} />}
        {noContact && <input type="hidden" name="noContact" value="1" />}
        <Input name="q" type="search" defaultValue={query} placeholder={t("search")} aria-label={t("searchLabel")} maxLength={60} />
        <Button type="submit" variant="outline" aria-label={t("searchLabel")}>
          <Search aria-hidden />
        </Button>
      </form>

      <nav data-skeleton-result="members-chips" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {chips.map((chip) => (
          <Link
            key={chip.side ?? "all"}
            href={{
              pathname: "/members",
              query: { ...(chip.side ? { side: chip.side } : {}), ...(query ? { q: query } : {}), ...filterQuery },
            }}
            aria-current={chip.side === side ? "page" : undefined}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-input px-3.5 py-1.5 text-sm font-medium text-muted-foreground aria-[current=page]:border-primary aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground"
          >
            {chip.label}
            <span className="tabular-nums opacity-70">{chip.count}</span>
          </Link>
        ))}
      </nav>

      {safety && <SafetyFilters bloodType={bloodType} noContact={noContact} query={query} side={side} />}

      {page.items.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">
          {counts.total === 0 && !query && !bloodType && !noContact ? t("empty") : t("noResults")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {page.items.map((member) => (
            <MemberCard key={member.id} member={member} safety={safety} />
          ))}
        </ul>
      )}

      <Pager pathname="/members" query={{ side: side ?? undefined, q: query || undefined, ...filterQuery }} nextCursor={page.nextCursor} onFirstPage={!cursor} />
      <InstallBanner />
    </>
  );
}
