"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { formDataText } from "@/lib/form-data";
import { ISTANBUL, istanbulDistrictNames } from "@/lib/istanbul-districts";
import { updateLocation } from "@/lib/members/actions";
import { ActionStatus, useProfileAction } from "./use-profile-action";

const CITY_CHOICES = ["istanbul", "other"] as const;
type CityChoice = (typeof CITY_CHOICES)[number];

/** City and district; the side of the Bosphorus is derived on the server. */
export function LocationForm({ city, district }: { city: string; district: string | null }) {
  const t = useTranslations("Profile");
  const { isPending, result, setResult, run, fieldError } = useProfileAction();
  const [choice, setChoice] = useState<CityChoice>(city === ISTANBUL ? "istanbul" : "other");

  function onSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    run(() =>
      updateLocation({
        city_choice: choice,
        city: formDataText(data, "city"),
        district: formDataText(data, "district"),
      }),
    );
  }

  const cityError = fieldError("city");
  const districtError = fieldError("district");

  return (
    <Card data-skeleton-result="profile-location">
      <CardHeader>
        <CardTitle>{t("location")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate aria-busy={isPending} className="flex flex-col gap-4">
          <Field data-invalid={!!fieldError("city_choice")}>
            <FieldTitle id="profile-city-choice">{t("city")}</FieldTitle>
            <RadioGroup
              aria-labelledby="profile-city-choice"
              value={choice}
              onValueChange={(v) => {
                const next = CITY_CHOICES.find((c) => c === v);
                if (next === undefined) return; // only our own options can be checked
                setChoice(next);
                setResult(null);
              }}
              className="flex flex-wrap gap-2"
            >
              {CITY_CHOICES.map((value) => (
                <label
                  key={value}
                  className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm has-data-checked:border-primary has-data-checked:bg-primary/5"
                >
                  <RadioGroupItem value={value} />
                  {value === "istanbul" ? t("cityIstanbul") : t("cityOther")}
                </label>
              ))}
            </RadioGroup>
            <FieldError>{fieldError("city_choice")}</FieldError>
          </Field>

          {choice === "istanbul" ? (
            <Field data-invalid={!!districtError}>
              <FieldLabel htmlFor="profile-district">{t("district")}</FieldLabel>
              <NativeSelect
                id="profile-district"
                name="district"
                defaultValue={city === ISTANBUL && district ? district : ""}
                className="w-full"
                aria-invalid={!!districtError}
              >
                <NativeSelectOption value="" disabled>
                  {t("districtPlaceholder")}
                </NativeSelectOption>
                {istanbulDistrictNames.map((name) => (
                  <NativeSelectOption key={name} value={name}>
                    {name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldError>{districtError}</FieldError>
            </Field>
          ) : (
            <>
              <Field data-invalid={!!cityError}>
                <FieldLabel htmlFor="profile-city">{t("cityName")}</FieldLabel>
                <Input
                  id="profile-city"
                  name="city"
                  defaultValue={city === ISTANBUL ? "" : city}
                  maxLength={80}
                  autoComplete="address-level2"
                  aria-invalid={!!cityError}
                  className="h-10 md:h-9"
                />
                <FieldError>{cityError}</FieldError>
              </Field>
              <Field data-invalid={!!districtError}>
                <FieldLabel htmlFor="profile-district-text">{t("district")}</FieldLabel>
                <Input
                  id="profile-district-text"
                  name="district"
                  defaultValue={city === ISTANBUL ? "" : (district ?? "")}
                  maxLength={80}
                  aria-invalid={!!districtError}
                  className="h-10 md:h-9"
                />
                <FieldError>{districtError}</FieldError>
              </Field>
            </>
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
