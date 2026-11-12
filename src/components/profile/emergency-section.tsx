"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { formatPhoneNumberIntl } from "react-phone-number-input";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { deleteEmergencyContact } from "@/lib/members/actions";
import type { BloodType } from "@/lib/members/blood-type";
import type { EmergencyContact } from "@/lib/members/queries";
import { BloodTypeForm } from "./blood-type-form";
import { EmergencyContactDialog } from "./emergency-contact-dialog";
import { ActionStatus, useProfileAction } from "./use-profile-action";

export const MAX_CONTACTS = 2;

type Props = {
  contacts: EmergencyContact[];
  bloodType: BloodType | null;
  bloodConsent: boolean;
  /** Inactive members: contacts can only be deleted, the blood-type consent only withdrawn. */
  withdrawOnly: boolean;
};

/** Emergency contacts (max 2) and the blood type with its own consent. */
export function EmergencySection({ contacts, bloodType, bloodConsent, withdrawOnly }: Props) {
  const t = useTranslations("Profile.emergency");
  const tp = useTranslations("Profile");
  const { isPending, result, setResult, run } = useProfileAction();
  // `target` outlives the dialog so its text doesn't blank while it animates closed.
  const [target, setTarget] = useState<EmergencyContact | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const full = contacts.length >= MAX_CONTACTS;
  const mainPosition = Math.min(...contacts.map((c) => c.position));
  const hasBlood = bloodConsent && bloodType !== null;

  // Inactive and nothing stored: nothing to withdraw or delete.
  if (withdrawOnly && contacts.length === 0 && !hasBlood) return null;

  return (
    <Card id="emergency" className="scroll-mt-20" data-skeleton-result="profile-emergency">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noContacts")}</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {contacts.map((contact) => (
              <li key={contact.id} className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                <div className="min-w-0 text-sm">
                  <p className="font-medium">
                    {contact.name}
                    {contact.position === mainPosition && contacts.length > 1 && (
                      <span className="ml-2 font-normal text-muted-foreground">({t("mainContact")})</span>
                    )}
                  </p>
                  <p className="text-muted-foreground">
                    {t(`relationships.${contact.relationship}`)} · {formatPhoneNumberIntl(contact.phone) || contact.phone}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {!withdrawOnly && (
                    <EmergencyContactDialog
                      contact={contact}
                      trigger={
                        <Button type="button" variant="outline" size="icon" aria-label={t("editLabel", { name: contact.name })}>
                          <Pencil aria-hidden />
                        </Button>
                      }
                    />
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={t("deleteLabel", { name: contact.name })}
                    onClick={() => {
                      setResult(null);
                      setTarget(contact);
                      setConfirmOpen(true);
                    }}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {!withdrawOnly && (
          <div className="flex flex-col items-start gap-2">
            <EmergencyContactDialog
              trigger={
                <Button type="button" variant="outline" disabled={full} aria-describedby={full ? "profile-contact-limit" : undefined}>
                  <Plus aria-hidden /> {t("add")}
                </Button>
              }
            />
            {full && (
              <p id="profile-contact-limit" className="text-sm text-muted-foreground">
                {t("limitReached")}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {t("hintVisibility")} {t("hintNotify")}
            </p>
            <ActionStatus result={confirmOpen ? null : result} showSaved={false} />
          </div>
        )}

        {(!withdrawOnly || hasBlood) && <Separator />}
        <BloodTypeForm bloodType={bloodType} consent={bloodConsent} withdrawOnly={withdrawOnly} />
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteConfirm", { name: target?.name ?? "" })}</AlertDialogDescription>
          </AlertDialogHeader>
          <ActionStatus result={result} showSaved={false} />
          <AlertDialogFooter>
            <AlertDialogCancel>{tp("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isPending}
              onClick={() => target && run(() => deleteEmergencyContact(target.id), () => setConfirmOpen(false))}
            >
              {tp("confirmDelete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
