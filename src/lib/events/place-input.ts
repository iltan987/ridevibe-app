// Reads a place from what a member pastes: "lat, lng" or a map link. No network: short links are only recognised here
// (`isShortMapUrl`); a server-side resolver follows them and re-checks every hop with `isAllowedMapUrl` (SSRF boundary).
// A route link yields its destination only, never the origin (that is where the sharer stood).

export type LatLng = { lat: number; lng: number };

export type ParsedPlace = { kind: "point"; point: LatLng } | { kind: "venue"; url: string; label: string | null };

const GOOGLE_HOSTS = new Set(["www.google.com", "www.google.com.tr", "google.com"]);
const YANDEX_HOSTS = new Set(["yandex.com.tr", "yandex.com", "yandex.ru"]);
const APPLE_HOSTS = new Set(["maps.apple.com", "maps.apple"]);

const MAX_VENUE_URL = 500;
const MAX_LABEL = 200;

const NUMBER = String.raw`-?\d+(?:\.\d+)?`;
const PAIR = new RegExp(String.raw`^\s*(${NUMBER})\s*,\s*(${NUMBER})\s*$`);
const DATA_POINT = new RegExp(String.raw`!3d(${NUMBER})!4d(${NUMBER})`, "g");
const GOOGLE_FEATURE_ID = /!1s0x[0-9a-f]+:0x[0-9a-f]+/i;
const YANDEX_ORG = /^\/(?:maps|navi)\/org\/([A-Za-z0-9._~%-]+)\/(\d+)/;

function toPoint(lat: string | undefined, lng: string | undefined): LatLng | null {
  if (lat === undefined || lng === undefined) return null;
  const point = { lat: Number(lat), lng: Number(lng) };
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null;
  if (Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180) return null;
  return point;
}

/** "lat,lng" (Google, Apple) or, with `lngFirst`, "lng,lat" (Yandex). */
function parsePair(text: string | null, lngFirst = false): LatLng | null {
  if (text === null) return null;
  const m = PAIR.exec(text);
  if (m === null) return null;
  return lngFirst ? toPoint(m[2], m[1]) : toPoint(m[1], m[2]);
}

function firstPair(url: URL, names: string[], lngFirst = false): LatLng | null {
  for (const name of names) {
    const point = parsePair(url.searchParams.get(name), lngFirst);
    if (point !== null) return point;
  }
  return null;
}

function dataPoints(path: string): LatLng[] {
  const points: LatLng[] = [];
  for (const m of path.matchAll(DATA_POINT)) {
    const point = toPoint(m[1], m[2]);
    if (point !== null) points.push(point);
  }
  return points;
}

function safeDecode(text: string): string | null {
  try {
    return decodeURIComponent(text);
  } catch {
    return null;
  }
}

function isMapsPath(path: string): boolean {
  return path === "/maps" || path.startsWith("/maps/");
}

export function isAllowedMapUrl(url: URL): boolean {
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.port !== "") return false;
  const host = url.hostname;
  const path = url.pathname;
  if (host === "maps.app.goo.gl" || host === "maps.google.com") return true;
  if (host === "goo.gl") return path.startsWith("/maps/");
  if (GOOGLE_HOSTS.has(host)) return isMapsPath(path);
  if (YANDEX_HOSTS.has(host)) {
    return isMapsPath(path) || path === "/navi" || path.startsWith("/navi/");
  }
  return APPLE_HOSTS.has(host);
}

export function isShortMapUrl(url: URL): boolean {
  if (!isAllowedMapUrl(url)) return false;
  const host = url.hostname;
  const path = url.pathname;
  if (host === "maps.app.goo.gl") return path.length > 1;
  if (host === "goo.gl") return path.length > "/maps/".length;
  if (YANDEX_HOSTS.has(host)) return path.startsWith("/maps/-/") && path.length > "/maps/-/".length;
  return host === "maps.apple" && path.startsWith("/p/") && path.length > "/p/".length;
}

