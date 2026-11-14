"use client";

import { useTranslations } from "next-intl";
import { type ReactElement, useState } from "react";
import { PhoneField } from "@/components/apply/phone-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Constants } from "@/lib/supabase/database.types";
import { addEmergencyContact, updateEmergencyContact } from "@/lib/members/actions";
import type { EmergencyContact } from "@/lib/members/queries";
import { ActionStatus, useProfileAction } from "./use-profile-action";

type Props = {
  /** The button that opens the dialog. */
  trigger: ReactElement;
  /** Set to edit an existing contact; omitted = add a new one. */
  contact?: EmergencyContact;
};

/** Add or edit one emergency contact. Closes on success (the page refreshes with the new list). */
export function EmergencyContactDialog({ trigger, contact }: Props) {
  const t = useTranslations("Profile.emergency");
  const tp = useTranslations("Profile");
  const [open, setOpen] = useState(false);
  const { isPending, result, setResult, run, fieldError } = useProfileAction();
  const formId = contact ? `contact-${contact.id}` : "contact-new";

  function onOpenChange(next: boolean) {
    setOpen(next);
    setResult(null);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const input = {
      name: String(data.get("name") ?? ""),
      relationship: String(data.get("relationship") ?? "") as EmergencyContact["relationship"],
      phone: String(data.get("phone") ?? ""),
    };
    run(
      () => (contact ? updateEmergencyContact(contact.id, input) : addEmergencyContact(input)),
      () => setOpen(false),
    );
  }

  const nameError = fieldError("name");
  const relationshipError = fieldError("relationship");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <form noValidate onSubmit={onSubmit} aria-busy={isPending} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{contact ? t("editTitle") : t("addTitle")}</DialogTitle>
          </DialogHeader>
          <Field data-invalid={!!nameError}>
            <FieldLabel htmlFor={`${formId}-name`}>{t("name")}</FieldLabel>
            <Input
              id={`${formId}-name`}
              name="name"
              defaultValue={contact?.name ?? ""}
              maxLength={80}
              autoComplete="off"
              aria-invalid={!!nameError}
              className="h-10 md:h-9"
            />
            <FieldError>{nameError}</FieldError>
          </Field>
          <Field data-invalid={!!relationshipError}>
            <FieldLabel htmlFor={`${formId}-relationship`}>{t("relationship")}</FieldLabel>
            <NativeSelect
              id={`${formId}-relationship`}
              name="relationship"
              defaultValue={contact?.relationship ?? ""}
              aria-invalid={!!relationshipError}
            >
              <NativeSelectOption value="">{t("relationshipPlaceholder")}</NativeSelectOption>
              {Constants.public.Enums.emergency_relationship.map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {t(`relationships.${value}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <FieldError>{relationshipError}</FieldError>
          </Field>
          <PhoneField name="phone" label={t("phone")} defaultValue={contact?.phone} error={fieldError("phone")} />
          <ActionStatus result={result} showSaved={false} />
          <DialogFooter>
            <Button type="button" variant="outline" disabled={isPending} onClick={() => onOpenChange(false)}>
              {tp("cancel")}
            </Button>
            <Button type="submit" disabled={isPending}>
              {tp("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
