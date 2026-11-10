import { Check } from "lucide-react";
import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { CreateRoleForm, RoleEditor } from "@/components/admin/role-editor";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
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
      <Suspense fallback={<RolesSkeleton />}>
        <Roles />
      </Suspense>
    </section>
  );
}

/** The admin role card (title, description, permission list) followed by role editor cards. */
function RolesSkeleton() {
  return (
    <div data-skeleton="roles" className="flex flex-col gap-6">
      <Card data-skeleton="roles-admin">
        <CardHeader>
          <div className="flex h-5.5 items-center">
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="flex flex-col">
            {[0, 1, 2].map((i) => (
              <div key={i} className={`flex h-5 items-center ${i === 2 ? "sm:hidden" : ""}`}>
                <Skeleton className={`h-3.5 ${i === 1 ? "w-4/5" : "w-full"}`} />
              </div>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-1.5">
            {Array.from({ length: 5 }, (_, i) => (
              <li key={i} className="flex h-5 items-center gap-2">
                <Skeleton className="size-4" />
                <Skeleton className="h-3.5 w-48 max-w-full" />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      {[0, 1].map((i) => (
        <RoleEditorSkeleton key={i} />
      ))}
    </div>
  );
}

/** Mirrors `RoleEditor`: name field, five permission checkboxes with label + description, footer buttons. */
function RoleEditorSkeleton() {
  return (
    <Card data-skeleton="roles-editor">
      {/* One child, like the real card (its form): no card gap between header, content and footer. */}
      <div>
        <CardHeader>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4.75 w-16" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-5.25 w-40" />
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-5 w-12" />
            <div className="flex flex-col gap-3">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="flex gap-2">
                  <Skeleton className="mt-0.5 size-4 shrink-0" />
                  <div className="flex flex-1 flex-col gap-0.5">
                    <Skeleton className="h-4.75 w-40" />
                    {/* Descriptions wrap to two lines on phones, except the third one. */}
                    <Skeleton className={i === 2 ? "h-5.25 w-full" : "h-10.5 w-full sm:h-5.25"} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
        <CardFooter className="mt-4 flex gap-3">
          <Skeleton className="h-8 w-17" />
          <Skeleton className="h-8 w-17" />
        </CardFooter>
      </div>
    </Card>
  );
}

async function Roles() {
  await requireAdmin("/admin/roles");
  const [roles, t, tAccount] = await Promise.all([listRoles(), getTranslations("Admin"), getTranslations("Account")]);

  return (
    <div data-skeleton-result="roles" className="flex flex-col gap-6">
      {roles
        .filter((r) => r.isAdmin)
        .map((r) => (
          <Card key={r.id} data-skeleton-result="roles-admin">
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
    </div>
  );
}
