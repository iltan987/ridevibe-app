"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useId, useLayoutEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Link, useRouter } from "@/i18n/navigation";
import { saveEvent, type SaveEventResult } from "@/lib/events/actions";
import {
  addStop,
  errorAt,
  errorMessageKey,
  eventToForm,
  type EventFormState,
  issueMap,
  MAX_STOPS,
  moveStop,
  newEventForm,
  type PlaceDraft,
  placesStatus,
  type ShownPlace,
  removeStop,
  setLoop,
  shownPlaces,
  type StoredEvent,
  toEventInput,
  updatePlace,
} from "@/lib/events/form-state";
import { eventInputSchema } from "@/lib/events/schema";
import { oneOf } from "@/lib/one-of";
import { PlaceField } from "./place-field";

const KINDS = ["meetup", "ride"] as const;
const SIDES = ["asian", "european", "none"] as const;

type Failure = Exclude<SaveEventResult["status"], "ok">;

/**
 * Create (`event` null) or edit form. Next keeps a left page alive (hidden) and shows it again on back navigation:
 * after a save the form is remounted once it is hidden, so going back shows a fresh form, not the saved one (Next
 * guide "Preserving UI state"). An abandoned draft stays.
 */
export function EventForm({ event }: { event: (StoredEvent & { id: string }) | null }) {
  const [generation, setGeneration] = useState(0);
  const saved = useRef(false);
  useLayoutEffect(
    () => () => {
      if (!saved.current) return;
      saved.current = false;
      setGeneration((n) => n + 1);
    },
    [],
  );
  return (
    <EventFormFields
      key={generation}
      event={event}
      onSaved={() => {
        saved.current = true;
      }}
    />
  );
}

