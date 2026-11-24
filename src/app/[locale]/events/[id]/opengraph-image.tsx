import { hasLocale } from "next-intl";
import { getFormatter, getTranslations } from "next-intl/server";
import { unstable_rethrow } from "next/navigation";
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { routing } from "@/i18n/routing";
import { dayToDate } from "@/lib/events/day";
import { getEventPreview } from "@/lib/events/public";
import type { EventPreview } from "@/lib/events/public-rows";
import { OG_IMAGE_SIZE, SITE_NAME } from "@/lib/seo/site";

// The link-preview image of one event (events release spec §5.7): the event's public data only (kind, title, day,
// area, cancelled), in the route's locale; an unknown or malformed id (or a failed read) gets the club's generic card.
// Rendered on request (satori + resvg). The page metadata names this image's URL itself (`eventImageUrl`), so
// `alt` / `size` / `contentType` here only describe the response. Fonts: static Saira TTFs (satori reads no variable
// fonts; OFL in src/assets/fonts). Badge: small JPEG copies of src/assets/brand/badge.png flattened on the background
// (the 1 MB original would be decoded on every render).

export const alt = SITE_NAME;
export const size = OG_IMAGE_SIZE;
export const contentType = "image/png";

// Literal paths: the build traces exactly these files into the function (a helper joining a variable would pull in
// the whole folder).
const [titleFont, textFont, badgeSmall, badgeLarge, wordmarkSvg] = await Promise.all([
  readFile(join(process.cwd(), "src/assets/fonts/SairaExtraCondensed-ExtraBold.ttf")),
  readFile(join(process.cwd(), "src/assets/fonts/SairaSemiCondensed-SemiBold.ttf")),
  readFile(join(process.cwd(), "src/assets/brand/badge-og-104.jpg")),
  readFile(join(process.cwd(), "src/assets/brand/badge-og-320.jpg")),
  readFile(join(process.cwd(), "public/brand/wordmark.svg"), "utf8"),
]);
const FONTS = [
  { name: "Saira ExtraCondensed", data: titleFont, weight: 800, style: "normal" },
  { name: "Saira SemiCondensed", data: textFont, weight: 600, style: "normal" },
] as const;
const jpeg = (bytes: Buffer) => `data:image/jpeg;base64,${bytes.toString("base64")}`;
const BADGE_SMALL = jpeg(badgeSmall);
const BADGE_LARGE = jpeg(badgeLarge);
// The wordmark's one path has no fill (black); paint it cream.
const wordmarkCream = wordmarkSvg.replace("<path ", '<path fill="#fbf5e5" ');
const WORDMARK = `data:image/svg+xml;base64,${Buffer.from(wordmarkCream).toString("base64")}`;
const WORDMARK_RATIO = 1794 / 572;

// Dark ("Gece") tokens of src/app/globals.css.
const C = {
  background: "#0b0d10",
  foreground: "#fbf5e5",
  muted: "#a39c8c",
  primary: "#f98d2f",
  accentText: "#fba04a",
  destructive: "#ff7376",
};

// The data changes when an organiser edits or cancels (the read is cached for about an hour), so not ImageResponse's
// default `immutable, max-age=31536000`. A failed read is not kept anywhere.
const CACHE_READ = "public, max-age=3600";
const CACHE_FAILED = "no-store";

const DAY = { weekday: "long", day: "numeric", month: "long" } as const;

export default async function Image({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: param, id } = await params;
  const locale = hasLocale(routing.locales, param) ? param : routing.defaultLocale;
  let preview: EventPreview | null;
  try {
    preview = await getEventPreview(id);
  } catch (error) {
    unstable_rethrow(error);
    // The cached reader logged the error code; the generic card, not a 500, and nothing cached.
    console.error("event preview for the image failed");
    return render(<GenericCard />, CACHE_FAILED);
  }
  if (!preview) return render(<GenericCard />, CACHE_READ);

  const [t, format] = await Promise.all([getTranslations({ locale, namespace: "Events" }), getFormatter({ locale })]);
  return render(
    <EventCard
      preview={preview}
      kind={t(`kinds.${preview.kind}`).toLocaleUpperCase(locale)}
      day={format.dateTime(dayToDate(preview.day), DAY)}
      cancelled={t("cancelled").toLocaleUpperCase(locale)}
    />,
    CACHE_READ,
  );
}

