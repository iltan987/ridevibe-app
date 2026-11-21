"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
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
import { useRouter } from "@/i18n/navigation";
import { deleteEvent, type DeleteEventResult } from "@/lib/events/actions";

type Failure = Exclude<DeleteEventResult["status"], "ok">;

/**
 * "Etkinliği sil": confirmed in a dialog that stays open while the request runs; afterwards the list replaces the page.
 * `blocked`: people have joined, so the button is disabled with this hint (the database refuses anyway: `hasSignups`).
 */
export function DeleteEventDialog({ eventId, blocked = null }: { eventId: string; blocked?: string | null }) {
  const t = useTranslations("Events");
  const hintId = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [isPending, startTransition] = useTransition();

  function confirm() {
    setFailure(null);
    startTransition(async () => {
      const { status } = await deleteEvent(eventId).catch((): DeleteEventResult => ({ status: "error" }));
      if (status === "ok") router.replace("/events");
      else setFailure(status);
    });
  }

  return (
    <>
      <Button
        variant="destructive"
        disabled={blocked !== null}
        aria-describedby={blocked === null ? undefined : hintId}
        onClick={() => {
          setFailure(null);
          setOpen(true);
        }}
      >
        <Trash2 data-icon="inline-start" aria-hidden />
        {t("detail.delete")}
      </Button>
      {blocked !== null && (
        <p id={hintId} className="w-full text-sm text-muted-foreground">
          {blocked}
        </p>
      )}
      <AlertDialog open={open} onOpenChange={(next) => !isPending && setOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteDialog.body")}</AlertDialogDescription>
          </AlertDialogHeader>
          {failure && (
            <p role="alert" className="text-sm text-destructive">
              {t(`errors.${failure}`)}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>{t("deleteDialog.dismiss")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={isPending} onClick={confirm}>
              {t("deleteDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
