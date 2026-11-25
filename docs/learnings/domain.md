# Domain knowledge (Turkey, motorcycles, KVKK)

### License classes (2026-11-08)
- A1 (≤125 cc), A2, A. **B holders** may ride ≤125 cc only after 2 years with B + 6 h riding lessons + practical exam
  (Karayolları Trafik Yönetmeliği art. 85 change, Resmî Gazete 10 Feb 2024); not for commercial use. A 250 cc
  extension was only discussed in 2026, not law. Form option: `b` = "B (125 cc yetkili)".
- **Source:** Karayolları Trafik Yönetmeliği art. 85 change (Resmî Gazete, 10 Feb 2024); form option in
  `src/lib/applications/options.ts` (`LICENSE_CLASSES`).

### Istanbul districts (2026-11-07)
- 39 districts: 25 European, 14 Asian; Adalar counts as Asian. List + side mapping in `src/lib/istanbul-districts.ts`.
- **Source:** `src/lib/istanbul-districts.ts` (header comment: Adalar is administratively on the Asian side).

### Turkish phone habits (2026-11-08)
- People type `0546…` (trunk 0) or `90546…`; store E.164 `+905461234567`. WhatsApp link: `whatsAppUrl()` in
  `src/lib/applications/contact.ts` (`api.whatsapp.com/send?phone=<digits>`, see below).
- **Source:** not recorded.

### WhatsApp prefilled text: emoji become "�" on desktop with wa.me (2026-11-10)
- **Symptom:** the approval invite showed `Merhaba Kerim! �` when sent from a PC; on phones the 🏍️ was fine.
- **Cause:** phones open `wa.me` in the app directly; desktop browsers follow wa.me's redirect to
  `api.whatsapp.com/send/`, which rewrites every emoji in `text` to `%EF%BF%BD` (U+FFFD). Verified with
  `curl -sI "https://wa.me/905000000000?text=Hi%20%F0%9F%8F%8D%EF%B8%8F"` → `location: …text=Hi+%EF%BF%BD`.
- **Do:** link to `https://api.whatsapp.com/send?phone=<digits>&text=<encodeURIComponent(text)>` (`whatsAppUrl()`);
  it keeps the emoji and still opens the app on phones.
- **Source:** found by testing (the `curl` above); fix in 48195ec.

### KVKK essentials used so far (not legal advice) (2026-11-07)
- Privacy notice (aydınlatma metni, art. 10) required; consents separate and never pre-ticked; photo sharing needs
  explicit consent (açık rıza) and must be revocable; blood type = special-category health data.
- Data abroad (Supabase/Vercel in Frankfurt) = cross-border transfer (art. 9, amended 2024): standard contracts +
  notification to the Authority within 5 business days.
- Avoid third-party requests that leak visitor IPs without need (e.g. phone-input flag CDN) and non-essential
  cookies (UTM attribution is passed via URL, no cookie).
- Store the privacy-notice version with each consent (`privacy_notice_version`).
- **Source:** KVKK (Law No. 6698) art. 9 and 10; product decisions in `docs/PLAN.md`, "KVKK notes".

### WhatsApp photos: groups are circles, communities are rounded squares (2026-11-09)
- **Symptom:** the new group photo showed light corners and a blurred frame; the dark-cornered fix then looked like a
  black tile on the community.
- **Cause:** groups crop to a circle, communities to a rounded square; if the crop is zoomed out WhatsApp shrinks the
  picture and fills the rest with a blurred copy. One file can't fit both.
- **Do:** group = badge filling the square on its ring colour; community = badge with margin on a real background
  (files and recipe: `docs/design/README.md`). Test in a throwaway group/community before asking Samet to change it.
- **Source:** found by testing (iltan's test group).

### Map link formats: what each share link carries (2026-11-21)
- **Symptom:** pasted map links do not all contain the place's coordinates; a route link even contains the sharer's own
  position.
- **Cause (spike, 2026-11-21):** Google short links (`maps.app.goo.gl/…?g_st=ac`) redirect once to (a) a place
  `/maps/place/<name, address>/data=!4m2!3m1!1s<feature id>…` with **no coordinates**, (b) a route
  `/maps/dir/<origin lat,lng>/<name>/data=…!3d<lat>!4d<lng>…` (destination in `!3d!4d`, the sharer's position as
  origin), or (c) a dropped pin `/maps/place/<name>/data=…!8m2!3d<lat>!4d<lng>…`. The `@lat,lng,17z` part is only the
  map viewport. Yandex `navi/org/<slug>/<id>` redirects to `maps/org/<slug>/<id>` (no coordinates); a Yandex route is
  `navi?rtext=<lat,lng>~<lat,lng>&…` (lat first, destination last); a Yandex pin (long-press, share) is
  `navi?whatshere[point]=<lng>,<lat>&ll=<lng>,<lat>&si=<id>`: **longitude first**, `ll` is only the map view, `si` is a
  sharing id. Place pages and OSM Nominatim do not give a venue's point reliably.
- **Do:** read a point only from a destination (`!3d!4d`, `rtext` last, `whatshere[point]`, `q`/`ll`/`coordinate`);
  never from `@` or a route origin (privacy: it is where the sharer stood). A link with no point becomes a venue link
  (normalised to the place path up to the `!1s` feature id; Yandex `maps/org/<slug>/<id>/`). Short links need a
  server-side redirect first, host-checked on every hop (`src/lib/events/place-input.ts`).
- **Source:** found by testing real share links.
