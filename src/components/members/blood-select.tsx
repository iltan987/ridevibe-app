"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { BLOOD_TYPES, bloodTypeLabel } from "@/lib/members/blood-type";

/** Blood-type filter select; without a choice it has no `name`, so "all" leaves no empty `blood=` in the URL. */
export function BloodSelect({ initial }: { initial: string }) {
  const t = useTranslations("Members.safety");
  const [value, setValue] = useState(initial);

  return (
    <NativeSelect
      name={value ? "blood" : undefined}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      aria-label={t("bloodFilter")}
    >
      <NativeSelectOption value="">{t("bloodFilterAll")}</NativeSelectOption>
      {BLOOD_TYPES.map((type) => (
        <NativeSelectOption key={type} value={type}>
          {bloodTypeLabel(type)}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
