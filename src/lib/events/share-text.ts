type Named = { name: string };

/** "Start → finish" for a route, the one name for a meet-up ("" without places). */
export function routeSummary(places: Named[]): string {
  const first = places.at(0);
  const last = places.at(-1);
  if (!first || !last) return "";
  return places.length > 1 ? `${first.name} → ${last.name}` : first.name;
}

/**
 * The organiser's WhatsApp text without the event link (the browser appends it: only it knows the origin). No
 * personal data, never the roster. A cancelled event leads with the cancellation and its reason (spec §6).
 */
export function shareText(
  event: { title: string; status: "scheduled" | "cancelled"; cancelReason: string | null; places: Named[] },
  { when, cancelledTitle }: { when: string; cancelledTitle: (title: string) => string },
): string {
  const cancelled = event.status === "cancelled";
  return [
    cancelled ? cancelledTitle(event.title) : event.title,
    cancelled ? event.cancelReason : null,
    when,
    routeSummary(event.places),
  ]
    .filter((line) => line !== null && line !== "")
    .join("\n");
}
