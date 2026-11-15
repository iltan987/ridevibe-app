"use client";

import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { setMemberName } from "@/lib/access/actions";

const MIN_LENGTH = 2;
const MAX_LENGTH = 120;

/** Staff fix a member's display name (e.g. a Google account name that doesn't match the person). */
export function MemberNameDialog({ memberId, currentName }: { memberId: string; currentName: string }) {
  const t = useTranslations("Admin");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const [failure, setFailure] = useState<"tooShort" | "forbidden" | "invalid" | "duplicate" | "error" | null>(null);
  const [isSaving, startSaving] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    setName(currentName);
    setFailure(null);
  }

  function onSubmit(event: React.SubmitEvent) {
    event.preventDefault();
    if (name.trim().length < MIN_LENGTH) {
      setFailure("tooShort");
      return;
    }
    setFailure(null);
    startSaving(async () => {
      const result = await setMemberName(memberId, name).catch(() => ({ status: "error" as const }));
      if (result.status === "ok") onOpenChange(false);
      else setFailure(result.status);
    });
  }

  const inputId = `member-name-${memberId}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Pencil aria-hidden /> {t("members.editName")}
      </DialogTrigger>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t("members.nameDialog.title")}</DialogTitle>
            <DialogDescription>{t("members.nameDialog.description")}</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor={inputId}>{t("members.nameDialog.label")}</FieldLabel>
            <Input
              id={inputId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={MAX_LENGTH}
              autoComplete="off"
            />
          </Field>
          {failure && (
            <p role="alert" className="text-sm text-destructive">
              {failure === "tooShort" ? t("members.nameDialog.tooShort") : t(`accessErrors.${failure}`)}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={isSaving} onClick={() => onOpenChange(false)}>
              {t("members.nameDialog.cancel")}
            </Button>
            <Button type="submit" disabled={isSaving}>
              {t("members.nameDialog.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
