"use client";

import { CircleCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { GoogleIcon } from "@/components/auth/google-icon";
import { Button, buttonVariants } from "@/components/ui/button";
import { getPathname, Link } from "@/i18n/navigation";
import { signInWithGoogle } from "@/lib/auth/actions";
import { detectInAppBrowser } from "@/lib/auth/in-app-browser";
import { submitApplication } from "@/lib/applications/actions";
import { writeApplyHint } from "@/lib/applications/apply-hint";
import { markApplySubmitted } from "@/lib/applications/apply-submitted";
import {
  EVENT_INTERESTS,
  GROUP_EXPERIENCE,
  HEARD_FROM,
  LANGUAGES,
  LICENSE_CLASSES,
  MOTORCYCLE_BRAND_SUGGESTIONS,
  RIDING_STYLES,
  UTM_KEYS,
} from "@/lib/applications/options";
import { isGoogleMailAddress } from "@/lib/applications/contact";
import { asksRidingMonths } from "@/lib/applications/riding-experience";
import { type ApplyDraft, browserStorage, clearDraft, createDraftSaver, readDraft } from "@/lib/applications/draft";
import { type ApplicationFieldErrors, isEmailAddress, validateApplication } from "@/lib/applications/schema";
import { errorsOfStep, firstStepWithError, isLastStep, parseStep, stepOfField } from "@/lib/applications/steps";
import { istanbulDistrictNames } from "@/lib/istanbul-districts";
import { noSubscribe } from "@/lib/no-subscribe";
import { oneOf } from "@/lib/one-of";
import { ChoiceChips, ChoiceRadios, ConsentCheckbox, TextAreaField, TextField } from "./apply-fields";
import { PhoneField } from "./phone-field";
import { StepHeader } from "./step-header";
import { StepNav } from "./step-nav";

type Status = "idle" | "invalid" | "duplicate" | "error" | "success";

/** What to focus once a step is shown: its heading, or (with `errors`) its first field with an error. */
type FocusRequest = { step: number; errors?: ApplicationFieldErrors };

type Defaults = { fullName: string; email: string };

const YES_NO = ["yes", "no"] as const;

const getUserAgent = () => navigator.userAgent;
const getServerUserAgent = () => null;

/**
 * `defaults`: name and sign-in email of a signed-in account (still editable).
 *
 * Answers of steps 1–3 are kept as a browser draft (`src/lib/applications/draft.ts`). The server render and the
 * hydration pass have no draft; the form then remounts once (`hydrated` in the key) and restores it. On client-side
 * navigation (e.g. a language switch) `hydrated` is already true and the draft is read on the first render. "Start
 * over" remounts it empty (`resetCount`).
 */
export function ApplyForm({ defaults }: { defaults?: Defaults }) {
  const hydrated = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  const [resetCount, setResetCount] = useState(0);
  return (
    <ApplyFormSteps
      key={`${String(hydrated)}-${resetCount}`}
      defaults={defaults}
      hydrated={hydrated}
      startedOver={resetCount > 0}
      onStartOver={() => setResetCount((n) => n + 1)}
    />
  );
}

function ApplyFormSteps({
  defaults,
  hydrated,
  startedOver,
  onStartOver,
}: {
  defaults?: Defaults;
  hydrated: boolean;
  startedOver: boolean;
  onStartOver: () => void;
}) {
  const t = useTranslations("Apply");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<Status>("idle");
  const [errors, setErrors] = useState<ApplicationFieldErrors>({});
  // Errors show for fields the person has left (blur), for steps where "Next" was
  // pressed, and everywhere after a submit attempt.
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const [checkedSteps, setCheckedSteps] = useState<ReadonlySet<number>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  // Typed email (for the non-Gmail note) and what the success card says: the
  // submitted email, or null when the application was linked to the signed-in account.
  const [email, setEmail] = useState(defaults?.email ?? "");
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  // Read once per mount (see ApplyForm); only a draft with answers comes back.
  const [draft] = useState(() => (hydrated ? readDraft(browserStorage(), new Date()) : null));
  const [saver] = useState(() => createDraftSaver(browserStorage));

  // Google sign-in to fill name and email: signed-out visitors only, and not inside social apps' embedded browsers
  // (Google blocks OAuth there). The server snapshot is null: hidden until the client knows the user agent.
  const userAgent = useSyncExternalStore(noSubscribe, getUserAgent, getServerUserAgent);
  const canFillWithGoogle = !defaults && userAgent !== null && !detectInAppBrowser(userAgent);

  // Conditional sections.
  const [cityChoice, setCityChoice] = useState<"istanbul" | "other">("istanbul");
  const [ridingYears, setRidingYears] = useState(draftText(draft, "riding_years"));
  const [ownsBike, setOwnsBike] = useState<string | null>(draftChoice(draft, YES_NO, "owns_motorcycle") ?? null);
  const [otherClubs, setOtherClubs] = useState<string | null>(draftChoice(draft, YES_NO, "in_other_clubs") ?? null);
  const [heardFrom, setHeardFrom] = useState<string | null>(draftChoice(draft, HEARD_FROM, "heard_from") ?? null);
  const [languages, setLanguages] = useState<readonly string[]>([]);
  const [events, setEvents] = useState<readonly string[]>(
    draftChoices(draft, EVENT_INTERESTS, "event_interests") ?? [],
  );

  // The current step lives in the URL (`?step=N`), so back/forward move between steps. Without one (reload of
  // `/apply`, language switch) a restored draft opens where the person left off.
  const step = parseStep(searchParams.get("step")) ?? draft?.step ?? 1;

  // Focus moves after the target step is rendered: the URL update from `history.pushState`
  // reaches `useSearchParams` in a later render than this component's own state.
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const handledFocusRequest = useRef<FocusRequest | null>(null);
  const shownStep = useRef(step);
  useEffect(() => {
    const stepChanged = shownStep.current !== step;
    shownStep.current = step;
    if (focusRequest && focusRequest !== handledFocusRequest.current && focusRequest.step === step) {
      handledFocusRequest.current = focusRequest;
      if (focusRequest.errors && focusFirstInvalid(formRef.current, step, focusRequest.errors)) return;
    } else if (!stepChanged) {
      return;
    }
    // A new step (also via back/forward): start at the top and announce it.
    window.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, [step, focusRequest]);

  // After "start over" the button is gone: put the focus on the step heading.
  useEffect(() => {
    if (startedOver) headingRef.current?.focus({ preventScroll: true });
  }, [startedOver]);

  // Draft: saved (debounced) on every step change and on input; a pending save is written before the page goes away
  // (reload, closed tab) or the form unmounts (a language switch remounts it and reads the draft again).
  const savedStep = useRef(step);
  useEffect(() => {
    if (savedStep.current === step) return;
    savedStep.current = step;
    const form = formRef.current;
    if (form) saver.schedule(() => new FormData(form), step);
  }, [step, saver]);
  useEffect(() => {
    const flush = () => saver.flush();
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      saver.flush();
    };
  }, [saver]);

  function scheduleSave() {
    const form = formRef.current;
    if (form) saver.schedule(() => new FormData(form), step);
  }

  /** Writes the draft immediately at `target` (before leaving the page on purpose, e.g. the Google sign-in). */
  function saveDraftNow(target: number) {
    const form = formRef.current;
    if (form) saver.saveNow(() => new FormData(form), target);
  }

  /** Saves the draft at step 4, then leaves for Google; the callback brings the person back to `?step=4`. */
  function fillWithGoogle() {
    saveDraftNow(4);
    const fd = new FormData();
    fd.set("next", `${getPathname({ href: "/apply", locale })}?step=4`);
    startTransition(() => signInWithGoogle(fd));
  }

  // `stop`, not `cancel`: this click also bubbles to the form's onClick (scheduleSave), and the unmount flush would
  // then write the old answers back. The remounted form gets its own saver.
  function startOver() {
    saver.stop();
    clearDraft(browserStorage());
    goToStep(1, "replace");
    onStartOver();
  }

  /**
   * Shows `target` (`?step=N`, other params such as UTM kept) and focuses its heading, or its first field with an
   * error when `focusErrors` is given. The current step only gets the focus (no extra history entry).
   */
  function goToStep(target: number, mode: "push" | "replace", focusErrors?: ApplicationFieldErrors) {
    if (target !== step) {
      const params = new URLSearchParams(window.location.search);
      params.set("step", String(target));
      if (mode === "push") window.history.pushState(null, "", `?${params}`);
      else window.history.replaceState(null, "", `?${params}`);
    }
    setFocusRequest({ step: target, errors: focusErrors });
  }

  /** Jumps to the first step with an error (e.g. after a deep link to `?step=4`) and focuses the field. */
  function showErrors(fieldErrors: ApplicationFieldErrors) {
    goToStep(firstStepWithError(fieldErrors) ?? step, "push", fieldErrors);
  }

  function revalidate() {
    if (!formRef.current) return;
    const check = validateApplication(new FormData(formRef.current));
    setErrors(check.ok ? {} : check.fieldErrors);
  }

  // Base UI checkboxes/radios update their hidden inputs after the click
  // handler, so re-validate on the next frame.
  const revalidateSoon = () => requestAnimationFrame(revalidate);

  // Typed by the blurred element (blur bubbles up from the field), not by the form the handler sits on.
  function onFieldBlur(event: React.FocusEvent) {
    const field = event.target.closest("[data-field]")?.getAttribute("data-field");
    if (field && !touched.has(field)) setTouched(new Set(touched).add(field));
    revalidate();
    scheduleSave();
    // Focus left the form (e.g. to the language switcher): write now. A language switch renders the new form, which
    // reads the draft, before this one unmounts, so the flush on unmount would come too late.
    if (!event.currentTarget.contains(event.relatedTarget)) saver.flush();
  }

  // Base UI checkboxes/radios update their hidden inputs after the click handler; the save reads the form later.
  function onFieldInput() {
    revalidateSoon();
    scheduleSave();
  }

  // Also fired by Enter in a text input: on steps 1–3 that means "Next", never an early submit.
  function onSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const check = validateApplication(formData);
    const fieldErrors = check.ok ? {} : check.fieldErrors;
    setErrors(fieldErrors);

    if (!isLastStep(step)) {
      const stepErrors = errorsOfStep(fieldErrors, step);
      if (Object.keys(stepErrors).length === 0) {
        goToStep(step + 1, "push");
      } else {
        setCheckedSteps(new Set(checkedSteps).add(step));
        goToStep(step, "push", stepErrors);
      }
      return;
    }

    setSubmitted(true);
    if (!check.ok) {
      setStatus("invalid");
      showErrors(check.fieldErrors);
      return;
    }

    startTransition(async () => {
      const result = await submitApplication(formData);
      if (result.status === "invalid") {
        setErrors(result.fieldErrors);
        setStatus("invalid");
        showErrors(result.fieldErrors);
      } else {
        setErrors({});
        setStatus(result.status);
        if (result.status === "success") {
          // Stop first: a pending or later save would re-create the draft.
          saver.stop();
          clearDraft(browserStorage());
          setSubmittedEmail(result.linked ? null : check.data.email);
          if (result.linked) {
            // The account now has an open application: hide "Başvur" in the navs at once (no refresh(), which
            // would replace this success card) and on the next load's guess.
            markApplySubmitted();
            writeApplyHint(() => localStorage, true);
          }
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
                  b: (chunks) => <b className="font-semibold wrap-anywhere text-foreground">{chunks}</b>,
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
    const fieldStep = stepOfField(name);
    const shown = submitted || touched.has(name) || (fieldStep !== null && checkedSteps.has(fieldStep));
    const key = shown ? errors[name] : undefined;
    return key ? t(`errors.${key}`) : undefined;
  };

  // "Fix the highlighted fields" only while there is something left to fix.
  const statusMessage =
    status === "duplicate"
      ? t("duplicate")
      : status === "error"
        ? t("genericError")
        : status === "invalid" && Object.keys(errors).length > 0
          ? t("formHasErrors")
          : null;

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      onBlur={onFieldBlur}
      onChange={onFieldInput}
      onClick={onFieldInput}
      noValidate
      data-skeleton-result="apply"
      className="flex flex-col gap-8"
    >
      <input type="hidden" name="locale" value={locale} />
      {UTM_KEYS.map((key) => {
        const value = searchParams.get(key) || draft?.utm[key];
        return value ? <input key={key} type="hidden" name={key} value={value.slice(0, 200)} /> : null;
      })}
      {/* Honeypot: hidden from people and assistive tech; bots tend to fill it. */}
      <div aria-hidden className="absolute left-[-9999px] size-px overflow-hidden">
        <label>
          Website <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="flex flex-col gap-3">
        {draft && (
          <p className="text-sm text-muted-foreground">
            {t("draft.restored")}{" "}
            <button
              type="button"
              onClick={startOver}
              className="cursor-pointer font-medium text-foreground underline underline-offset-4"
            >
              {t("draft.startOver")}
            </button>
          </p>
        )}
        <StepHeader step={step} headingRef={headingRef} />
      </div>

      {/* Every step stays mounted (FormData holds the whole application); inactive ones are hidden. */}
      <Step n={1} current={step}>
        <FieldGroup>
          <ChoiceRadios
            name="license_class"
            label={t("fields.license_class")}
            options={LICENSE_CLASSES}
            defaultValue={draftChoice(draft, LICENSE_CLASSES, "license_class")}
            optionLabel={(v) => t(`options.license_class.${v}`)}
            error={error("license_class")}
            horizontal
          />
          <TextField
            name="riding_years"
            type="number"
            label={t("fields.riding_years")}
            error={error("riding_years")}
            defaultValue={draftText(draft, "riding_years")}
            onChange={(event) => setRidingYears(event.currentTarget.value)}
            inputMode="numeric"
            min={0}
            max={70}
            className="max-w-32"
          />
          {asksRidingMonths(ridingYears) && (
            <TextField
              name="riding_months"
              type="number"
              label={t("fields.riding_months")}
              error={error("riding_months")}
              defaultValue={draftText(draft, "riding_months")}
              inputMode="numeric"
              min={0}
              max={11}
              className="max-w-32"
            />
          )}
          <ChoiceRadios
            name="owns_motorcycle"
            label={t("fields.owns_motorcycle")}
            options={YES_NO}
            defaultValue={draftChoice(draft, YES_NO, "owns_motorcycle")}
            optionLabel={(v) => t(`options.${v}`)}
            onChange={setOwnsBike}
            error={error("owns_motorcycle")}
            horizontal
          />
          {ownsBike === "yes" && (
            <div className="grid gap-5 sm:grid-cols-3">
              <TextField
                name="motorcycle_brand"
                label={t("fields.motorcycle_brand")}
                error={error("motorcycle_brand")}
                defaultValue={draftText(draft, "motorcycle_brand")}
                placeholder="Honda"
                list="motorcycle-brands"
              />
              <datalist id="motorcycle-brands">
                {MOTORCYCLE_BRAND_SUGGESTIONS.map((brand) => (
                  <option key={brand} value={brand} />
                ))}
              </datalist>
              <TextField
                name="motorcycle_model"
                label={t("fields.motorcycle_model")}
                error={error("motorcycle_model")}
                defaultValue={draftText(draft, "motorcycle_model")}
                placeholder="CB650R"
              />
              <TextField
                name="motorcycle_cc"
                type="number"
                label={t("fields.motorcycle_cc")}
                optional={t("optional")}
                error={error("motorcycle_cc")}
                defaultValue={draftText(draft, "motorcycle_cc")}
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
            defaultValues={draftChoices(draft, RIDING_STYLES, "riding_styles")}
            error={error("riding_styles")}
          />
          <ChoiceRadios
            name="group_experience"
            label={t("fields.group_experience")}
            options={GROUP_EXPERIENCE}
            optionLabel={(v) => t(`options.group_experience.${v}`)}
            defaultValue={draftChoice(draft, GROUP_EXPERIENCE, "group_experience")}
            error={error("group_experience")}
            horizontal
          />
        </FieldGroup>
      </Step>

      <Step n={2} current={step}>
        <FieldGroup>
          <ChoiceRadios
            name="in_other_clubs"
            label={t("fields.in_other_clubs")}
            options={YES_NO}
            defaultValue={draftChoice(draft, YES_NO, "in_other_clubs")}
            optionLabel={(v) => t(`options.${v}`)}
            onChange={setOtherClubs}
            error={error("in_other_clubs")}
            horizontal
          />
          {otherClubs === "yes" && (
            <TextField
              name="other_club_names"
              label={t("fields.other_club_names")}
              error={error("other_club_names")}
              defaultValue={draftText(draft, "other_club_names")}
            />
          )}
          <ChoiceRadios
            name="heard_from"
            label={t("fields.heard_from")}
            options={HEARD_FROM}
            optionLabel={(v) => t(`options.heard_from.${v}`)}
            defaultValue={draftChoice(draft, HEARD_FROM, "heard_from")}
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
              defaultValue={draftText(draft, "referrer_name")}
            />
          )}
          <ChoiceChips
            name="event_interests"
            label={t("fields.event_interests")}
            hint={t("fields.multiHint")}
            options={EVENT_INTERESTS}
            optionLabel={(v) => t(`options.event_interests.${v}`)}
            defaultValues={draftChoices(draft, EVENT_INTERESTS, "event_interests")}
            onValuesChange={setEvents}
            error={error("event_interests")}
          />
          {events.includes("other") && (
            <TextField
              name="other_event_interests"
              label={t("fields.other_event_interests")}
              error={error("other_event_interests")}
              defaultValue={draftText(draft, "other_event_interests")}
            />
          )}
        </FieldGroup>
      </Step>

      <Step n={3} current={step}>
        <FieldGroup>
          <p className="text-sm text-muted-foreground">{t("wordsHint")}</p>
          <TextAreaField
            name="expectations"
            label={t("fields.expectations")}
            placeholder={t("fields.expectationsPlaceholder")}
            error={error("expectations")}
            defaultValue={draftText(draft, "expectations")}
          />
          <TextAreaField
            name="alienating_behaviors"
            label={t("fields.alienating_behaviors")}
            error={error("alienating_behaviors")}
            defaultValue={draftText(draft, "alienating_behaviors")}
          />
          <TextAreaField
            name="conflict_handling"
            label={t("fields.conflict_handling")}
            error={error("conflict_handling")}
            defaultValue={draftText(draft, "conflict_handling")}
          />
        </FieldGroup>
      </Step>

      <Step n={4} current={step} className="flex flex-col gap-10">
        {canFillWithGoogle && (
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={fillWithGoogle}
              disabled={isPending}
              className="self-start"
            >
              <GoogleIcon />
              {t("google.button")}
            </Button>
            <p className="text-sm text-muted-foreground">{t("google.hint")}</p>
          </div>
        )}
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
            onChange={setCityChoice}
            error={error("city_choice")}
            horizontal
          />
          {cityChoice === "istanbul" ? (
            <Field data-field="district" data-invalid={!!error("district")}>
              <FieldLabel htmlFor="district">{t("fields.district")}</FieldLabel>
              <NativeSelect
                id="district"
                name="district"
                defaultValue=""
                className="w-full"
                aria-invalid={!!error("district")}
              >
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
              <TextField
                name="city"
                label={t("fields.city_other")}
                error={error("city")}
                autoComplete="address-level2"
              />
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

        {/* Consents: separate, never pre-ticked (KVKK). */}
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
      </Step>

      <StepNav step={step} isPending={isPending} message={statusMessage} onBack={() => goToStep(step - 1, "push")} />
    </form>
  );
}

/** A restored text answer (`defaultValue`). */
function draftText(draft: ApplyDraft | null, name: string): string | undefined {
  const value = draft?.fields[name];
  return typeof value === "string" ? value : undefined;
}

/** A restored single choice, only if it is still one of `options`. */
function draftChoice<T extends string>(draft: ApplyDraft | null, options: readonly T[], name: string): T | undefined {
  const value = draft?.fields[name];
  return oneOf(options, value);
}

/** Restored multiple choices that are still among `options`. */
function draftChoices<T extends string>(
  draft: ApplyDraft | null,
  options: readonly T[],
  name: string,
): T[] | undefined {
  const value = draft?.fields[name];
  return Array.isArray(value) ? options.filter((option) => value.includes(option)) : undefined;
}

function Step({ n, current, ...props }: { n: number; current: number } & React.ComponentProps<"div">) {
  return <div data-step={n} hidden={n !== current} {...props} />;
}

/** Focuses the first field of `step` (in page order) that has an error; false when there is none. */
function focusFirstInvalid(form: HTMLFormElement | null, step: number, errors: ApplicationFieldErrors): boolean {
  const fields = form?.querySelectorAll<HTMLElement>(`[data-step="${step}"] [data-field]`) ?? [];
  const field = [...fields].find((el) => errors[el.dataset.field ?? ""]);
  if (!field) return false;
  field.scrollIntoView({ behavior: "smooth", block: "center" });
  focusableIn(field)?.focus({ preventScroll: true });
  return true;
}

// Typing targets first (the phone field's country select comes before its input), then radios/checkboxes/selects.
// Base UI's own hidden inputs are skipped (not focusable by people: tabIndex -1 / aria-hidden).
function focusableIn(field: HTMLElement): HTMLElement | undefined {
  const usable = (el: HTMLElement) => el.tabIndex >= 0 && el.getAttribute("aria-hidden") !== "true";
  const pick = (selector: string) => [...field.querySelectorAll<HTMLElement>(selector)].find(usable);
  return pick("input:not([type=hidden]), textarea") ?? pick("[role=radio], [role=checkbox], select");
}

// Soft note for addresses that may not be Google accounts. Not for the signed-in
// user's own sign-in email: they just signed in to Google with it (Workspace).
function showNotGmailNote(value: string, signInEmail?: string) {
  const normalized = value.trim().toLowerCase();
  if (signInEmail && normalized === signInEmail.trim().toLowerCase()) return false;
  return isEmailAddress(value) && !isGoogleMailAddress(value);
}
