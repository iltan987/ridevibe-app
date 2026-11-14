"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cancelAccountDeletion } from "@/lib/account/deletion-actions";
import { signOut } from "@/lib/auth/actions";

/** Shown instead of the whole account page while the account is being deleted. */
export function RecoveryCard({ deletesOn }: { deletesOn: string }) {
  const t = useTranslations("Account");
  const format = useFormatter();
  const [failed, setFailed] = useState(false);
  const [isPending, startTransition] = useTransition();

  function restore() {
    setFailed(false);
    startTransition(async () => {
      const result = await cancelAccountDeletion().catch(() => ({ status: "error" as const }));
      if (result.status !== "ok") setFailed(true);
    });
  }

  return (
    <Card className="border-sun/40 bg-sun/10">
      <CardHeader className="items-start gap-3">
        <CardTitle>{t("recovery.title")}</CardTitle>
        <CardDescription>
          {t("recovery.body", { date: format.dateTime(new Date(deletesOn), { dateStyle: "long" }) })}
        </CardDescription>
        <p aria-live="polite" className="text-sm text-destructive">
          {failed ? t("recovery.error") : null}
        </p>
      </CardHeader>
      <CardFooter className="flex flex-col items-stretch gap-2 sm:flex-row">
        <Button onClick={restore} disabled={isPending}>
          {t("recovery.restore")}
        </Button>
        <form action={signOut}>
          <Button type="submit" variant="outline" className="w-full" disabled={isPending}>
            {t("recovery.continue")}
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}