function parseGoogle(url: URL): ParsedPlace | null {
  const path = url.pathname;
  if (path.startsWith("/maps/dir/")) {
    // /maps/dir/<origin>/<destination>/…: only the destination (last !3d!4d, else a coordinate segment after the origin).
    const last = dataPoints(path).at(-1);
    if (last !== undefined) return { kind: "point", point: last };
    // The origin may be empty (/maps/dir//<destination>/): count it, drop only trailing empties.
    const segments = path
      .slice("/maps/dir/".length)
      .split("/")
      .filter((s) => !s.startsWith("@") && !s.startsWith("data="));
    while (segments.at(-1) === "") segments.pop();
    const destination = segments.length >= 2 ? parsePair(safeDecode(segments.at(-1) ?? "")) : null;
    if (destination !== null) return { kind: "point", point: destination };
    const query = firstPair(url, ["destination"]);
    return query === null ? null : { kind: "point", point: query };
  }
  const first = dataPoints(path).at(0);
  if (first !== undefined) return { kind: "point", point: first };
  const query = firstPair(url, ["q", "query", "destination", "ll"]);
  if (query !== null) return { kind: "point", point: query };

  const place = /^\/maps\/place\/([^/]+)\//.exec(path);
  const name = place?.[1];
  const dataStart = path.indexOf("/data=");
  if (name === undefined || dataStart === -1) return null;
  const id = GOOGLE_FEATURE_ID.exec(path.slice(dataStart));
  if (id === null) return null;
  const data = path.slice(dataStart + 1, dataStart + id.index + id[0].length);
  const venueUrl = `https://www.google.com/maps/place/${name}/${data}`;
  if (venueUrl.length > MAX_VENUE_URL) return null;
  const decoded = safeDecode(name.replaceAll("+", " "))?.trim() ?? "";
  const label = decoded === "" || decoded.length > MAX_LABEL ? null : decoded;
  return { kind: "venue", url: venueUrl, label };
}

function parseYandex(url: URL): ParsedPlace | null {
  const rtext = url.searchParams.get("rtext");
  if (rtext !== null) {
    const destination = parsePair(rtext.split("~").at(-1) ?? "");
    return destination === null ? null : { kind: "point", point: destination };
  }
  // pt=<lng>,<lat>[,<style>][~<more points>]: the first point counts.
  const pt = url.searchParams.get("pt")?.split("~")[0]?.split(",").slice(0, 2).join(",") ?? null;
  const pin = firstPair(url, ["whatshere[point]"], true) ?? parsePair(pt, true);
  if (pin !== null) return { kind: "point", point: pin };
  const org = YANDEX_ORG.exec(url.pathname);
  if (org !== null) {
    return { kind: "venue", url: `https://yandex.com.tr/maps/org/${org[1]}/${org[2]}/`, label: null };
  }
  const view = firstPair(url, ["ll"], true);
  return view === null ? null : { kind: "point", point: view };
}

function parseApple(url: URL): ParsedPlace | null {
  const point = firstPair(url, ["ll", "coordinate"]);
  return point === null ? null : { kind: "point", point };
}

function toUrl(text: string): URL | null {
  const link = /https?:\/\/\S+/.exec(text);
  if (link === null) return null;
  try {
    return new URL(link[0]);
  } catch {
    return null;
  }
}

export function parsePlaceInput(text: string): ParsedPlace | null {
  const pair = parsePair(text);
  if (pair !== null) return { kind: "point", point: pair };
  const url = toUrl(text);
  if (url === null || !isAllowedMapUrl(url) || isShortMapUrl(url)) return null;
  const host = url.hostname;
  if (YANDEX_HOSTS.has(host)) return parseYandex(url);
  if (APPLE_HOSTS.has(host)) return parseApple(url);
  return parseGoogle(url);
}
