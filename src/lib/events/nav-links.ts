import type { LatLng } from "./place-input.ts";

export type NavPlace = { name: string; point: LatLng | null; venueUrl: string | null; venueLabel: string | null };

type NavLinks = {
  open: { google: string; apple: string; yandex: string };
  route: { google: string; apple: string; yandex: string; yandexNavi: string | null };
  coords: string | null;
};

const six = (n: number) => n.toFixed(6);

const isYandexUrl = (url: string) => url.startsWith("https://yandex.");

/** Map-app links for a place. A point wins for routes; a venue link is the "open" page of the app it belongs to. */
export function navLinks(place: NavPlace): NavLinks {
  const { point, venueUrl } = place;
  const venueGoogle = venueUrl !== null && !isYandexUrl(venueUrl) ? venueUrl : null;
  const venueYandex = venueUrl !== null && isYandexUrl(venueUrl) ? venueUrl : null;
  if (point !== null) {
    const lat = six(point.lat);
    const lng = six(point.lng);
    return {
      open: {
        google: venueGoogle ?? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
        apple: `https://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(place.name)}`,
        yandex: venueYandex ?? `https://yandex.com.tr/maps/?pt=${lng},${lat}&z=16&l=map`,
      },
      route: {
        google: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
        apple: `https://maps.apple.com/?daddr=${lat},${lng}`,
        yandex: `https://yandex.com.tr/maps/?rtext=~${lat},${lng}&rtt=auto`,
        yandexNavi: `yandexnavi://build_route_on_map?lat_to=${lat}&lon_to=${lng}`,
      },
      coords: `${lat}, ${lng}`,
    };
  }
  const q = encodeURIComponent(place.venueLabel ?? place.name);
  const yandex = `https://yandex.com.tr/maps/?text=${q}`;
  return {
    open: {
      google: venueGoogle ?? `https://www.google.com/maps/search/?api=1&query=${q}`,
      apple: `https://maps.apple.com/?q=${q}`,
      yandex: venueYandex ?? yandex,
    },
    route: {
      google: `https://www.google.com/maps/dir/?api=1&destination=${q}`,
      apple: `https://maps.apple.com/?daddr=${q}`,
      yandex,
      yandexNavi: null,
    },
    coords: null,
  };
}
