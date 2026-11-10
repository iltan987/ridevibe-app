"use client";

import { CircleCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import { submitApplication } from "@/lib/applications/actions";
import {
  EVENT_INTERESTS,
  GROUP_EXPERIENCE,
  HEARD_FROM,
  LANGUAGES,
  LICENSE_CLASSES,
  RIDING_STYLES,
  UTM_KEYS,
} from "@/lib/applications/options";
import { isGoogleMailAddress } from "@/lib/applications/contact";
import {
  type ApplicationFieldErrors,
  type ApplyErrorKey,
  isEmailAddress,
  validateApplication,
} from "@/lib/applications/schema";
import { istanbulDistrictNames } from "@/lib/istanbul-districts";
import { PhoneField } from "./phone-field";

type Status = "idle" | "invalid" | "duplicate" | "error" | "success";

/** `defaults`: name and sign-in email of a signed-in account (still editable). */
export function ApplyForm({ defaults }: { defaults?: { fullName: string; email: string } }) {
  const t = useTranslations("Apply");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<Status>("idle");
  const [errors, setErrors] = useState<ApplicationFieldErrors>({});
  // Errors show for fields the person has left (blur) or after a submit attempt.
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const [submitAttempts, setSubmitAttempts] = useState(0);
  // Typed email (for the non-Gmail note) and what the success card says: the
  // submitted email, or null when the application was linked to the signed-in account.
  const [email, setEmail] = useState(defaults?.email ?? "");
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  // Conditional sections.
  const [cityChoice, setCityChoice] = useState<"istanbul" | "other">("istanbul");
  const [ownsBike, setOwnsBike] = useState<string | null>(null);
  const [otherClubs, setOtherClubs] = useState<string | null>(null);
  const [heardFrom, setHeardFrom] = useState<string | null>(null);
  const [languages, setLanguages] = useState<readonly string[]>([]);
  const [events, setEvents] = useState<readonly string[]>([]);

  function revalidate() {
    if (!formRef.current) return;
    const check = validateApplication(new FormData(formRef.current));
    setErrors(check.ok ? {} : check.fieldErrors);
  }

  // Base UI checkboxes/radios update their hidden inputs after the click
  // handler, so re-validate on the next frame.
  const revalidateSoon = () => requestAnimationFrame(revalidate);

  function onFieldBlur(event: React.FocusEvent<HTMLFormElement>) {
    const field = (event.target as HTMLElement).closest("[data-field]")?.getAttribute("data-field");
    if (field && !touched.has(field)) setTouched(new Set(touched).add(field));
    revalidate();
  }

  // Bring the first problem into view after a failed submit.
  useEffect(() => {
    if (status !== "invalid" || submitAttempts === 0) return;
    const first = formRef.current?.querySelector<HTMLElement>("[data-invalid=true]");
    first?.scrollIntoView({ behavior: "smooth", block: "center" });
    first?.querySelector<HTMLElement>("input, select, textarea, [role=checkbox], [role=radio]")?.focus({ preventScroll: true });
    // Only on submit attempts, not while typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitAttempts]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setSubmitAttempts((n) => n + 1);

    const check = validateApplication(formData);
    if (!check.ok) {
      setErrors(check.fieldErrors);
      setStatus("invalid");
      return;
    }

    startTransition(async () => {
      const result = await submitApplication(formData);
      if (result.status === "invalid") {
        setErrors(result.fieldErrors);
        setStatus("invalid");
      } else {
        setErrors({});
        setStatus(result.status);
        if (result.status === "success") {
          setSubmittedEmail(result.linked ? null : check.data.email);
          window.scrollTo({ top: 0 });
        }
      }
    });
  }

  if (status === "success") {
    return (
      <Card>
        <CardHeader className="items-start gap-3">
          <CircleCheck className="size-8 text-status" aria-hidden />
          <CardTitle className="text-xl">{t("successTitle")}</CardTitle>
          <CardDescription>{t("successBody")}</CardDescription>
          <CardDescription>
            {submittedEmail === null
              ? t("successSignedIn")
              : t.rich("successEmail", {
                  email: submittedEmail,
                  b: (chunks) => <b className="font-semibold text-foreground wrap-anywhere">{chunks}</b>,
                })}
          </CardDescription>
          <Link href="/" className={buttonVariants({ variant: "outline", className: "mt-2" })}>
            {t("backHome")}
          </Link>
        </CardHeader>
      </Card>
    );
  }

  const error = (name: string) => {
    if (submitAttempts === 0 && !touched.has(name)) return undefined;
    const key = errors[name];
    return key ? t(`errors.${key as ApplyErrorKey}`) : undefined;
  };

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      onBlur={onFieldBlur}
      onChange={revalidateSoon}
      onClick={revalidateSoon}
      noValidate
      className="flex flex-col gap-10"
    >
      <input type="hidden" name="locale" value={locale} />
      {UTM_KEYS.map((key) => {
        const value = searchParams.get(key);
        return value ? <input key={key} type="hidden" name={key} value={value.slice(0, 200)} /> : null;
      })}
      {/* Honeypot: hidden from people and assistive tech; bots tend to fill it. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Website <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {/* 1. About you */}
      <FieldSet data-skeleton-result="apply">
        <FieldLegend className="text-lg">{t("sections.about")}</FieldLegend>
        <FieldGroup>
          <TextField
            name="full_name"
            label={t("fields.full_name")}
            hint={t("fields.fullNameHint")}
            error={error("full_name")}
            autoComplete="name"
            defaultValue={defaults?.fullName}
          />
          <PhoneField name="phone" label={t("fields.phone")} hint={t("fields.phoneHint")} error={error("phone")} />
          <TextField
            name="email"
            type="email"
            label={t("fields.email")}
            hint={t("fields.emailHint")}
            note={showNotGmailNote(email, defaults?.email) ? t("fields.emailNotGmail") : undefined}
            error={error("email")}
            autoComplete="email"
            inputMode="email"
            defaultValue={defaults?.email}
            onChange={(event) => setEmail(event.currentTarget.value)}
          />
          <TextField
            name="birth_date"
            type="date"
            label={t("fields.birth_date")}
            hint={t("fields.birthDateHint")}
            error={error("birth_date")}
            autoComplete="bday"
          />

          <ChoiceRadios
            name="city_choice"
            label={t("fields.city")}
            options={["istanbul", "other"] as const}
            optionLabel={(v) => t(`options.city.${v}`)}
            defaultValue="istanbul"
            onChange={(v) => setCityChoice(v as "istanbul" | "other")}
            error={error("city_choice")}
            horizontal
          />
          {cityChoice === "istanbul" ? (
            <Field data-field="district" data-invalid={!!error("district")}>
              <FieldLabel htmlFor="district">{t("fields.district")}</FieldLabel>
              <NativeSelect id="district" name="district" defaultValue="" className="w-full" aria-invalid={!!error("district")}>
                <NativeSelectOption value="" disabled>
                  {t("fields.districtPlaceholder")}
                </NativeSelectOption>
                {istanbulDistrictNames.map((d) => (
                  <NativeSelectOption key={d} value={d}>
                    {d}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldError>{error("district")}</FieldError>
            </Field>
          ) : (
            <>
              <TextField name="city" label={t("fields.city_other")} error={error("city")} autoComplete="address-level2" />
              <TextField name="district" label={t("fields.district")} error={error("district")} />
            </>
          )}

          <TextField
            name="instagram"
            label={t("fields.instagram")}
            optional={t("optional")}
            error={error("instagram")}
            placeholder="@kullaniciadi"
            autoCapitalize="none"
            autoCorrect="off"
          />
          <ChoiceChips
            name="languages"
            label={t("fields.languages")}
            hint={t("fields.multiHint")}
            options={LANGUAGES}
            optionLabel={(v) => t(`options.languages.${v}`)}
            onValuesChange={setLanguages}
            error={error("languages")}
          />
          {languages.includes("other") && (
            <TextField name="other_languages" label={t("fields.other_languages")} error={error("other_languages")} />
          )}
        </FieldGroup>
      </FieldSet>

      {/* 2. Riding */}
      <FieldSet>
        <FieldLegend className="text-lg">{t("sections.riding")}</FieldLegend>
        <FieldGroup>
          <ChoiceRadios
            name="license_class"
            label={t("fields.license_class")}
            options={LICENSE_CLASSES}
            optionLabel={(v) => t(`options.license_class.${v}`)}
            error={error("license_class")}
            horizontal
          />
          <TextField
            name="riding_years"
            type="number"
            label={t("fields.riding_years")}
            error={error("riding_years")}
            inputMode="numeric"
            min={0}
            max={70}
            className="max-w-32"
          />
          <ChoiceRadios
            name="owns_motorcycle"
            label={t("fields.owns_motorcycle")}
            options={["yes", "no"] as const}
            optionLabel={(v) => t(`options.${v}`)}
            onChange={setOwnsBike}
            error={error("owns_motorcycle")}
            horizontal
          />
          {ownsBike === "yes" && (
            <div className="grid gap-5 sm:grid-cols-3">
              <TextField name="motorcycle_brand" label={t("fields.motorcycle_brand")} error={error("motorcycle_brand")} placeholder="Honda" />
              <TextField name="motorcycle_model" label={t("fields.motorcycle_model")} error={error("motorcycle_model")} placeholder="CB650R" />
              <TextField
                name="motorcycle_cc"
                type="number"
                label={t("fields.motorcycle_cc")}
                optional={t("optional")}
                error={error("motorcycle_cc")}
                inputMode="numeric"
                placeholder="650"
              />
            </div>
          )}
          <ChoiceChips
            name="riding_styles"
            label={t("fields.riding_styles")}
            hint={t("fields.multiHint")}
            options={RIDING_STYLES}
            optionLabel={(v) => t(`options.riding_styles.${v}`)}
            error={error("riding_styles")}
          />
          <ChoiceRadios
            name="group_experience"
            label={t("fields.group_experience")}
            options={GROUP_EXPERIENCE}
            optionLabel={(v) => t(`options.group_experience.${v}`)}
            error={error("group_experience")}
            horizontal
          />
        </FieldGroup>
      </FieldSet>

      {/* 3. You and the club */}
      <FieldSet>
        <FieldLegend className="text-lg">{t("sections.club")}</FieldLegend>
        <FieldGroup>
          <ChoiceRadios
            name="in_other_clubs"
            label={t("fields.in_other_clubs")}
            options={["yes", "no"] as const}
            optionLabel={(v) => t(`options.${v}`)}
            onChange={setOtherClubs}
            error={error("in_other_clubs")}
            horizontal
          />
          {otherClubs === "yes" && (
            <TextField name="other_club_names" label={t("fields.other_club_names")} error={error("other_club_names")} />
          )}
          <ChoiceRadios
            name="heard_from"
            label={t("fields.heard_from")}
            options={HEARD_FROM}
            optionLabel={(v) => t(`options.heard_from.${v}`)}
            onChange={setHeardFrom}
            error={error("heard_from")}
          />
          {heardFrom === "friend" && (
            <TextField
              name="referrer_name"
              label={t("fields.referrer_name")}
              optional={t("optional")}
              hint={t("fields.referrerHint")}
              error={error("referrer_name")}
            />
          )}
          <ChoiceChips
            name="event_interests"
            label={t("fields.event_interests")}
            hint={t("fields.multiHint")}
            options={EVENT_INTERESTS}
            optionLabel={(v) => t(`options.event_interests.${v}`)}
            onValuesChange={setEvents}
            error={error("event_interests")}
          />
          {events.includes("other") && (
            <TextField
              name="other_event_interests"
              label={t("fields.other_event_interests")}
              error={error("other_event_interests")}
            />
          )}
          <TextAreaField name="expectations" label={t("fields.expectations")} error={error("expectations")} />
          <TextAreaField name="alienating_behaviors" label={t("fields.alienating_behaviors")} error={error("alienating_behaviors")} />
          <TextAreaField name="conflict_handling" label={t("fields.conflict_handling")} error={error("conflict_handling")} />
        </FieldGroup>
      </FieldSet>

      {/* 4. Consents: separate, never pre-ticked (KVKK). */}
      <FieldSet>
        <FieldLegend className="text-lg">{t("sections.consents")}</FieldLegend>
        <FieldGroup className="gap-4">
          <ConsentCheckbox
            name="consent_privacy"
            error={error("consent_privacy")}
            label={t.rich("fields.consent_privacy", {
              link: (chunks) => (
                <Link href="/privacy" target="_blank" className="font-medium underline underline-offset-4">
                  {chunks}
                </Link>
              ),
            })}
          />
          <ConsentCheckbox name="consent_rules" label={t("fields.consent_rules")} error={error("consent_rules")} />
          <ConsentCheckbox
            name="consent_photos"
            label={t("fields.consent_photos")}
            hint={t("fields.consentPhotosHint")}
          />
        </FieldGroup>
      </FieldSet>

      <div className="flex flex-col gap-3">
        {status !== "idle" && (
          <p role="alert" className="text-sm text-destructive">
            {status === "invalid" ? t("formHasErrors") : status === "duplicate" ? t("duplicate") : t("genericError")}
          </p>
        )}
        <Button type="submit" size="lg" disabled={isPending} className="h-11 w-full sm:w-auto sm:self-start">
          {isPending ? t("submitting") : t("submit")}
        </Button>
      </div>
    </form>
  );
}

// Soft note for addresses that may not be Google accounts. Not for the signed-in
// user's own sign-in email: they just signed in to Google with it (Workspace).
function showNotGmailNote(value: string, signInEmail?: string) {
  const normalized = value.trim().toLowerCase();
  if (signInEmail && normalized === signInEmail.trim().toLowerCase()) return false;
  return isEmailAddress(value) && !isGoogleMailAddress(value);
}

// ---------------------------------------------------------------------------
// Field building blocks
// ---------------------------------------------------------------------------

function OptionalTag({ text }: { text?: string }) {
  return text ? <span className="font-normal text-muted-foreground">({text})</span> : null;
}

function TextField({
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
      <Input id={name} name={name} aria-invalid={!!error} className={`h-10 md:h-9 ${className ?? ""}`} {...inputProps} />
      {hint && <FieldDescription>{hint}</FieldDescription>}
      {note && <FieldDescription className="text-accent-text">{note}</FieldDescription>}
      <FieldError>{error}</FieldError>
    </Field>
  );
}

function TextAreaField({ name, label, error }: { name: string; label: string; error?: string }) {
  return (
    <Field data-field={name} data-invalid={!!error}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Textarea id={name} name={name} rows={3} maxLength={1000} aria-invalid={!!error} />
      <FieldError>{error}</FieldError>
    </Field>
  );
}

function ChoiceRadios<T extends string>({
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
  onChange?: (value: string) => void;
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
        onValueChange={(v) => onChange?.(String(v))}
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

function ChoiceChips<T extends string>({
  name,
  label,
  hint,
  options,
  optionLabel,
  onValuesChange,
  error,
}: {
  name: string;
  label: string;
  hint?: string;
  options: readonly T[];
  optionLabel: (value: T) => string;
  onValuesChange?: (values: readonly T[]) => void;
  error?: string;
}) {
  const [selected, setSelected] = useState<readonly T[]>([]);
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

function ConsentCheckbox({
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
        <FieldLabel htmlFor={name} className="font-normal leading-snug">
          {label}
        </FieldLabel>
        {hint && <FieldDescription>{hint}</FieldDescription>}
        <FieldError>{error}</FieldError>
      </FieldContent>
    </Field>
  );
}
