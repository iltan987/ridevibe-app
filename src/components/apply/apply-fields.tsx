"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

function OptionalTag({ text }: { text?: string }) {
  return text ? <span className="font-normal text-muted-foreground">({text})</span> : null;
}

export function TextField({
  name,
  label,
  hint,
  note,
  optional,
  error,
  className,
  ...inputProps
}: {
  name: string;
  label: string;
  hint?: string;
  /** Soft, non-blocking advice shown under the hint (not an error). */
  note?: string;
  optional?: string;
  error?: string;
} & Omit<React.ComponentProps<typeof Input>, "name">) {
  return (
    <Field data-field={name} data-invalid={!!error}>
      <FieldLabel htmlFor={name}>
        {label} <OptionalTag text={optional} />
      </FieldLabel>
      <Input
        id={name}
        name={name}
        aria-invalid={!!error}
        className={`h-10 md:h-9 ${className ?? ""}`}
        {...inputProps}
      />
      {hint && <FieldDescription>{hint}</FieldDescription>}
      {note && <FieldDescription className="text-accent-text">{note}</FieldDescription>}
      <FieldError>{error}</FieldError>
    </Field>
  );
}

export function TextAreaField({
  name,
  label,
  error,
  placeholder,
  defaultValue,
}: {
  name: string;
  label: string;
  error?: string;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <Field data-field={name} data-invalid={!!error}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Textarea
        id={name}
        name={name}
        maxLength={1000}
        placeholder={placeholder}
        defaultValue={defaultValue}
        aria-invalid={!!error}
      />
      <FieldError>{error}</FieldError>
    </Field>
  );
}

export function ChoiceRadios<T extends string>({
  name,
  label,
  options,
  optionLabel,
  defaultValue,
  onChange,
  error,
  horizontal,
}: {
  name: string;
  label: string;
  options: readonly T[];
  optionLabel: (value: T) => string;
  defaultValue?: T;
  onChange?: (value: T) => void;
  error?: string;
  horizontal?: boolean;
}) {
  return (
    <Field data-field={name} data-invalid={!!error}>
      <FieldTitle id={`${name}-label`}>{label}</FieldTitle>
      <RadioGroup
        name={name}
        aria-labelledby={`${name}-label`}
        defaultValue={defaultValue}
        onValueChange={(v) => {
          // Only our own options can be checked; anything else is ignored.
          const option = options.find((o) => o === v);
          if (option !== undefined) onChange?.(option);
        }}
        className={horizontal ? "flex flex-wrap gap-2" : "grid gap-2"}
      >
        {options.map((value) => (
          <label
            key={value}
            className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm has-data-checked:border-primary has-data-checked:bg-primary/5"
          >
            <RadioGroupItem value={value} aria-invalid={!!error} />
            {optionLabel(value)}
          </label>
        ))}
      </RadioGroup>
      <FieldError>{error}</FieldError>
    </Field>
  );
}

export function ChoiceChips<T extends string>({
  name,
  label,
  hint,
  options,
  optionLabel,
  defaultValues,
  onValuesChange,
  error,
}: {
  name: string;
  label: string;
  hint?: string;
  options: readonly T[];
  optionLabel: (value: T) => string;
  defaultValues?: readonly T[];
  onValuesChange?: (values: readonly T[]) => void;
  error?: string;
}) {
  const [selected, setSelected] = useState<readonly T[]>(defaultValues ?? []);
  function toggle(value: T, checked: boolean) {
    const next = checked ? [...selected, value] : selected.filter((v) => v !== value);
    setSelected(next);
    onValuesChange?.(next);
  }

  return (
    <Field data-field={name} data-invalid={!!error}>
      <FieldTitle id={`${name}-label`}>{label}</FieldTitle>
      {hint && <FieldDescription>{hint}</FieldDescription>}
      <div role="group" aria-labelledby={`${name}-label`} className="flex flex-wrap gap-2">
        {options.map((value) => (
          <label
            key={value}
            className="flex min-h-10 cursor-pointer items-center gap-2 rounded-full border px-3.5 py-2 text-sm has-data-checked:border-primary has-data-checked:bg-primary/5"
          >
            <Checkbox
              name={name}
              value={value}
              checked={selected.includes(value)}
              onCheckedChange={(checked) => toggle(value, checked)}
              aria-invalid={!!error}
            />
            {optionLabel(value)}
          </label>
        ))}
      </div>
      <FieldError>{error}</FieldError>
    </Field>
  );
}

export function ConsentCheckbox({
  name,
  label,
  hint,
  error,
}: {
  name: string;
  label: ReactNode;
  hint?: string;
  error?: string;
}) {
  return (
    <Field orientation="horizontal" data-field={name} data-invalid={!!error}>
      <Checkbox id={name} name={name} aria-invalid={!!error} className="mt-0.5 self-start" />
      <FieldContent>
        <FieldLabel htmlFor={name} className="leading-snug font-normal">
          {label}
        </FieldLabel>
        {hint && <FieldDescription>{hint}</FieldDescription>}
        <FieldError>{error}</FieldError>
      </FieldContent>
    </Field>
  );
}