function EventFormFields({ event, onSaved }: { event: (StoredEvent & { id: string }) | null; onSaved: () => void }) {
  const t = useTranslations("Events");
  const tf = useTranslations("Events.form");
  const tSides = useTranslations("Admin.sides");
  const router = useRouter();
  // Ids stay unique when Next keeps another form page hidden in the DOM.
  const uid = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const nextKey = useRef(0);
  const [state, setState] = useState<EventFormState>(() => (event ? eventToForm(event) : newEventForm()));
  // Errors show after the first save attempt and then follow every change.
  const [submitted, setSubmitted] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const id = (name: string) => `${uid}-${name}`;
  const newKey = () => `new-${++nextKey.current}`;
  const set = <K extends keyof EventFormState>(field: K, value: EventFormState[K]) =>
    setState((s) => ({ ...s, [field]: value }));
  const updatePlaceByKey = (key: string, fn: (p: PlaceDraft) => PlaceDraft) => setState((s) => updatePlace(s, key, fn));

  const input = toEventInput(state);
  const check = submitted ? eventInputSchema.safeParse(input) : null;
  const errors = check?.success === false ? issueMap(check.error.issues) : {};
  const hasErrors = Object.keys(errors).length > 0;
  const { missing, pending } = placesStatus(state);
  const shown = shownPlaces(state);
  const ride = state.kind === "ride";

  const error = (key: string) => {
    const code = errorAt(errors, key);
    return code === undefined ? undefined : tf(`errors.${errorMessageKey(key, code)}`);
  };

  /** Focuses the first field (in page order) with an error. */
  function focusFirstInvalid(map: Record<string, string>) {
    const fields = formRef.current?.querySelectorAll<HTMLElement>("[data-error-key]") ?? [];
    const field = [...fields].find((el) => errorAt(map, el.dataset.errorKey ?? "") !== undefined);
    if (!field) return;
    field.scrollIntoView({ behavior: "smooth", block: "center" });
    field.focus({ preventScroll: true });
  }

  /** After a list change the moved/new element is rendered next frame. */
  const focusSoon = (elementId: string, fallback?: string) =>
    requestAnimationFrame(() => {
      const target = document.getElementById(elementId);
      if (target instanceof HTMLButtonElement && target.disabled && fallback) {
        document.getElementById(fallback)?.focus();
      } else {
        target?.focus();
      }
    });

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isPending || saved || missing || pending) return;
    setSubmitted(true);
    setFailure(null);
    const result = eventInputSchema.safeParse(input);
    if (!result.success) {
      focusFirstInvalid(issueMap(result.error.issues));
      return;
    }
    startTransition(async () => {
      const answer = await saveEvent(event?.id ?? null, input).catch((): SaveEventResult => ({ status: "error" }));
      if (answer.status !== "ok") {
        setFailure(answer.status);
        return;
      }
      // Stays disabled until the event page is shown (no second create from a double tap).
      setSaved(true);
      onSaved();
      router.push(`/events/${answer.id}`);
    });
  }

  /** One place card; a stop gets move and remove buttons. */
  function renderPlace({ place, role, stop, index }: ShownPlace) {
    const base = id(`place-${place.key}`);
    const legend =
      role === "meetup" ? null : role === "stop" ? t("detail.roles.stop", { n: stop }) : t(`detail.roles.${role}`);
    const stopIndex = stop - 1;
    return (
      <PlaceField
        key={place.key}
        place={place}
        idBase={base}
        legend={legend}
        index={index}
        nameError={error(`places.${index}.name`)}
        placeError={error(`places.${index}`)}
        onUpdate={updatePlaceByKey}
        controls={
          role === "stop" && (
            <div className="flex gap-1">
              <Button
                id={`${base}-up`}
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={tf("moveUp", { n: stop })}
                disabled={stopIndex === 0}
                onClick={() => {
                  setState((s) => moveStop(s, place.key, -1));
                  focusSoon(`${base}-up`, `${base}-down`);
                }}
              >
                <ArrowUp aria-hidden />
              </Button>
              <Button
                id={`${base}-down`}
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={tf("moveDown", { n: stop })}
                disabled={stopIndex === state.stops.length - 1}
                onClick={() => {
                  setState((s) => moveStop(s, place.key, 1));
                  focusSoon(`${base}-down`, `${base}-up`);
                }}
              >
                <ArrowDown aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={tf("removeStop", { n: stop })}
                onClick={() => {
                  setState((s) => removeStop(s, place.key));
                  // Next frame: at the 10-stop cap the button is still disabled until this removal renders.
                  focusSoon(id("add-stop"));
                }}
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
          )
        }
      />
    );
  }

  const blockedHint = pending ? tf("waitResolving") : missing ? tf("needsPlaces") : null;
  const status: ReactNode =
    failure === "notFound" ? (
      <>
        {tf("deleted")}{" "}
        <Link href="/events" className="font-medium underline underline-offset-4">
          {t("backToList")}
        </Link>
      </>
    ) : failure !== null ? (
      t(`errors.${failure}`)
    ) : hasErrors ? (
      tf("hasErrors")
    ) : null;

  const optional = <span className="font-normal text-muted-foreground">({tf("optional")})</span>;

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={onSubmit}
      aria-busy={isPending}
      data-skeleton-result="event-form"
      className="flex flex-col gap-8"
    >
      <FieldGroup data-skeleton-result="event-form-fields">
        <Field>
          <FieldTitle id={id("kind")}>{tf("kind")}</FieldTitle>
          <RadioGroup
            aria-labelledby={id("kind")}
            value={state.kind}
            onValueChange={(value) => {
              const kind = oneOf(KINDS, value);
              if (kind) set("kind", kind);
            }}
            className="flex flex-wrap gap-2"
          >
            {KINDS.map((kind) => (
              <ChoiceLabel key={kind}>
                <RadioGroupItem value={kind} />
                {t(`kinds.${kind}`)}
              </ChoiceLabel>
            ))}
          </RadioGroup>
        </Field>

        <TextInput
          id={id("title")}
          errorKey="title"
          label={tf("title")}
          value={state.title}
          onChange={(v) => set("title", v)}
          error={error("title")}
          placeholder={tf("titlePlaceholder")}
          maxLength={80}
        />

        <Field>
          <FieldTitle id={id("side")}>{tf("side")}</FieldTitle>
          <RadioGroup
            aria-labelledby={id("side")}
            value={state.side ?? "none"}
            onValueChange={(value) => {
              const side = oneOf(SIDES, value);
              if (side) set("side", side === "none" ? null : side);
            }}
            className="flex flex-wrap gap-2"
          >
            {SIDES.map((side) => (
              <ChoiceLabel key={side}>
                <RadioGroupItem value={side} />
                {side === "none" ? tf("sideNone") : tSides(side)}
              </ChoiceLabel>
            ))}
          </RadioGroup>
        </Field>

        <div className="grid gap-5 sm:grid-cols-2 sm:items-start">
          <TextInput
            id={id("startsAt")}
            errorKey="startsAt"
            type="datetime-local"
            label={tf("startsAt")}
            value={state.startsAt}
            onChange={(v) => set("startsAt", v)}
            error={error("startsAt")}
          />
          <TextInput
            id={id("endsAt")}
            errorKey="endsAt"
            type="datetime-local"
            label={tf("endsAt")}
            optional={optional}
            hint={tf("endsAtHint")}
            value={state.endsAt}
            onChange={(v) => set("endsAt", v)}
            error={error("endsAt")}
          />
        </div>

        {ride && (
          <TextInput
            id={id("area")}
            errorKey="area"
            label={tf("area")}
            hint={tf("areaHint")}
            value={state.area}
            onChange={(v) => set("area", v)}
            error={error("area")}
            maxLength={80}
          />
        )}
      </FieldGroup>

      <FieldSet data-skeleton-result="event-form-places" className="gap-3">
        <FieldLegend className="text-lg font-semibold">
          {ride ? t("detail.places") : t("detail.meetingPoint")}
        </FieldLegend>
        {shown.filter(({ role }) => role !== "finish").map(renderPlace)}
        {ride && (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Button
                id={id("add-stop")}
                type="button"
                variant="outline"
                disabled={state.stops.length >= MAX_STOPS}
                aria-describedby={state.stops.length >= MAX_STOPS ? id("stops-full") : undefined}
                onClick={() => {
                  const key = newKey();
                  setState((s) => addStop(s, key));
                  focusSoon(`${id(`place-${key}`)}-name`);
                }}
              >
                <Plus data-icon="inline-start" aria-hidden />
                {tf("addStop")}
              </Button>
              {state.stops.length >= MAX_STOPS && (
                <p id={id("stops-full")} className="text-sm text-muted-foreground">
                  {tf("stopsFull", { max: MAX_STOPS })}
                </p>
              )}
            </div>
            <Field orientation="horizontal">
              <Checkbox
                id={id("loop")}
                checked={state.loop}
                onCheckedChange={(checked) => {
                  const key = newKey();
                  setState((s) => setLoop(s, checked, key));
                }}
                className="mt-0.5 self-start"
              />
              <FieldContent>
                <FieldLabel htmlFor={id("loop")} className="font-normal">
                  {tf("loop")}
                </FieldLabel>
                <FieldDescription>{tf("loopHint")}</FieldDescription>
              </FieldContent>
            </Field>
          </>
        )}
        {shown.filter(({ role }) => role === "finish").map(renderPlace)}
      </FieldSet>

      <Field data-skeleton-result="event-form-description" data-invalid={!!error("description")}>
        <FieldLabel htmlFor={id("description")}>
          {t("detail.description")} {optional}
        </FieldLabel>
        <Textarea
          id={id("description")}
          data-error-key="description"
          value={state.description}
          onChange={(e) => set("description", e.target.value)}
          maxLength={2000}
          aria-invalid={!!error("description")}
          aria-describedby={[`${id("description")}-hint`, error("description") ? `${id("description")}-error` : null]
            .filter(Boolean)
            .join(" ")}
        />
        <FieldDescription id={`${id("description")}-hint`}>{tf("descriptionHint")}</FieldDescription>
        <FieldError id={`${id("description")}-error`}>{error("description")}</FieldError>
      </Field>

      <FieldSet
        data-skeleton-result="event-form-requirements"
        aria-labelledby={id("requirements-legend")}
        className="gap-4"
      >
        <div className="flex flex-col gap-1">
          <span id={id("requirements-legend")} className="text-lg font-semibold">
            {t("detail.requirements")}
          </span>
          <FieldDescription>{tf("requirementsHint")}</FieldDescription>
        </div>
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 sm:items-start">
          {(["limitPeople", "limitBikes", "minCc"] as const).map((field) => (
            <TextInput
              key={field}
              id={id(field)}
              errorKey={field}
              label={tf(field)}
              value={state[field]}
              onChange={(v) => set(field, v)}
              error={error(field)}
              inputMode="numeric"
              maxLength={6}
            />
          ))}
        </div>
        <Field orientation="horizontal">
          <Checkbox
            id={id("fullMembersOnly")}
            checked={state.fullMembersOnly}
            onCheckedChange={(checked) => set("fullMembersOnly", checked)}
            className="mt-0.5 self-start"
          />
          <FieldContent>
            <FieldLabel htmlFor={id("fullMembersOnly")} className="font-normal">
              {t("detail.fullMembersOnly")}
            </FieldLabel>
            <FieldDescription>{tf("fullMembersOnlyHint")}</FieldDescription>
          </FieldContent>
        </Field>
      </FieldSet>

      <div data-skeleton-result="event-form-save" className="flex flex-col gap-3">
        {status && (
          <p role="alert" className="text-sm text-destructive">
            {status}
          </p>
        )}
        <Button
          type="submit"
          size="lg"
          disabled={isPending || saved || missing || pending}
          aria-describedby={blockedHint ? id("blocked") : undefined}
          className="h-11 w-full sm:w-auto sm:self-start"
        >
          {isPending || saved ? tf("saving") : event ? tf("save") : tf("create")}
        </Button>
        {blockedHint && (
          <p id={id("blocked")} className="text-sm text-muted-foreground">
            {blockedHint}
          </p>
        )}
      </div>
    </form>
  );
}

/** A radio option as a bordered chip (as on the application form). */
function ChoiceLabel({ children }: { children: ReactNode }) {
  return (
    <label className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm has-data-checked:border-primary has-data-checked:bg-primary/5">
      {children}
    </label>
  );
}

function TextInput({
  id,
  errorKey,
  label,
  optional,
  hint,
  value,
  onChange,
  error,
  ...props
}: {
  id: string;
  /** Matches the schema issue path, so a failed save can focus this input. */
  errorKey: string;
  label: string;
  optional?: ReactNode;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
} & Pick<React.ComponentProps<"input">, "type" | "placeholder" | "maxLength" | "inputMode">) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ");
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>
        {label} {optional}
      </FieldLabel>
      <Input
        id={id}
        data-error-key={errorKey}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        aria-invalid={!!error}
        aria-describedby={describedBy || undefined}
        className="h-10 md:h-9"
        {...props}
      />
      {hint && <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription>}
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </Field>
  );
}
