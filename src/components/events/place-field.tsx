"use client";

import { ExternalLink, LoaderCircle, MapPin, Store, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { resolvePlaceLink } from "@/lib/events/actions";
import { type PlaceDraft, type PlaceError, withResolved } from "@/lib/events/form-state";
import { navLinks } from "@/lib/events/nav-links";

type Update = (key: string, fn: (place: PlaceDraft) => PlaceDraft) => void;

/**
 * One place of the event form: a name and one paste box for a map link, a dropped pin or coordinates. The paste is
 * read on the server (`resolvePlaceLink`: short links are followed there) on paste, Enter or blur, and fills the pin
 * slot or the venue slot; pasting again can fill the other one. Privacy: the pasted text stays only in the box (it
 * can hold the sharer's own position) and is cleared once read; only the read point or venue reaches the event.
 */
export function PlaceField({
  place,
  idBase,
  legend,
  controls,
  index,
  nameError,
  placeError,
  onUpdate,
}: {
  place: PlaceDraft;
  /** Prefix of the element ids (unique per place). */
  idBase: string;
  /** "Başlangıç", "1. durak"…; none for a meet-up (the section legend names it). */
  legend: string | null;
  /** Buttons beside the legend (a stop's move/remove). */
  controls?: ReactNode;
  /** Position in the sent place list: the error keys the form uses to focus a field. */
  index: number;
  nameError?: string;
  placeError?: string;
  onUpdate: Update;
}) {
  const t = useTranslations("Events.form");
  const tDetail = useTranslations("Events.detail");
  const pasteRef = useRef<HTMLInputElement>(null);
  // Only the newest read may land: an older answer arriving late is dropped.
  const request = useRef(0);
  const { key } = place;

  const ids = {
    legend: `${idBase}-legend`,
    name: `${idBase}-name`,
    paste: `${idBase}-paste`,
    hint: `${idBase}-hint`,
    error: `${idBase}-error`,
    pin: `${idBase}-pin`,
    venue: `${idBase}-venue`,
  };

  async function resolve(text: string) {
    const trimmed = text.trim();
    if (trimmed === "") return;
    const current = ++request.current;
    onUpdate(key, (p) => ({ ...p, paste: text, pending: true, error: null }));
    const result = await resolvePlaceLink(trimmed).catch(() => ({ status: "error" as const }));
    if (current !== request.current) return;
    if (result.status === "ok") {
      onUpdate(key, (p) => withResolved(p, result.place));
      return;
    }
    const error: PlaceError =
      result.status === "forbidden" ? "forbidden" : result.status === "error" ? "error" : "unreadable";
    onUpdate(key, (p) => ({ ...p, pending: false, error }));
  }

  function removeSlot(slot: "point" | "venue") {
    onUpdate(key, (p) => (slot === "point" ? { ...p, point: null } : { ...p, venue: null }));
    // The button goes away with its slot: keep the focus in the place.
    pasteRef.current?.focus();
  }

  const pasteErrorText = place.error === null ? placeError : t(`placeErrors.${place.error}`);
  const venueText = place.venue
    ? place.venue.label !== null || place.name.trim() !== ""
      ? t("venue", { label: place.venue.label ?? place.name.trim() })
      : t("venueUnnamed")
    : null;
  const pointLinks =
    place.point && navLinks({ name: place.name, point: place.point, venueUrl: null, venueLabel: null });
  const venueLinks =
    place.venue && navLinks({ name: place.name, point: null, venueUrl: place.venue.url, venueLabel: null });

  return (
    <div
      role={legend === null ? undefined : "group"}
      aria-labelledby={legend === null ? undefined : ids.legend}
      className="flex min-w-0 flex-col gap-4 rounded-xl border p-4"
    >
      {legend !== null && (
        <div className="flex min-h-7 items-center justify-between gap-2">
          <span id={ids.legend} className="text-sm font-medium">
            {legend}
          </span>
          {controls}
        </div>
      )}

      <Field data-invalid={!!nameError}>
        <FieldLabel htmlFor={ids.name}>{t("placeName")}</FieldLabel>
        <Input
          id={ids.name}
          data-error-key={`places.${index}.name`}
          value={place.name}
          onChange={(event) => onUpdate(key, (p) => ({ ...p, name: event.target.value }))}
          placeholder={t("placeNamePlaceholder")}
          maxLength={80}
          autoComplete="off"
          aria-invalid={!!nameError}
          aria-describedby={nameError ? `${ids.name}-error` : undefined}
          className="h-10 md:h-9"
        />
        <FieldError id={`${ids.name}-error`}>{nameError}</FieldError>
      </Field>

      <Field data-invalid={!!pasteErrorText}>
        <FieldLabel htmlFor={ids.paste}>{t("placeLink")}</FieldLabel>
        <div className="relative">
          <Input
            ref={pasteRef}
            id={ids.paste}
            data-error-key={`places.${index}`}
            value={place.paste}
            onChange={(event) => onUpdate(key, (p) => ({ ...p, paste: event.target.value, error: null }))}
            onPaste={(event) => {
              const text = event.clipboardData.getData("text");
              if (text.trim() === "") return;
              event.preventDefault();
              void resolve(text);
            }}
            onKeyDown={(event) => {
              // Enter reads the box; it must not submit the form.
              if (event.key !== "Enter") return;
              event.preventDefault();
              if (!place.pending) void resolve(place.paste);
            }}
            onBlur={() => {
              // A failed text is read again only after it changes (the change clears the error).
              if (!place.pending && place.error === null) void resolve(place.paste);
            }}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            aria-invalid={!!pasteErrorText}
            aria-busy={place.pending}
            aria-describedby={[ids.hint, pasteErrorText ? ids.error : null].filter(Boolean).join(" ")}
            className="h-10 pr-9 md:h-9"
          />
          {place.pending && (
            <LoaderCircle
              aria-hidden
              className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
            />
          )}
        </div>
        <p aria-live="polite" className="sr-only">
          {place.pending ? t("resolving") : ""}
        </p>
        <FieldDescription id={ids.hint}>{t("placeLinkHint")}</FieldDescription>
        <FieldError id={ids.error}>{pasteErrorText}</FieldError>
      </Field>

      {(pointLinks || venueLinks) && (
        <ul aria-live="polite" className="flex flex-col gap-2">
          {place.point && pointLinks && (
            <Slot
              id={ids.pin}
              icon={<MapPin aria-hidden className="size-4 shrink-0 text-muted-foreground" />}
              text={t("pin", { coords: pointLinks.coords ?? "" })}
              href={pointLinks.open.google}
              openLabel={tDetail("openPlace")}
              removeLabel={t("removePin")}
              onRemove={() => removeSlot("point")}
            />
          )}
          {venueLinks && venueText && (
            <Slot
              id={ids.venue}
              icon={<Store aria-hidden className="size-4 shrink-0 text-muted-foreground" />}
              text={venueText}
              href={venueLinks.open.google}
              openLabel={tDetail("openPlace")}
              removeLabel={t("removeVenue")}
              onRemove={() => removeSlot("venue")}
            />
          )}
        </ul>
      )}
    </div>
  );
}

/** A filled slot: what was read, a check link ("Konumu aç", new tab) and a remove button. */
function Slot({
  id,
  icon,
  text,
  href,
  openLabel,
  removeLabel,
  onRemove,
}: {
  id: string;
  icon: ReactNode;
  text: string;
  href: string;
  openLabel: string;
  removeLabel: string;
  onRemove: () => void;
}) {
  return (
    <li className="flex items-center gap-2 rounded-lg bg-muted/50 py-1 pr-1 pl-3 text-sm">
      {icon}
      <span id={id} className="min-w-0 flex-1 wrap-break-word">
        {text}
      </span>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-describedby={id}
        className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 font-medium text-accent-text underline-offset-4 hover:underline"
      >
        {openLabel}
        <ExternalLink aria-hidden className="size-3.5" />
      </a>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={removeLabel}
        aria-describedby={id}
        onClick={onRemove}
      >
        <X aria-hidden />
      </Button>
    </li>
  );
}
