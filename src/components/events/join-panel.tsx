"use client";

import { Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  type FocusEvent,
  type ReactNode,
  type RefObject,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Link } from "@/i18n/navigation";
import { joinEvent, leaveEvent } from "@/lib/events/actions";
import {
  checkJoin,
  type Counts,
  type JoinActionResult,
  type JoinReason,
  type JoinRole,
  MAX_GUESTS,
  type Signup,
} from "@/lib/events/join";
import { oneOf } from "@/lib/one-of";

const ROLES = ["rider", "passenger"] as const;

type JoinEvent = Parameters<typeof checkJoin>[0]["event"];

/** What the last action left to say: done, refused with a reason, or failed. */
type Outcome =
  | { kind: "done"; what: "joined" | "updated" | "left" }
  | { kind: "refused"; reason: JoinReason }
  | { kind: "failed"; status: "invalid" | "forbidden" | "notFound" | "error" };

/** A control the keyboard can no longer use: native `disabled` or Base UI's disabled radio. */
function unusable(el: Element): boolean {
  return !el.isConnected || el.matches(":disabled, [aria-disabled='true'], [data-disabled]");
}

function outcomeOf(result: JoinActionResult, what: "joined" | "updated" | "left"): Outcome {
  if (result.status === "ok") return { kind: "done", what };
  if (result.status === "refused") return { kind: "refused", reason: result.reason };
  return { kind: "failed", status: result.status };
}

/**
 * "Katılıyorum": Sürücü / Artçı and 0–3 guests, or, once signed up, "Güncelle" and "Katılmaktan vazgeç". Options the
 * join rules refuse (`checkJoin`, the same rules as `join_event`) are disabled with the reason; the database still
 * decides and its refusals show the same texts. A started or cancelled event shows that state instead. After a new
 * sign-up without an emergency contact, a nudge links to the profile's emergency section.
 * Keyboard focus never falls to <body> when the focused control disables or unmounts ("−" at 0 guests, "+" at the
 * limit, saving, "Katılıyorum" replaced by "Güncelle", leaving): it moves to the stepper's other button, else to the
 * panel heading.
 */
