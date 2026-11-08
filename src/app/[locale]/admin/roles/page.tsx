import { Check } from "lucide-react";
import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { CreateRoleForm, RoleEditor } from "@/components/admin/role-editor";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listRoles } from "@/lib/access/queries";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requireAdmin } from "@/lib/auth/require-access";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Admin.roles");
  return { title: t("title"), robots: { index: false } };
}

export default function RolesPage() {
  const t = useTranslations("Admin.roles");

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-2">
        <h1 className="heading text-3xl">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("intro")}</p>
      </div>
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <Roles />
      </Suspense>
    </section>
  );
}

async function Roles() {
  await requireAdmin("/admin/roles");
  const [roles, t, tAccount] = await Promise.all([listRoles(), getTranslations("Admin"), getTranslations("Account")]);

  return (
    <>
      {roles
        .filter((r) => r.isAdmin)
        .map((r) => (
          <Card key={r.id}>
            <CardHeader>
              <CardTitle>{tAccount("roles.admin")}</CardTitle>
              <CardDescription>
                {t("roles.adminDescription")} {t("roles.holders", { count: r.holders })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-1.5 text-sm">
                {PERMISSIONS.map((p) => (
                  <li key={p} className="flex items-center gap-2">
                    <Check className="size-4 text-muted-foreground" aria-hidden />
                    {t(`permissions.${p}.label`)}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}

      {roles
        .filter((r) => !r.isAdmin)
        .map((r) => (
          <RoleEditor key={r.id} role={r} />
        ))}

      <CreateRoleForm />
    </>
  );
}
