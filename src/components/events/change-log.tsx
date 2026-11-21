import { History } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { useId } from "react";
import { z } from "zod";
import type { ChangeEntry } from "@/lib/events/queries";

type Change = ChangeEntry["changes"][number];

/** A change-log entry as the "Güncellendi" box shows it. */
export type ChangeItem = { id: string; when: string; lines: string[] };

// `old` / `new` are JSON written by `save_event`: timestamps (ISO with an offset), the ordered place names, numbers
// (null = no limit) and a flag. Parsed, never trusted: a value we can't read falls back to "… güncellendi".
const timestamp = z.iso.datetime({ offset: true }).nullable();
const amount = z.number().nullable();
const names = z.array(z.string());
const flag = z.boolean();

const TIME = { hour: "2-digit", minute: "2-digit", hourCycle: "h23" } as const;
const DAY_TIME = { weekday: "short", day: "numeric", month: "short", ...TIME } as const;
const DAY = { year: "numeric", month: "numeric", day: "numeric" } as const;
const CHANGED_AT = { weekday: "long", day: "numeric", month: "long", ...TIME } as const;

/**
 * Turns the change log into the box's lines ("Başlangıç: 08:30 → 09:00", "Rota: A → B ⇒ A → C", "Kişi sınırı: 20 →
 * 15", …, newest first) and the share text's lead from the newest entry ("Güncellendi: saat 09:00"). Times are shown
 * in the app's time zone (Europe/Istanbul); a time on the same day as the one it replaced drops the date. The author
 * (organisers only: the RPC returns null for everyone else) follows the time.
 */
export async function describeChanges(
  entries: ChangeEntry[],
  { meetup }: { meetup: boolean },
): Promise<{ items: ChangeItem[]; lead: string | null }> {
  const [t, format] = await Promise.all([getTranslations("Events.changes"), getFormatter()]);
  const placeField = meetup ? t("fields.meetingPoint") : t("fields.route");

  const sameDay = (a: Date, b: Date) => format.dateTime(a, DAY) === format.dateTime(b, DAY);
  const instants = (change: Change) => {
    const from = timestamp.safeParse(change.old);
    const to = timestamp.safeParse(change.new);
    if (!from.success || !to.success) return null;
    const a = from.data === null ? null : new Date(from.data);
    const b = to.data === null ? null : new Date(to.data);
    return { a, b, short: a !== null && b !== null && sameDay(a, b) };
  };
  const amounts = (change: Change) => {
    const from = amount.safeParse(change.old);
    const to = amount.safeParse(change.new);
    return from.success && to.success ? { a: from.data, b: to.data } : null;
  };

  function fieldLabel(field: Change["field"]): string {
    switch (field) {
      case "starts_at":
        return t("fields.startsAt");
      case "ends_at":
        return t("fields.endsAt");
      case "places":
        return placeField;
      case "limit_people":
        return t("fields.limitPeople");
      case "limit_bikes":
        return t("fields.limitBikes");
      case "min_cc":
        return t("fields.minCc");
      case "full_members_only":
        return t("fields.fullMembersOnly");
    }
  }

  function line(change: Change): string {
    const field = fieldLabel(change.field);
    const fallback = t("changed", { field });
    switch (change.field) {
      case "starts_at":
      case "ends_at": {
        const pair = instants(change);
        if (!pair) return fallback;
        const show = (d: Date | null) => (d === null ? t("none") : format.dateTime(d, pair.short ? TIME : DAY_TIME));
        return t("line", { field, from: show(pair.a), to: show(pair.b) });
      }
      case "places": {
        const from = names.safeParse(change.old);
        const to = names.safeParse(change.new);
        if (!from.success || !to.success) return fallback;
        const route = (list: string[]) => list.join(" → ");
        // Same names: a point or venue link moved.
        if (route(from.data) === route(to.data)) return t("moved", { field });
        return t("placesLine", { field, from: route(from.data), to: route(to.data) });
      }
      case "limit_people":
      case "limit_bikes":
      case "min_cc": {
        const pair = amounts(change);
        if (!pair) return fallback;
        const show = (n: number | null) => {
          if (n === null) return change.field === "min_cc" ? t("none") : t("unlimited");
          return change.field === "min_cc" ? t("cc", { cc: n }) : format.number(n);
        };
        return t("line", { field, from: show(pair.a), to: show(pair.b) });
      }
      case "full_members_only": {
        const to = flag.safeParse(change.new);
        return to.success ? t("fullMembersOnly", { value: String(to.data) }) : fallback;
      }
    }
  }

  function leadPart(change: Change): string | null {
    switch (change.field) {
      case "starts_at": {
        const pair = instants(change);
        if (!pair?.b) return null;
        return pair.short
          ? t("leadParts.time", { value: format.dateTime(pair.b, TIME) })
          : t("leadParts.date", { value: format.dateTime(pair.b, DAY_TIME) });
      }
      case "ends_at": {
        const pair = instants(change);
        if (!pair) return null;
        return t("leadParts.endsAt", { value: pair.b === null ? "none" : format.dateTime(pair.b, DAY_TIME) });
      }
      case "places":
        return meetup ? t("leadParts.meetingPoint") : t("leadParts.route");
      case "limit_people":
      case "limit_bikes":
      case "min_cc": {
        const pair = amounts(change);
        if (!pair) return null;
        const value = pair.b === null ? "none" : format.number(pair.b);
        if (change.field === "min_cc") return t("leadParts.minCc", { value });
        return change.field === "limit_people"
          ? t("leadParts.limitPeople", { value })
          : t("leadParts.limitBikes", { value });
      }
      case "full_members_only": {
        const to = flag.safeParse(change.new);
        return to.success ? t("leadParts.fullMembersOnly", { value: String(to.data) }) : null;
      }
    }
  }

  const items = entries.map((entry) => {
    const date = format.dateTime(new Date(entry.changedAt), CHANGED_AT);
    return {
      id: entry.id,
      when: entry.changedByName ? t("byline", { date, name: entry.changedByName }) : date,
      lines: entry.changes.map(line),
    };
  });
  const parts = (entries.at(0)?.changes ?? []).map(leadPart).filter((part) => part !== null);
  return { items, lead: parts.length > 0 ? t("lead", { parts: parts.join(", ") }) : null };
}

/** The "Güncellendi" box: what changed after people joined, newest first. Nothing without entries. */
export function ChangeLog({ heading, items }: { heading: string; items: ChangeItem[] }) {
  const id = useId();
  if (items.length === 0) return null;
  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="flex flex-col gap-3 rounded-xl border border-primary/40 bg-primary/5 p-4"
    >
      <h2 id={`${id}-heading`} className="flex items-center gap-2 text-lg font-semibold">
        <History aria-hidden className="size-4.5 text-accent-text" />
        {heading}
      </h2>
      <ol className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.id} className="flex flex-col gap-0.5 text-sm">
            <ul className="flex flex-col">
              {item.lines.map((text, i) => (
                <li key={i} className="wrap-break-word">
                  {text}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">{item.when}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