export function JoinPanel({
  eventId,
  event,
  counts,
  mine,
  probation,
  maxCc,
  hasEmergencyContact,
  now,
}: {
  eventId: string;
  event: JoinEvent;
  counts: Counts;
  mine: Signup | null;
  probation: boolean;
  maxCc: number | null;
  hasEmergencyContact: boolean;
  /** The server's render time: the rules close the event at its start. */
  now: number;
}) {
  const t = useTranslations("Events");
  const id = useId();
  const [role, setRole] = useState<JoinRole | null>(mine?.role ?? null);
  const [guests, setGuests] = useState(mine?.guests ?? 0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [nudge, setNudge] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const fewerRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const leaveRef = useRef<HTMLButtonElement>(null);
  // The panel's last focused control while focus is in the panel (null once the user moves focus elsewhere).
  const lastFocus = useRef<Element | null>(null);

  // After every render: if the focused control was disabled or removed by it, Chrome moves focus to <body> (or keeps
  // it on the dead control); take it to the closest control that still works.
  useLayoutEffect(() => {
    const last = lastFocus.current;
    const active = document.activeElement;
    if (!last || !unusable(last) || (active !== null && active !== document.body && active !== last)) return;
    const other = last === fewerRef.current ? moreRef.current : last === moreRef.current ? fewerRef.current : null;
    // The heading is above the controls: focusing it must not scroll the page away from where the user was.
    if (other && !unusable(other)) other.focus();
    else headingRef.current?.focus({ preventScroll: true });
  });
  const focusHandlers = {
    // Only the panel's own DOM: React also bubbles focus from the portaled leave dialog (its `finalFocus` handles it).
    onFocus: (e: FocusEvent<HTMLElement>) => {
      if (e.currentTarget.contains(e.target)) lastFocus.current = e.target;
    },
    // Focus moved on by the user (the control still works): nothing to rescue.
    onBlur: (e: FocusEvent<HTMLElement>) => {
      if (e.target === lastFocus.current && !unusable(e.target)) lastFocus.current = null;
    },
  };

  const check = (next: Signup) => checkJoin({ event, counts, mine, next, probation, maxCc, now });
  // The smallest footprint (the sign-up as it is, or a passenger alone): refused only when nothing would pass.
  const closed = check(mine ?? { role: "passenger", guests: 0 });
  const riderReason = closed === null ? check({ role: "rider", guests: mine?.guests ?? 0 }) : null;
  // Guests only meet the people limit (a guest is a passenger): the most this sign-up may bring.
  let maxGuests = mine?.guests ?? 0;
  while (maxGuests < MAX_GUESTS && check({ role: "passenger", guests: maxGuests + 1 }) === null) maxGuests += 1;

  // A new sign-up starts as a rider when riding is allowed (most come on their own bike).
  const wanted = role ?? (riderReason === null ? "rider" : "passenger");
  const next: Signup = {
    role: wanted === "rider" && riderReason !== null ? "passenger" : wanted,
    guests: Math.min(guests, maxGuests),
  };
  const unchanged = mine !== null && mine.role === next.role && mine.guests === next.guests;
  const atGuestLimit = closed === null && next.guests === maxGuests && maxGuests < MAX_GUESTS;

  const reasonText = (reason: JoinReason) => t(`join.reasons.${reason}`, { cc: event.minCc ?? 0 });
  const summary = (signup: Signup) =>
    t("join.summary", { role: t(`join.roles.${signup.role}`), guests: signup.guests });
  const heading = mine ? t("join.headingJoined") : t("join.heading");
  const outcomeText = (o: Outcome) => {
    if (o.kind === "done") return t(`join.done.${o.what}`);
    return o.kind === "refused" ? reasonText(o.reason) : t(`errors.${o.status}`);
  };

  function submit() {
    const wasJoined = mine !== null;
    setOutcome(null);
    startTransition(async () => {
      const result = await joinEvent(eventId, next).catch((): JoinActionResult => ({ status: "error" }));
      setOutcome(outcomeOf(result, wasJoined ? "updated" : "joined"));
      if (result.status === "ok" && !wasJoined && !hasEmergencyContact) setNudge(true);
    });
  }

  function leave() {
    setOutcome(null);
    startTransition(async () => {
      const result = await leaveEvent(eventId).catch((): JoinActionResult => ({ status: "error" }));
      setLeaveOpen(false);
      setOutcome(outcomeOf(result, "left"));
      if (result.status === "ok") setNudge(false);
    });
  }

  if (closed === "started" || closed === "cancelled") {
    return (
      <Panel id={id} heading={heading} headingRef={headingRef} focusHandlers={focusHandlers}>
        {mine && <p className="text-sm">{summary(mine)}</p>}
        <p className="text-sm text-muted-foreground">{reasonText(closed)}</p>
      </Panel>
    );
  }

  return (
    <Panel id={id} heading={heading} headingRef={headingRef} focusHandlers={focusHandlers}>
      {mine && <p className="-mt-2 text-sm text-muted-foreground">{summary(mine)}</p>}
      {closed && <p className="text-sm">{reasonText(closed)}</p>}

      <div className="flex flex-col gap-2">
        <RadioGroup
          aria-label={t("join.roleLabel")}
          value={next.role}
          onValueChange={(value) => {
            const picked = oneOf(ROLES, value);
            if (picked) setRole(picked);
          }}
          disabled={closed !== null || isPending}
          className="grid grid-cols-2 gap-2"
        >
          {ROLES.map((r) => (
            <label
              key={r}
              className="flex min-h-14 cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm has-data-checked:border-primary has-data-checked:bg-primary/5 has-data-disabled:cursor-not-allowed has-data-disabled:opacity-60"
            >
              <RadioGroupItem value={r} disabled={r === "rider" && riderReason !== null} />
              <span className="flex min-w-0 flex-col">
                <span className="font-medium">{t(`join.roles.${r}`)}</span>
                <span className="text-xs text-muted-foreground">{t(`join.roleHints.${r}`)}</span>
              </span>
            </label>
          ))}
        </RadioGroup>
        {riderReason && (
          <p className="text-sm text-muted-foreground">
            {reasonText(riderReason)}
            {riderReason === "minCc" && (
              <>
                {" "}
                <Link href="/account#motorcycles" className="font-medium text-accent-text hover:underline">
                  {t("join.addBike")}
                </Link>
              </>
            )}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <span id={`${id}-guests`} className="text-sm font-medium">
            {t("join.guests")}
          </span>
          <div role="group" aria-labelledby={`${id}-guests`} className="flex items-center gap-2">
            <Button
              ref={fewerRef}
              variant="outline"
              size="icon"
              aria-label={t("join.fewerGuests")}
              disabled={closed !== null || isPending || next.guests === 0}
              onClick={() => setGuests(next.guests - 1)}
            >
              <Minus aria-hidden />
            </Button>
            <output aria-live="polite" className="w-6 text-center font-medium tabular-nums">
              {next.guests}
            </output>
            <Button
              ref={moreRef}
              variant="outline"
              size="icon"
              aria-label={t("join.moreGuests")}
              disabled={closed !== null || isPending || next.guests >= maxGuests}
              onClick={() => setGuests(next.guests + 1)}
            >
              <Plus aria-hidden />
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t("join.guestsHint")}</p>
        {atGuestLimit && <p className="text-sm text-muted-foreground">{reasonText("peopleLimit")}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          {mine ? (
            <>
              <Button disabled={isPending || closed !== null || unchanged} onClick={submit}>
                {t("join.update")}
              </Button>
              <Button ref={leaveRef} variant="outline" disabled={isPending} onClick={() => setLeaveOpen(true)}>
                {t("join.leave")}
              </Button>
            </>
          ) : (
            <Button disabled={isPending || closed !== null} onClick={submit}>
              {t("join.join")}
            </Button>
          )}
        </div>
        {/* Always rendered (a live region must exist before its text changes); the skeleton mirrors its gap. */}
        <p
          aria-live="polite"
          className={outcome?.kind === "done" ? "text-sm text-muted-foreground" : "text-sm text-destructive"}
        >
          {outcome && outcomeText(outcome)}
        </p>
      </div>

      {nudge && mine && (
        <div className="flex flex-col items-start gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
          <p className="text-sm font-medium">{t("join.nudge.title")}</p>
          <p className="text-sm text-muted-foreground">{t("join.nudge.text")}</p>
          <Link href="/account#emergency" className={buttonVariants({ size: "sm" })}>
            {t("join.nudge.action")}
          </Link>
        </div>
      )}

      <AlertDialog open={leaveOpen} onOpenChange={(open) => !isPending && setLeaveOpen(open)}>
        {/* Dismissed: back to the trigger. Confirmed: the trigger is disabled (saving) or gone, so the heading. */}
        <AlertDialogContent
          finalFocus={() => (leaveRef.current && !unusable(leaveRef.current) ? true : headingRef.current)}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{t("join.leaveDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("join.leaveDialog.body")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>{t("join.leaveDialog.dismiss")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={isPending} onClick={leave}>
              {t("join.leaveDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  );
}

function Panel({
  id,
  heading,
  headingRef,
  focusHandlers,
  children,
}: {
  id: string;
  heading: string;
  headingRef: RefObject<HTMLHeadingElement | null>;
  focusHandlers: { onFocus: (e: FocusEvent<HTMLElement>) => void; onBlur: (e: FocusEvent<HTMLElement>) => void };
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`${id}-heading`}
      data-skeleton-result="event-join"
      className="flex flex-col gap-4 rounded-xl border bg-card p-4"
      {...focusHandlers}
    >
      {/* Focus target when the focused control goes away (`tabIndex={-1}`: reachable by script only). */}
      <h2 ref={headingRef} id={`${id}-heading`} tabIndex={-1} className="text-lg font-semibold outline-none">
        {heading}
      </h2>
      {children}
    </section>
  );
}
