import { useFormatter, useTranslations } from "next-intl";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/initials";
import { formatMotorcycle, instagramUrl, locationLabel } from "@/lib/members/format";
import type { DirectoryMember } from "@/lib/members/queries";

/** One member of the directory. Optional parts (location, bikes, birthday, Instagram) leave no gap when absent. */
export function MemberCard({ member }: { member: DirectoryMember }) {
  const t = useTranslations("Members");
  const format = useFormatter();

  const location = locationLabel(member.district, member.side ? t(`sides.${member.side}`) : null);
  const birthday = member.birthday
    ? format.dateTime(new Date(Date.UTC(2000, member.birthday.month - 1, member.birthday.day)), {
        day: "numeric",
        month: "long",
        timeZone: "UTC",
      })
    : null;

  return (
    <li data-skeleton-result="members-row" className="flex gap-3 rounded-xl border p-3">
      <Avatar className="size-12">
        {member.avatarUrl && <AvatarImage src={member.avatarUrl} alt="" referrerPolicy="no-referrer" />}
        <AvatarFallback>{initials(member.fullName)}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate font-medium">{member.fullName}</p>
        {location && <p className="truncate text-xs text-muted-foreground">{location}</p>}
        {member.motorcycles.length > 0 && (
          <ul className="flex flex-col text-sm">
            {member.motorcycles.map((bike, i) => (
              <li key={i} className="truncate">
                {formatMotorcycle(bike)}
              </li>
            ))}
          </ul>
        )}
        {(birthday || member.instagram) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {birthday && <span>{t("birthday", { date: birthday })}</span>}
            {member.instagram && (
              <a
                href={instagramUrl(member.instagram)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("instagram", { handle: member.instagram })}
                className="truncate font-medium text-accent-text hover:underline"
              >
                @{member.instagram}
              </a>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
