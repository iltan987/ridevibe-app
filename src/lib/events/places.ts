type Named = { name: string };

/** "Start → finish" for a route, the one name for a meet-up ("" without places). */
export function routeSummary(places: Named[]): string {
  const first = places.at(0);
  const last = places.at(-1);
  if (!first || !last) return "";
  return places.length > 1 ? `${first.name} → ${last.name}` : first.name;
}

/**
 * The organiser's WhatsApp text. It has no event link until the joining branch releases Events (follow-ups). No
 * personal data, never the roster. A cancelled event leads with the cancellation and its reason (spec §6); a
 * scheduled one with `changeLead` (the newest change, if any) before the title.
 */
export function shareText(
  event: { title: string; status: "scheduled" | "cancelled"; cancelReason: string | null; places: Named[] },
  {
    when,
    cancelledTitle,
    changeLead,
  }: { when: string; cancelledTitle: (title: string) => string; changeLead: string | null },
): string {
  const cancelled = event.status === "cancelled";
  return [
    cancelled ? null : changeLead,
    cancelled ? cancelledTitle(event.title) : event.title,
    cancelled ? event.cancelReason : null,
    when,
    routeSummary(event.places),
  ]
    .filter((line) => line !== null && line !== "")
    .join("\n");
}
