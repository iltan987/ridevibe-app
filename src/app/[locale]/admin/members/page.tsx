import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ListSkeleton } from "@/components/admin/list-skeleton";
import { MembersList } from "@/components/admin/members-list";
import { getPendingApplicationFlags, listAllProfiles, listRoles } from "@/lib/access/queries";
import { requirePermission } from "@/lib/auth/require-access";
import { LIST_CEILING } from "@/lib/pagination";
import { foldSearch } from "@/lib/search-fold";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Admin.members");
  return { title: t("title"), robots: { index: false } };
}

export default function MembersPage() {
  const t = useTranslations("Admin.members");

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <h1 className="heading text-3xl">{t("title")}</h1>
      <Suspense
        fallback={<ListSkeleton rows={4} rowClassName="h-36.75 sm:h-26.75" listClassName="gap-2" search hint pager />}
      >
        <Members />
      </Suspense>
    </section>
  );
}

/** Loads every profile once; tabs, search and pages run in the browser (`MembersList`, state in the URL). */
async function Members() {
  const me = await requirePermission("members.manage", "/admin/members");

  const [{ profiles, overCeiling }, roles, t, tAccount, format] = await Promise.all([
    listAllProfiles(),
    listRoles(),
    getTranslations("Admin.members"),
    getTranslations("Account"),
    getFormatter(),
  ]);
  if (overCeiling) console.error("admin members over ceiling", { count: `${LIST_CEILING}+` });

  const flags = await getPendingApplicationFlags(profiles.filter((p) => p.status === "pending").map((p) => p.id));

  const roleLabel = (roleId: string | null) => {
    const role = roles.find((r) => r.id === roleId);
    if (!role) return t("noRole");
    return role.isAdmin ? tAccount("roles.admin") : role.name;
  };
  const roleOptions = roles.map((r) => ({ id: r.id, label: r.isAdmin ? tAccount("roles.admin") : r.name }));
  const adminRoleIds = new Set(roles.filter((r) => r.isAdmin).map((r) => r.id));

  const rows = profiles.map((p) => {
    // Mirrors set_member_status() and set_member_name(): only admins change an admin's status or name.
    const editable = me.access.isAdmin || !adminRoleIds.has(p.role_id ?? "");
    return {
      id: p.id,
      name: p.full_name,
      email: p.email,
      avatarUrl: p.avatar_url,
      status: p.status,
      joinedLabel: t("joined", { date: format.dateTime(new Date(p.created_at), { dateStyle: "medium" }) }),
      roleId: p.role_id,
      roleLabel: roleLabel(p.role_id),
      applied: p.status === "pending" ? (flags.get(p.id) ?? false) : null,
      canChangeStatus: editable,
      canRename: editable,
      search: foldSearch(`${p.full_name} ${p.email ?? ""}`),
    };
  });

  return (
    <MembersList
      rows={rows}
      roles={roleOptions}
      meId={me.id}
      canAssignRole={me.access.isAdmin}
      overCeiling={overCeiling}
    />
  );
}
