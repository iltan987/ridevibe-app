import { Search } from "lucide-react";
import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { MemberRow } from "@/components/admin/member-row";
import { Pager } from "@/components/admin/pager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { countMembersByStatus, listMembers, listRoles, MEMBER_STATUSES, type MemberStatus } from "@/lib/access/queries";
import { requirePermission } from "@/lib/auth/require-access";
import { decodeCursor } from "@/lib/pagination";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Admin.members");
  return { title: t("title"), robots: { index: false } };
}

export default function MembersPage({ searchParams }: PageProps<"/[locale]/admin/members">) {
  const t = useTranslations("Admin.members");

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <h1 className="heading text-3xl">{t("title")}</h1>
      <Suspense fallback={<ListSkeleton />}>
        <MembersList searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-9 w-full" />
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl" />
      ))}
    </div>
  );
}

async function MembersList({ searchParams }: { searchParams: PageProps<"/[locale]/admin/members">["searchParams"] }) {
  const me = await requirePermission("members.manage", "/admin/members");

  const params = await searchParams;
  const status: MemberStatus = MEMBER_STATUSES.includes(params.status as MemberStatus)
    ? (params.status as MemberStatus)
    : "pending";
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 60) : "";
  const cursor = decodeCursor(params.cursor);

  const [page, counts, roles, t, tAccount, format] = await Promise.all([
    listMembers({ status, query, cursor }),
    countMembersByStatus(),
    listRoles(),
    getTranslations("Admin.members"),
    getTranslations("Account"),
    getFormatter(),
  ]);

  const roleLabel = (roleId: string | null) => {
    const role = roles.find((r) => r.id === roleId);
    if (!role) return t("noRole");
    return role.isAdmin ? tAccount("roles.admin") : role.name;
  };
  const roleOptions = roles.map((r) => ({ id: r.id, label: r.isAdmin ? tAccount("roles.admin") : r.name }));
  const adminRoleIds = new Set(roles.filter((r) => r.isAdmin).map((r) => r.id));

  return (
    <>
      <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {MEMBER_STATUSES.map((s) => (
          <Link
            key={s}
            href={{ pathname: "/admin/members", query: query ? { status: s, q: query } : { status: s } }}
            aria-current={s === status ? "page" : undefined}
            className="flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium text-muted-foreground aria-[current=page]:border-primary aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground"
          >
            {t(`statuses.${s}`)}
            <span className="tabular-nums opacity-70">{counts[s]}</span>
          </Link>
        ))}
      </nav>

      {/* GET form without action: submits to this page with only these fields (drops the cursor). */}
      <form role="search" className="flex gap-2">
        <input type="hidden" name="status" value={status} />
        <Input name="q" type="search" defaultValue={query} placeholder={t("search")} aria-label={t("search")} maxLength={60} />
        <Button type="submit" variant="outline" aria-label={t("searchButton")}>
          <Search aria-hidden />
        </Button>
      </form>

      {status === "pending" && <p className="text-sm text-muted-foreground">{t("pendingHint")}</p>}

      {page.items.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {page.items.map((m) => (
            <MemberRow
              key={m.id}
              member={{
                id: m.id,
                name: m.full_name,
                email: m.member_contacts?.email ?? null,
                avatarUrl: m.avatar_url,
                status: m.status,
                joinedLabel: t("joined", { date: format.dateTime(new Date(m.created_at), { dateStyle: "medium" }) }),
                roleId: m.role_id,
                roleLabel: roleLabel(m.role_id),
              }}
              roles={roleOptions}
              isSelf={m.id === me.id}
              canAssignRole={me.access.isAdmin}
              // Mirrors set_member_status(): only admins change an admin's status.
              canChangeStatus={me.access.isAdmin || !adminRoleIds.has(m.role_id ?? "")}
            />
          ))}
        </ul>
      )}

      <Pager
        pathname="/admin/members"
        query={{ status, q: query || undefined }}
        nextCursor={page.nextCursor}
        onFirstPage={!cursor}
      />
    </>
  );
}
