"use client";

import { Ban } from "lucide-react";
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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { cancelEvent, type EventActionResult } from "@/lib/events/actions";

/** Same cap as `events.cancel_reason` and `cancelEvent`. */
const REASON_MAX = 200;

type Failure = Exclude<EventActionResult["status"], "ok">;

/**
 * "Etkinliği iptal et" with an optional reason. The dialog stays open while the request runs; on success the page
 * re-renders as cancelled (the action refreshes it), which unmounts this button.
 */
export function CancelEventDialog({ eventId }: { eventId: string }) {
  const t = useTranslations("Events");
  const reasonId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [failure, setFailure] = useState<Failure | null>(null);
  const [isPending, startTransition] = useTransition();

  function confirm() {
    setFailure(null);
    startTransition(async () => {
      const { status } = await cancelEvent(eventId, reason).catch((): EventActionResult => ({ status: "error" }));
      if (status === "ok") setOpen(false);
      else setFailure(status);
    });
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setFailure(null);
          setOpen(true);
        }}
      >
        <Ban data-icon="inline-start" aria-hidden />
        {t("detail.cancel")}
      </Button>
      <AlertDialog open={open} onOpenChange={(next) => !isPending && setOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("cancelDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("cancelDialog.body")}</AlertDialogDescription>
          </AlertDialogHeader>
          <Field>
            <FieldLabel htmlFor={reasonId}>{t("cancelDialog.reason")}</FieldLabel>
            <Textarea
              id={reasonId}
              aria-describedby={`${reasonId}-hint`}
              value={reason}
              maxLength={REASON_MAX}
              disabled={isPending}
              onChange={(event) => {
                setReason(event.target.value);
                setFailure(null);
              }}
            />
            <FieldDescription id={`${reasonId}-hint`} className="flex justify-between gap-3">
              <span>{t("cancelDialog.reasonHint")}</span>
              <span className="shrink-0 tabular-nums">
                {t("cancelDialog.count", { count: reason.length, max: REASON_MAX })}
              </span>
            </FieldDescription>
          </Field>
          {failure && (
            <p role="alert" className="text-sm text-destructive">
              {failure === "invalid" ? t("cancelDialog.invalid") : t(`errors.${failure}`)}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>{t("cancelDialog.dismiss")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={isPending} onClick={confirm}>
              {t("cancelDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
