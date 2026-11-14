"use client";

import { useTranslations } from "next-intl";
import { type ReactElement, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { formDataText } from "@/lib/form-data";
import { addMotorcycle, updateMotorcycle } from "@/lib/members/actions";
import { normalizePlate } from "@/lib/members/plate";
import { ActionStatus, useProfileAction } from "./use-profile-action";

type Props = {
  /** The button that opens the dialog. */
  trigger: ReactElement;
  /** Set to edit an existing motorcycle; omitted = add a new one. */
  motorcycle?: {
    id: string;
    brand: string;
    model: string;
    cc: number | null;
    plate?: string | null;
    plateForeign: boolean;
  };
};

/** Add or edit one motorcycle. Closes on success (the page refreshes with the new list). */
export function MotorcycleDialog({ trigger, motorcycle }: Props) {
  const t = useTranslations("Profile");
  const [open, setOpen] = useState(false);
  const { isPending, result, setResult, run, fieldError } = useProfileAction();
  const formId = motorcycle ? `motorcycle-${motorcycle.id}` : "motorcycle-new";
  const [plate, setPlate] = useState(motorcycle?.plate ?? "");
  const [foreign, setForeign] = useState(motorcycle?.plateForeign ?? false);
  const plateError = fieldError("plate");

  function onOpenChange(next: boolean) {
    setOpen(next);
    setResult(null);
    if (next) {
      // Start from the stored values again (an abandoned edit must not linger).
      setPlate(motorcycle?.plate ?? "");
      setForeign(motorcycle?.plateForeign ?? false);
    }
  }

  /** Tidy a valid plate ("34abc123" → "34 ABC 123"); leave an invalid one as typed so it can be fixed. */
  function tidyPlate(value: string, isForeign: boolean) {
    const tidy = normalizePlate(value, isForeign);
    if (tidy === "invalid") return value;
    return tidy ?? "";
  }

  function onSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const input = {
      brand: formDataText(data, "brand"),
      model: formDataText(data, "model"),
      cc: formDataText(data, "cc"),
      plate,
      plate_foreign: foreign,
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
          <Field data-invalid={!!plateError}>
            <FieldLabel htmlFor={`${formId}-plate`}>{`${t("plate")} (${t("optional")})`}</FieldLabel>
            <Input
              id={`${formId}-plate`}
              value={plate}
              onChange={(event) => setPlate(event.target.value)}
              onBlur={() => setPlate(tidyPlate(plate, foreign))}
              placeholder={t("platePlaceholder")}
              maxLength={20}
              autoComplete="off"
              autoCapitalize="characters"
              aria-invalid={!!plateError}
              className="h-10 md:h-9"
            />
            <FieldError>{plateError}</FieldError>
          </Field>
          <label className="flex min-h-10 cursor-pointer items-center gap-3 text-sm">
            <Checkbox
              checked={foreign}
              onCheckedChange={(checked) => {
                setForeign(checked);
                setPlate(tidyPlate(plate, checked));
              }}
            />
            {t("plateForeign")}
          </label>
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
