"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { type AccessActionResult, setMemberRole, setMemberStatus } from "@/lib/access/actions";
import type { MemberStatus } from "@/lib/access/members-view";
import { MemberNameDialog } from "@/components/admin/member-name-dialog";
import { initials } from "@/lib/initials";

export type MemberRowData = {
  id: string;
  name: string;
  /** Sign-in email (helps recognise who a pending sign-up is). */
  email: string | null;
  avatarUrl: string | null;
  status: MemberStatus;
  joinedLabel: string;
  roleId: string | null;
  roleLabel: string;
  /** Pending tab only: has an open application. null/undefined = not shown. */
  applied?: boolean | null;
};

const NEXT_STATUS = {
  pending: { status: "active", label: "activate" },
  active: { status: "inactive", label: "deactivate" },
  inactive: { status: "active", label: "reactivate" },
} as const;

export function MemberRow({
  member,
  roles,
  isSelf,
  canAssignRole,
  canChangeStatus,
  canRename,
}: {
  member: MemberRowData;
  roles: { id: string; label: string }[];
  isSelf: boolean;
  canAssignRole: boolean;
  canChangeStatus: boolean;
  canRename: boolean;
}) {
  const t = useTranslations("Admin");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<Exclude<AccessActionResult["status"], "ok"> | null>(null);

  function run(action: () => Promise<AccessActionResult>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.status !== "ok") setError(result.status);
    });
  }

  const next = NEXT_STATUS[member.status];

  return (
    <li data-skeleton-result="admin-row" className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:flex-wrap sm:items-center" aria-busy={isPending}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar className="size-10">
          {member.avatarUrl && <AvatarImage src={member.avatarUrl} alt="" referrerPolicy="no-referrer" />}
          <AvatarFallback>{initials(member.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate font-medium">
            {member.name || "—"}
            {isSelf && <Badge variant="secondary">{t("members.you")}</Badge>}
          </p>
          <p className="truncate text-xs text-muted-foreground">{member.email ?? t("members.noEmail")}</p>
          <p className="text-xs text-muted-foreground">{member.joinedLabel}</p>
          {member.applied != null && (
            <Badge variant={member.applied ? "status" : "outline"} className="mt-1">
              {t(member.applied ? "members.applied" : "members.notApplied")}
            </Badge>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Roles only matter for active members: activate first, then assign. */}
        {canAssignRole && !isSelf && member.status === "active" ? (
          <NativeSelect
            key={member.roleId ?? "none"}
            aria-label={t("members.role")}
            defaultValue={member.roleId ?? ""}
            disabled={isPending}
            onChange={(e) => {
              const roleId = e.target.value || null;
              run(() => setMemberRole(member.id, roleId));
            }}
            className="min-w-40"
          >
            <NativeSelectOption value="">{t("members.noRole")}</NativeSelectOption>
            {roles.map((r) => (
              <NativeSelectOption key={r.id} value={r.id}>
                {r.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        ) : (
          member.roleId && <Badge variant="outline">{member.roleLabel}</Badge>
        )}

        {canRename && <MemberNameDialog memberId={member.id} currentName={member.name} />}

        {canChangeStatus && !isSelf && (
          <Button
            size="sm"
            variant={next.status === "active" ? "default" : "outline"}
            disabled={isPending}
            onClick={() => run(() => setMemberStatus(member.id, next.status))}
          >
            {t(`members.${next.label}`)}
          </Button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive sm:basis-full">
          {t(`accessErrors.${error}`)}
        </p>
      )}
    </li>
  );
}
