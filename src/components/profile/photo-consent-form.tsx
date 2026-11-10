"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Link } from "@/i18n/navigation";
import { updatePhotoConsent } from "@/lib/members/actions";
import { ActionStatus, useProfileAction } from "./use-profile-action";

/** Photo consent: always available (also to inactive members) so it can be withdrawn at any time. */
export function PhotoConsentForm({ consent, consentAt }: { consent: boolean; consentAt: string | null }) {
  const t = useTranslations("Profile");
  const format = useFormatter();
  const { isPending, result, run } = useProfileAction();
  const [checked, setChecked] = useState(consent);

  const date = consentAt
    ? format.dateTime(new Date(consentAt), { dateStyle: "long", timeZone: "Europe/Istanbul" })
    : null;

  return (
    <Card data-skeleton-result="profile-consent">
      <CardHeader>
        <CardTitle>{t("photoConsent")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            run(() => updatePhotoConsent(checked));
          }}
          aria-busy={isPending}
          className="flex flex-col gap-4"
        >
          <label className="flex min-h-10 cursor-pointer items-center justify-between gap-4 text-sm">
            {t("photoConsentLabel")}
            <Switch checked={checked} onCheckedChange={setChecked} />
          </label>
          <p className="text-sm text-muted-foreground">
            <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">
              {t("privacyLink")}
            </Link>
            {date && <> · {consent ? t("consentGiven", { date }) : t("consentWithdrawn", { date })}</>}
          </p>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isPending}>
              {t("save")}
            </Button>
            <ActionStatus result={result} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
