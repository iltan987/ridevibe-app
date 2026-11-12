"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Link } from "@/i18n/navigation";
import { setBloodType, withdrawBloodTypeConsent } from "@/lib/members/actions";
import { BLOOD_TYPES, type BloodType, bloodTypeLabel } from "@/lib/members/blood-type";
import { ActionStatus, useProfileAction } from "./use-profile-action";

type Props = {
  bloodType: BloodType | null;
  consent: boolean;
  /** Inactive members: only withdrawing the consent is possible. */
  withdrawOnly: boolean;
};

/**
 * Blood type with its own explicit consent (special-category data). Without consent: explanation, an unticked
 * checkbox and the select; with consent: the stored type, change and withdraw.
 */
export function BloodTypeForm({ bloodType, consent, withdrawOnly }: Props) {
  const t = useTranslations("Profile.bloodType");
  const tp = useTranslations("Profile");
  const { isPending, result, setResult, run, fieldError } = useProfileAction();
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<BloodType | "">("");
  const [ticked, setTicked] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const consented = consent && bloodType !== null;
  const typeError = fieldError("blood_type");
  const consentError = fieldError("consent");

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    // Changing an already consented type: the consent stands, the server records it again with this save.
    // The checkbox is never pre-ticked for a first consent.
    if (!selected || !(consented || ticked)) return;
    run(
      () => setBloodType({ blood_type: selected, consent: true }),
      () => {
        setEditing(false);
        setTicked(false);
        setSelected("");
      },
    );
  }

  const withdraw = (
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("withdrawTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("withdrawConfirm")}</AlertDialogDescription>
        </AlertDialogHeader>
        <ActionStatus result={result} showSaved={false} />
        <AlertDialogFooter>
          <AlertDialogCancel>{tp("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isPending}
            onClick={() =>
              run(withdrawBloodTypeConsent, () => {
                setConfirmOpen(false);
                setSelected("");
                setTicked(false);
                setEditing(false);
              })
            }
          >
            {t("withdraw")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  function askWithdraw() {
    setResult(null);
    setConfirmOpen(true);
  }

  if (consented && !editing) {
    return (
      <div className="flex flex-col gap-3">
        <h3 className="font-medium">{t("title")}</h3>
        <p className="text-sm">{t("current", { type: bloodTypeLabel(bloodType) })}</p>
        <div className="flex flex-wrap items-center gap-2">
          {!withdrawOnly && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setResult(null);
                setSelected(bloodType);
                setEditing(true);
              }}
            >
              {t("change")}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={askWithdraw}>
            {t("withdraw")}
          </Button>
        </div>
        <ActionStatus result={confirmOpen ? null : result} showSaved={false} />
        {withdraw}
      </div>
    );
  }

  if (withdrawOnly) return null;

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={isPending} className="flex flex-col gap-4">
      <h3 className="font-medium">{t("title")}</h3>
      {!consented && <p className="text-sm text-muted-foreground">{t("intro")}</p>}
      <Field data-invalid={!!typeError}>
        <FieldLabel htmlFor="profile-blood-type">{t("select")}</FieldLabel>
        <NativeSelect
          id="profile-blood-type"
          value={selected}
          onChange={(event) => setSelected(event.target.value as BloodType | "")}
          aria-invalid={!!typeError}
        >
          <NativeSelectOption value="">{t("placeholder")}</NativeSelectOption>
          {BLOOD_TYPES.map((type) => (
            <NativeSelectOption key={type} value={type}>
              {bloodTypeLabel(type)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <FieldError>{typeError}</FieldError>
      </Field>
      {!consented && (
        <div className="flex flex-col gap-2">
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <Checkbox checked={ticked} onCheckedChange={setTicked} aria-invalid={!!consentError} className="mt-0.5" />
            {t("consentLabel")}
          </label>
          <FieldError>{consentError}</FieldError>
          <Link href="/privacy" className="text-sm underline underline-offset-4 hover:text-foreground">
            {tp("privacyLink")}
          </Link>
        </div>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending || !selected || (!consented && !ticked)}>
          {tp("save")}
        </Button>
        {consented && (
          <Button type="button" variant="outline" disabled={isPending} onClick={() => setEditing(false)}>
            {tp("cancel")}
          </Button>
        )}
        <ActionStatus result={result} />
      </div>
    </form>
  );
}
