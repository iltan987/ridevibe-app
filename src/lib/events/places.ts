type Named = { name: string };

/** "Start → finish" for a route, the one name for a meet-up ("" without places). */
export function routeSummary(places: Named[]): string {
  const first = places.at(0);
  const last = places.at(-1);
  if (!first || !last) return "";
  return places.length > 1 ? `${first.name} → ${last.name}` : first.name;
}

/**
 * The organiser's WhatsApp text, ending with the event link. No personal data, never the roster. A cancelled event leads with the cancellation and its reason (spec §6); a
 * scheduled one with `changeLead` (the newest change, if any) before the title.
 */
export function shareText(
  event: { title: string; status: "scheduled" | "cancelled"; cancelReason: string | null; places: Named[] },
  {
    when,
    cancelledTitle,
    changeLead,
    url,
  }: { when: string; cancelledTitle: (title: string) => string; changeLead: string | null; url: string },
): string {
  const cancelled = event.status === "cancelled";
  return [
    cancelled ? null : changeLead,
    cancelled ? cancelledTitle(event.title) : event.title,
    cancelled ? event.cancelReason : null,
    when,
    routeSummary(event.places),
    url,
  ]
    .filter((line) => line !== null && line !== "")
    .join("\n");
}

/** The members' WhatsApp text: title, day (no time or place: the link shows them to members) and the event link. */
export function memberShareText(event: { title: string }, { day, url }: { day: string; url: string }): string {
  return [event.title, day, url].join("\n");
}
