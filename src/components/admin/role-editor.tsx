"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { type AccessActionResult, createRole, deleteRole, updateRole } from "@/lib/access/actions";
import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";

type Status = AccessActionResult["status"] | null;

function useAction() {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<Status>(null);
  const run = (action: () => Promise<AccessActionResult>, onOk?: () => void) => {
    setStatus(null);
    startTransition(async () => {
      const result = await action();
      setStatus(result.status);
      if (result.status === "ok") onOk?.();
    });
  };
  return { isPending, status, run };
}

function ActionMessage({ status }: { status: Status }) {
  const t = useTranslations("Admin");
  if (!status) return null;
  if (status === "ok") return <p className="text-sm text-muted-foreground">{t("roles.saved")}</p>;
  return (
    <p role="alert" className="text-sm text-destructive">
      {t(`accessErrors.${status}`)}
    </p>
  );
}

export function RoleEditor({
  role,
}: {
  role: { id: string; name: string; permissions: Permission[]; holders: number };
}) {
  const t = useTranslations("Admin");
  const { isPending, status, run } = useAction();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "");
    const permissions = formData.getAll("permissions").map(String);
    run(() => updateRole(role.id, name, permissions));
  }

  const nameId = `role-${role.id}-name`;

  return (
    <Card>
      <form onSubmit={onSubmit} aria-busy={isPending}>
        <CardHeader>
          <Field>
            <FieldLabel htmlFor={nameId}>{t("roles.name")}</FieldLabel>
            <Input id={nameId} name="name" defaultValue={role.name} required maxLength={60} />
            <FieldDescription>{t("roles.holders", { count: role.holders })}</FieldDescription>
          </Field>
        </CardHeader>
        <CardContent className="pt-4">
          <FieldSet>
            <FieldLegend variant="label">{t("roles.permissions")}</FieldLegend>
            <FieldGroup className="gap-3">
              {PERMISSIONS.map((permission) => {
                const id = `role-${role.id}-${permission}`;
                return (
                  <Field key={permission} orientation="horizontal">
                    <Checkbox
                      id={id}
                      name="permissions"
                      value={permission}
                      defaultChecked={role.permissions.includes(permission)}
                      className="mt-0.5 self-start"
                    />
                    <FieldContent>
                      <FieldLabel htmlFor={id} className="font-normal leading-snug">
                        {t(`permissions.${permission}.label`)}
                      </FieldLabel>
                      <FieldDescription>{t(`permissions.${permission}.description`)}</FieldDescription>
                    </FieldContent>
                  </Field>
                );
              })}
            </FieldGroup>
          </FieldSet>
        </CardContent>
        <CardFooter className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={isPending}>
            {t("roles.save")}
          </Button>
          <Button type="button" variant="ghost" className="text-destructive" disabled={isPending} onClick={() => setConfirmOpen(true)}>
            {t("roles.delete")}
          </Button>
          <ActionMessage status={status} />
        </CardFooter>
      </form>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("roles.delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("roles.deleteConfirm", { name: role.name, count: role.holders })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("roles.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isPending}
              onClick={() => run(() => deleteRole(role.id), () => setConfirmOpen(false))}
            >
              {t("roles.confirmDelete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export function CreateRoleForm() {
  const t = useTranslations("Admin");
  const { isPending, status, run } = useAction();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name") ?? "");
    run(() => createRole(name), () => form.reset());
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2" aria-busy={isPending}>
      <FieldLabel htmlFor="new-role-name">{t("roles.newRole")}</FieldLabel>
      <div className="flex gap-2">
        <Input id="new-role-name" name="name" required maxLength={60} placeholder={t("roles.namePlaceholder")} />
        <Button type="submit" disabled={isPending}>
          {t("roles.create")}
        </Button>
      </div>
      {status !== "ok" && <ActionMessage status={status} />}
    </form>
  );
}
