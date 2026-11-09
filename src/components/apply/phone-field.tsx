"use client";

import { useLocale } from "next-intl";
import { useState } from "react";
import PhoneInput, { type Value } from "react-phone-number-input";
import flags from "react-phone-number-input/flags";
import en from "react-phone-number-input/locale/en.json";
import tr from "react-phone-number-input/locale/tr.json";
import "react-phone-number-input/style.css";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const LABELS = { tr, en } as const;

// Turkish habits: "0546…" (trunk prefix) or a pasted "90546…" after the fixed
// "+90". Strip them so the number reads +90 546 123 45 67.
export function fixTurkishNumber(value: string | undefined) {
  if (!value?.startsWith("+90")) return value;
  const rest = value.slice(3);
  if (rest.startsWith("0")) return `+90${rest.slice(1)}`;
  if (rest.length === 12 && rest.startsWith("90")) return `+90${rest.slice(2)}`;
  return value;
}

/**
 * Phone number with country picker, formatted as you type ("+90 546 123 45 67").
 * The library's parsed value (E.164) is submitted via a hidden input — the
 * visible text may still contain a typed trunk "0" until the field is left,
 * when it is re-formatted. Flags are bundled (not loaded from a third-party
 * site) for privacy.
 */
export function PhoneField({
  name,
  label,
  hint,
  error,
  defaultValue,
}: {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  /** Initial number in E.164 (e.g. when staff correct an application). */
  defaultValue?: string;
}) {
  const locale = useLocale();
  const [value, setValue] = useState<Value | undefined>(defaultValue as Value | undefined);
  // Re-mounting the input re-formats the displayed text from the clean value.
  const [formatKey, setFormatKey] = useState(0);

  return (
    <Field data-field={name} data-invalid={!!error}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <input type="hidden" name={name} value={value ?? ""} />
      <div
        // Re-format only when focus leaves the whole field (not when moving
        // from the number to the country picker).
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setFormatKey((k) => k + 1);
        }}
      >
      <PhoneInput
        key={formatKey}
        id={name}
        value={value}
        onChange={(v) => setValue(fixTurkishNumber(v) as Value | undefined)}
        defaultCountry="TR"
        international
        withCountryCallingCode
        countryCallingCodeEditable={false}
        flags={flags}
        labels={LABELS[locale as keyof typeof LABELS] ?? en}
        inputComponent={Input}
        autoComplete="tel"
        aria-invalid={!!error}
        className="phone-field flex items-center gap-2 [&_input]:h-10 md:[&_input]:h-9"
      />
      </div>
      {hint && <FieldDescription>{hint}</FieldDescription>}
      <FieldError>{error}</FieldError>
    </Field>
  );
}
