"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { setBirthDate, updateVisibility } from "@/lib/members/actions";
import { EARLIEST_BIRTH_DATE, latestAdultBirthDate } from "@/lib/birth-date";
import { normalizeInstagram } from "@/lib/members/schema";
import { ActionStatus, useProfileAction } from "./use-profile-action";

type Props = {
  instagram: string | null;
  showInstagram: boolean;
  showBirthday: boolean;
  /** `YYYY-MM-DD` or null (manually activated members have none). */
  birthDate: string | null;
};

/**
 * Instagram handle plus what the member list may show. The birth date is read-only once stored; members without one
 * (activated by hand, no application) can enter it once here.
 */
export function VisibilityForm({ instagram, showInstagram, showBirthday, birthDate }: Props) {
  const t = useTranslations("Profile");
  const format = useFormatter();
  const { isPending, result, run, fieldError } = useProfileAction();
  const [handle, setHandle] = useState(instagram ?? "");
  const [instagramOn, setInstagramOn] = useState(showInstagram);
  // Keeps the stored value even without a birth date: the switch only *shows* off then (it is disabled), and saving
  // the form must not overwrite the default. Gating the initial state on birthDate would stay stale after the
  // one-time entry (refresh() brings the date, but useState keeps its first value).
  const [birthdayOn, setBirthdayOn] = useState(showBirthday);
  const birthDateEntry = useBirthDateEntry();

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const submitted = handle;
    run(
      () => updateVisibility({ instagram: submitted, show_instagram: instagramOn, show_birthday: birthdayOn }),
      // Show the handle as saved ("@x" or a profile URL is stored as "x").
      () => setHandle(normalizeInstagram(submitted) ?? ""),
    );
  }

  const instagramError = fieldError("instagram");

  return (
    <Card data-skeleton-result="profile-visibility">
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
              placeholder={t("instagramPlaceholder")}
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

          {!birthDate && <BirthDateFields entry={birthDateEntry} />}

          <div className="flex flex-col gap-1">
            <label
              className="flex min-h-10 items-center justify-between gap-4 text-sm has-enabled:cursor-pointer"
            >
              {t("showBirthday")}
              <Switch checked={!!birthDate && birthdayOn} onCheckedChange={setBirthdayOn} disabled={!birthDate} aria-describedby={birthDate ? undefined : "profile-birthday-missing"} />
            </label>
            {!birthDate && <FieldDescription id="profile-birthday-missing">{t("birthdayMissing")}</FieldDescription>}
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
        {/* Outside the form above: forms can't nest. The birth-date controls join it via their `form` attribute. */}
        {!birthDate && (
          <form id={BIRTH_DATE_FORM_ID} onSubmit={birthDateEntry.onSubmit} noValidate aria-busy={birthDateEntry.isPending} />
        )}
      </CardContent>
    </Card>
  );
}

const BIRTH_DATE_FORM_ID = "profile-birth-date-form";

/** One-time birth-date entry (members without one). Enter in the date field saves only the date. */
function useBirthDateEntry() {
  const { isPending, result, run, fieldError } = useProfileAction();
  const [value, setValue] = useState("");

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    run(() => setBirthDate({ birth_date: value }));
  }

  return { isPending, result, value, setValue, onSubmit, error: fieldError("birth_date") };
}

/** Controls of the birth-date entry; they sit inside the visibility form but belong to `BIRTH_DATE_FORM_ID`. */
function BirthDateFields({ entry }: { entry: ReturnType<typeof useBirthDateEntry> }) {
  const t = useTranslations("Profile");
  const { isPending, result, value, setValue, error } = entry;

  return (
    <div className="flex flex-col gap-3">
      <Field data-invalid={!!error}>
        <FieldLabel htmlFor="profile-birth-date">{t("birthDate")}</FieldLabel>
        <Input
          id="profile-birth-date"
          form={BIRTH_DATE_FORM_ID}
          type="date"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          min={EARLIEST_BIRTH_DATE}
          max={latestAdultBirthDate()}
          autoComplete="bday"
          aria-invalid={!!error}
          aria-describedby="profile-birth-date-hint"
          className="h-10 md:h-9"
        />
        <FieldDescription id="profile-birth-date-hint">{t("birthDateOnceHint")}</FieldDescription>
        <FieldError>{error}</FieldError>
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" form={BIRTH_DATE_FORM_ID} variant="outline" disabled={isPending}>
          {t("saveBirthDate")}
        </Button>
        <ActionStatus result={result} />
      </div>
    </div>
  );
}
