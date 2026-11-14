"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signOut } from "@/lib/auth/actions";
import { type RequestDeletionResult, requestAccountDeletion } from "@/lib/account/deletion-actions";

type Outcome = RequestDeletionResult | null;

/** Bottom of /account: delete the account (confirmation dialog, then a done state; the user is signed out by then). */
export function DeleteAccountCard({ inactive }: { inactive: boolean }) {
  const t = useTranslations("Account.delete");
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [isPending, startTransition] = useTransition();

  const done = outcome?.status === "ok" ? outcome : null;

  function confirm() {
    setOutcome(null);
    startTransition(async () => {
      setOutcome(await requestAccountDeletion().catch((): Outcome => ({ status: "error" })));
    });
  }

  return (
    <Card data-skeleton-result="account-delete">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("body")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          variant="destructive"
          onClick={() => {
            setOutcome(null);
            setOpen(true);
          }}
        >
          {t("open")}
        </Button>
      </CardContent>

      {/* While the request runs or after it succeeded the dialog can't be dismissed: the session is gone. */}
      <AlertDialog open={open} onOpenChange={(next) => !isPending && !done && setOpen(next)}>
        <AlertDialogContent>
          {done ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("doneTitle")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("doneBody", { date: format.dateTime(new Date(done.deletesOn), { dateStyle: "long" }) })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                {/* Clears the (already revoked) cookies, then goes home. */}
                <form action={signOut}>
                  <Button type="submit" className="w-full sm:w-auto">
                    {t("home")}
                  </Button>
                </form>
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("dialogTitle")}</AlertDialogTitle>
                <AlertDialogDescription render={<div />} className="flex flex-col gap-2 text-left">
                  <p>{t("removed")}</p>
                  <p>{t("kept")}</p>
                  {inactive && <p>{t("keptInactive")}</p>}
                  <p>{t("grace")}</p>
                  <p>{t("club")}</p>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <p aria-live="polite" className="text-sm text-destructive">
                {outcome?.status === "lastAdmin" ? t("lastAdmin") : outcome?.status === "error" ? t("error") : null}
              </p>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isPending}>{t("cancel")}</AlertDialogCancel>
                <AlertDialogAction variant="destructive" disabled={isPending} onClick={confirm}>
                  {t("confirm")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
