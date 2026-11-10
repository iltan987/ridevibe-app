"use client";

import { useTranslations } from "next-intl";
import { type ReactElement, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { addMotorcycle, updateMotorcycle } from "@/lib/members/actions";
import { ActionStatus, useProfileAction } from "./use-profile-action";

type Props = {
  /** The button that opens the dialog. */
  trigger: ReactElement;
  /** Set to edit an existing motorcycle; omitted = add a new one. */
  motorcycle?: { id: string; brand: string; model: string; cc: number | null };
};

/** Add or edit one motorcycle. Closes on success (the page refreshes with the new list). */
export function MotorcycleDialog({ trigger, motorcycle }: Props) {
  const t = useTranslations("Profile");
  const [open, setOpen] = useState(false);
  const { isPending, result, setResult, run, fieldError } = useProfileAction();
  const formId = motorcycle ? `motorcycle-${motorcycle.id}` : "motorcycle-new";

  function onOpenChange(next: boolean) {
    setOpen(next);
    setResult(null);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const input = {
      brand: String(data.get("brand") ?? ""),
      model: String(data.get("model") ?? ""),
      cc: String(data.get("cc") ?? ""),
    };
    run(
      () => (motorcycle ? updateMotorcycle(motorcycle.id, input) : addMotorcycle(input)),
      () => setOpen(false),
    );
  }

  const fields = [
    { name: "brand", label: t("brand"), value: motorcycle?.brand ?? "", props: { maxLength: 60, autoComplete: "off" } },
    { name: "model", label: t("model"), value: motorcycle?.model ?? "", props: { maxLength: 60, autoComplete: "off" } },
    {
      name: "cc",
      label: `${t("cc")} (${t("optional")})`,
      value: motorcycle?.cc?.toString() ?? "",
      props: { inputMode: "numeric" as const, autoComplete: "off" },
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <form noValidate onSubmit={onSubmit} aria-busy={isPending} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{motorcycle ? t("editMotorcycle") : t("addMotorcycle")}</DialogTitle>
          </DialogHeader>
          {fields.map(({ name, label, value, props }) => {
            const error = fieldError(name);
            return (
              <Field key={name} data-invalid={!!error}>
                <FieldLabel htmlFor={`${formId}-${name}`}>{label}</FieldLabel>
                <Input
                  id={`${formId}-${name}`}
                  name={name}
                  defaultValue={value}
                  aria-invalid={!!error}
                  className="h-10 md:h-9"
                  {...props}
                />
                <FieldError>{error}</FieldError>
              </Field>
            );
          })}
          <ActionStatus result={result} showSaved={false} />
          <DialogFooter>
            <Button type="button" variant="outline" disabled={isPending} onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={isPending}>
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
