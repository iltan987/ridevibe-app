"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { updateVisibility } from "@/lib/members/actions";
import { ActionStatus, useProfileAction } from "./use-profile-action";

type Props = {
  instagram: string | null;
  showInstagram: boolean;
  showBirthday: boolean;
  /** `YYYY-MM-DD` or null (manually activated members have none). */
  birthDate: string | null;
};

/** Instagram handle plus what the member list may show. The birth date itself is read-only. */
export function VisibilityForm({ instagram, showInstagram, showBirthday, birthDate }: Props) {
  const t = useTranslations("Profile");
  const format = useFormatter();
  const { isPending, result, run, fieldError } = useProfileAction();
  const [handle, setHandle] = useState(instagram ?? "");
  const [instagramOn, setInstagramOn] = useState(showInstagram);
  const [birthdayOn, setBirthdayOn] = useState(birthDate ? showBirthday : false);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    run(() => updateVisibility({ instagram: handle, show_instagram: instagramOn, show_birthday: birthdayOn }));
  }

  const instagramError = fieldError("instagram");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("visibility")}</CardTitle>
        <CardDescription>{t("visibilityHint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate aria-busy={isPending} className="flex flex-col gap-4">
          <Field data-invalid={!!instagramError}>
            <FieldLabel htmlFor="profile-instagram">{t("instagram")}</FieldLabel>
            <Input
              id="profile-instagram"
              value={handle}
              onChange={(event) => setHandle(event.target.value)}
              placeholder="@kullaniciadi"
              maxLength={300}
              autoCapitalize="none"
              autoCorrect="off"
              aria-invalid={!!instagramError}
              className="h-10 md:h-9"
            />
            <FieldError>{instagramError}</FieldError>
          </Field>

          <label className="flex min-h-10 cursor-pointer items-center justify-between gap-4 text-sm">
            {t("showInstagram")}
            <Switch checked={instagramOn} onCheckedChange={setInstagramOn} />
          </label>

          <div className="flex flex-col gap-1">
            <label
              className="flex min-h-10 items-center justify-between gap-4 text-sm has-enabled:cursor-pointer"
            >
              {t("showBirthday")}
              <Switch checked={birthdayOn} onCheckedChange={setBirthdayOn} disabled={!birthDate} />
            </label>
            {!birthDate && <FieldDescription>{t("birthdayMissing")}</FieldDescription>}
          </div>

          {birthDate && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 text-sm">
              <dt className="text-muted-foreground">{t("birthDate")}</dt>
              <dd>{format.dateTime(new Date(birthDate), { dateStyle: "long", timeZone: "Europe/Istanbul" })}</dd>
            </dl>
          )}

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