function render(element: React.ReactElement, cacheControl: string) {
  return new ImageResponse(element, { ...size, fonts: [...FONTS], headers: { "cache-control": cacheControl } });
}

const frame = {
  width: "100%",
  height: "100%",
  display: "flex",
  backgroundColor: C.background,
  // A soft orange glow from the top right, like the home hero's.
  backgroundImage: "radial-gradient(circle at 92% 0%, rgba(249, 141, 47, 0.16), rgba(249, 141, 47, 0) 55%)",
  color: C.foreground,
  fontFamily: "Saira SemiCondensed",
} as const;

function EventCard({
  preview,
  kind,
  day,
  cancelled,
}: {
  preview: EventPreview;
  kind: string;
  day: string;
  cancelled: string;
}) {
  return (
    <div style={{ ...frame, flexDirection: "column", padding: "56px 72px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <img src={BADGE_SMALL} width={104} height={104} alt="" />
          <img src={WORDMARK} width={Math.round(52 * WORDMARK_RATIO)} height={52} alt="" />
        </div>
        <div style={{ fontSize: 30, letterSpacing: 4, color: C.accentText }}>{kind}</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center", gap: 14 }}>
        <div
          style={{
            display: "block",
            lineClamp: 2,
            fontFamily: "Saira ExtraCondensed",
            fontSize: 100,
            lineHeight: 1.02,
            color: preview.cancelled ? C.muted : C.foreground,
            textDecorationLine: preview.cancelled ? "line-through" : "none",
          }}
        >
          {preview.title}
        </div>
        <div style={{ fontSize: 46, color: C.accentText }}>{day}</div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 64 }}>
        {preview.area !== null ? <Route area={preview.area} /> : <div />}
        {preview.cancelled && (
          <div
            style={{
              display: "flex",
              padding: "6px 22px",
              border: `4px solid ${C.destructive}`,
              borderRadius: 8,
              color: C.destructive,
              fontSize: 38,
              letterSpacing: 3,
              transform: "rotate(-4deg)",
            }}
          >
            {cancelled}
          </div>
        )}
      </div>
    </div>
  );
}

/** The route strip of the design system (start ring, orange line with a glow, orange finish) and the area line. */
function Route({ area }: { area: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 28, maxWidth: 760 }}>
      <div style={{ display: "flex", alignItems: "center", width: 220, height: 24, flexShrink: 0 }}>
        <div
          style={{
            position: "absolute",
            left: 10,
            right: 10,
            top: 10,
            height: 4,
            borderRadius: 2,
            backgroundColor: C.primary,
            boxShadow: "0 0 10px 3px rgba(249, 141, 47, 0.35)",
          }}
        />
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            border: `5px solid ${C.foreground}`,
            backgroundColor: C.background,
          }}
        />
        <div style={{ flexGrow: 1 }} />
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: C.primary,
            border: `3px solid ${C.background}`,
          }}
        />
      </div>
      <div style={{ display: "block", lineClamp: 1, fontSize: 38, color: C.foreground }}>{area}</div>
    </div>
  );
}

function GenericCard() {
  return (
    <div style={{ ...frame, alignItems: "center", justifyContent: "center", gap: 64 }}>
      <img src={BADGE_LARGE} width={320} height={320} alt="" />
      <img src={WORDMARK} width={Math.round(130 * WORDMARK_RATIO)} height={130} alt="" />
    </div>
  );
}
