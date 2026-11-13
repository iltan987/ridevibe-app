# SEO round 2: home-page content — design

Date: 2026-11-13 · Status: **approved by iltan (2026-11-13)** · Backlog item: "SEO round 2: home content" in
`docs/follow-ups.md` (Next up). Round 1 (technical): `2026-11-13-seo-technical-design.md`.

## Intent

People in Istanbul looking for a motorcycle club (e.g. "İstanbul motosiklet kulübü") should land on a home page that
tells them what Ride & Vibe is, what the rides look like, who can join and how — and then apply. Today `/` is a
one-screen hero (badge, "Birlikte sürelim.", two buttons). Google ranks pages by helpful, first-hand content, so real
club information plus real photos is the bigger ranking lever after round 1; it also answers what newcomers ask Samet
in DMs.

**Done when:** `/` and `/en` show the sections below with the four photos, in both themes, at 390 px and desktop; the
page is still prerendered (static shell; only the Başvur buttons stream); the SEO check passes on production; the
privacy notice covers photos on the public website.

## Sources

- Club facts and Samet's answers: `docs/content/home-page-questions.md` (iltan and Samet, 2026-11-13).
- Layout: mockup "A, revised (v3)" chosen in the browser (2026-11-13). The final mockup HTML is copied to
  `docs/design/mockups/home-content-a-v3.html` (with the photo references pointing nowhere; layout only).

## Decisions (iltan, 2026-11-13)

- **Layout A: photo hero.** The coastal-road photo fills the first screen behind the title; below it, text sections,
  each paired with one photo; a closing photo and a final "Kulübe Başvur". Chosen over B (today's badge hero + a
  swipeable photo strip; photos easy to skip) and C (badge hero + photo pairs per section; pairs too small on a phone).
- **Photos: 4 of the 10** iltan sent (`C:\Users\iltan\Desktop\abc1234`, WhatsApp images 2026-11-13):
  | Use | File (`WhatsApp Image 2026-11-13 at …`) | Content |
  |---|---|---|
  | Hero | `20.58.11 (1).jpeg` | selfie on a coastal road, sea behind, helmets and bikes |
  | Rides section | `20.58.12 (3).jpeg` | night selfie at Üsküdar with Kız Kulesi |
  | Who can join | `20.58.11.jpeg` | group photo on a café terrace, women in the group |
  | Closing | `20.58.12.jpeg` | long breakfast table at Kanlıca Teras |

  Left out: `20.58.13 (1)` (blurry copy of Kız Kulesi), `20.58.13` / `20.58.13 (3)` (tilted copies of the Glob Coffee
  photo, strangers on the pavement), the football photo (not riding). `20.58.12 (2)` (Glob Coffee) and
  `20.58.12 (1)` (small café table; a stranger visible through the glass) are good but unused: candidates for the
  gallery later, not committed now.
- **Consent:** everyone in these photos agreed to their publication **on the public website**, in writing (club
  WhatsApp; iltan confirmed 2026-11-13). The club keeps that message as proof (outside the repo). The in-app photo
  consent covers only the members' gallery, so it is *not* the basis here.
- **Share image stays the badge** (`src/app/[locale]/opengraph-image.jpg`). A group photo was compared side by side:
  at chat size it turns into a crowd of small faces, and messengers cache previews on their own servers, so a later
  consent withdrawal couldn't remove faces from previews already shared.
- **Copy rules from iltan's review:** no "ücretsiz üyelik" (every club is free; obvious), no "kahve(de)" (reads as the
  old men's tea house), no "sohbet" (religious gatherings), no "who pays for breakfast" (sounds transactional). The
  current hero subtitle's "kahve buluşmaları" goes too. Not every ride is open to everyone: some events may have
  conditions (e.g. bike class), and people in ön alım join only some rides.
- **FAQ facts confirmed by iltan:** the convoy pace suits everyone and nobody is left behind; rides are for members;
  ön alım members can join some rides.

## Claude's calls (correct if wrong)

- **Member count is fixed text** ("140+"), updated by hand. A live count would need a cached read that bypasses RLS
  (the anon key can't count members) for little gain; "140+" stays true while the club grows.
- **"Etkinlikleri Gör" leaves the hero.** `/events` is an empty `noindex` page; it comes back with Events.
- **Photos live in the repo** (`src/assets/home/`, private repo) as static imports for `next/image` (responsive
  sizes, automatic blur placeholder, `preload` for the hero). Prepared once with sharp from Next's own dependency:
  `.rotate()` (apply EXIF orientation), longest side unchanged (the WhatsApp originals are 1600 × 1200, 1200 × 1600
  and 1536 × 2048 for the terrace photo; never upscale), JPEG quality ~85, metadata stripped (sharp's default). Not
  `public/` (no sizing or blur), not Blob (overkill for four fixed files).
- **Only consenting people stay recognisable** (builder check): nobody outside the club group is recognisable. The
  Kanlıca photo is cropped to a wide strip around the long table (1200 × 760 from y = 640) and the other diners on the
  right are soft-blurred; the passers-by at the far left of the Kız Kulesi photo are soft-blurred. Blur instead of a
  crop because cropping them out would cut through members (the red-shirt man; the front man's head). The prepared
  files were checked by iltan before committing; `object-position` only fine-tunes.
- **Name patches on jackets stay as they are** (iltan, 2026-11-13): the people consented to the photo as it is; a
  blur would add nothing.
- **The hero is always dark**: the hero `<section>` carries the `dark` class, so the tokens and `dark:` variants
  resolve to the night palette inside it (`.dark { … }` and `@custom-variant dark (&:is(.dark *))` in `globals.css`);
  cream text on the photo's dark gradient in both themes. The sections below follow the theme.
- **Alt texts describe the scene, never names** (they are also image-search text).
- **No JSON-LD change** (no `image` on the Organization: faces in structured data would spread them further).
- **FAQ is plain visible text**, no FAQ markup (Google removed FAQ rich results, 2026-05-07).
- **Meta description** loses "kahve buluşmaları" like the hero (copy below).

## Non-goals

- New share image, gallery, events on the home page (PLAN step 3/4 puts upcoming events and announcements there later).
- Changing the in-app photo consent or the gallery consent flow.
- A members-only home page: signed-in members see the same page (the Başvur buttons hide as today).

## Anti-goals (a failure even if it "works")

- `/` turning dynamic (check the build output: `/[locale]` stays `◐`/prerendered with only the Başvur boundaries
  streaming).
- A photo nobody consented to, or a stranger's recognisable face, on the page.
- Copy that glamorises speed or racing (Samet's rule), or reads as translated/odd to a native reader.
- A heavy first screen: the hero photo is the LCP element and must be preloaded and sized (no 1600 px image on a
  390 px phone).
- Photo metadata (GPS, device) shipped to visitors.

## Page structure and copy

Turkish is the source (`messages/tr.json`, namespace `Home`); English is Claude's translation, reviewed by iltan with
the implementation. Copy below is final for Turkish unless iltan edits it in review. Key names are the builder's.

### 1. Hero (full-bleed photo, always dark)
- Photo: hero photo, `object-cover`; on phones (≈390 × 560 px frame) the crop keeps the group and the sea
  (`object-position` ≈ 38% 50%); on desktop the full width, text on the darker left side (gradient left→right plus a
  fade into the page at the bottom). Height: ~560 px phone, ~720 px desktop (builder tunes).
- Small `ClubBadge` (~64 px phone, ~84 px desktop) above the eyebrow.
- Eyebrow: **İstanbul Motosiklet Kulübü**
- `h1`: **Birlikte sürelim.**
- Subtitle: **Hafta sonu sürüşleri, uzun turlar ve yeni dostluklar. Asya'dan Avrupa'ya, İstanbul'un her yakasından
  motorcularla tanış.**
- Button: **Kulübe Başvur** (the existing `HeroApplyGuess` / `HeroApplyForUser` pair in one `Suspense`, unchanged).

### 2. Stats row (three small cards)
- **140+** · üye
- **Her hafta** · sürüş
- **İki yaka** · Asya ve Avrupa

### 3. Rides — photo: Kız Kulesi
- Eyebrow: **Sürüşler** · `h2`: **Hafta sonu yolda, hafta içi bir arada**
- **Hava uygunsa her hafta sonu toplu sürüşe çıkıyoruz: Şile, Ağva, Riva, Polonezköy ve İstanbul çevresindeki doğal
  rotalar. Rotaya göre yarım ya da tam gün sürüyor; ara sıra birkaç günlük turlar da planlıyoruz.**
- **Hafta içi yakın oturanlarla bir kafede buluşup muhabbet ediyoruz, çoğu zaman deniz kenarında.**
- Chips: **Beşiktaş · Üsküdar · Kadıköy · Beykoz**
- Alt: "Gece Üsküdar sahilinde kulüp üyeleri, arkada Kız Kulesi"

### 4. Who can join — photo: terrace group
- Eyebrow: **Kimler katılabilir** · `h2`: **18 yaşını geçen herkes**
- **50cc'den 1000cc'ye her motor, her ehliyet. Yeni başlayanlar, kadın sürücüler ve motoru olmayan artçılar da
  aramızda.**
- **Bazı etkinliklerde motor sınıfı gibi katılım koşulları olabilir.**
- Alt: "Bir sürüş molasında kafe terasında toplu fotoğraf"

### 5. How to join (numbered steps)
- Eyebrow: **Nasıl katılırım** · `h2`: **Başvurudan ana gruba**
1. **Başvur** — Birkaç dakikalık formu doldur.
2. **Onay** — Kulüp ekibi başvurunu inceler.
3. **Ön alım** — Birkaç gün ayrı bir grupta birbirimizi tanırız.
4. **Ana grup** — Artık ailedensin. (Mockup said "ailedesin"; "ailedensin" = "you're family", Claude's call.)

### 6. Riding rules (card)
- Eyebrow / `h2`: **Sürüş kurallarımız**
- **Kask zorunlu; mont, eldiven ve bot öneriyoruz. Konvoy düzenini koruyoruz: güvenli mesafe, izinsiz sollama yok.
  Trafik kurallarına uyuyor, birbirimize saygıyla davranıyoruz.**
- Emphasised: **Amacımız hızlı gitmek değil; hep birlikte gidip hep birlikte dönmek.**

### 7. FAQ
- `h2`: **Sık sorulanlar** (questions as `h3` or `dt`; builder's call)
- **Motorum yok, katılabilir miyim?** — Evet, artçı olarak katılabilirsin.
- **Yeni başladım, sorun olur mu?** — Hayır. Konvoyda tempo herkese göre ayarlanır; kimse geride kalmaz.
- **Sürüşlere üye olmadan katılabilir miyim?** — Sürüşler üyelere açık. Başvurunu yap; onaydan sonra ön alım
  grubundayken bazı sürüşlere katılabilirsin.

### 8. Closing — photo: Kanlıca breakfast (full width)
- Line: **Aynı yolu paylaşan insanlarla bir aile.**
- Button: **Kulübe Başvur** (same guess/streamed pair as the hero; hidden the same way for members and open
  applicants).
- Alt: "Kanlıca'da toplu kahvaltıda kulüp üyeleri"

### Metadata
- `Metadata.description`: **İstanbul'un motosiklet kulübü. Hafta sonu sürüşleri, uzun turlar ve yeni dostluklar;
  18 yaşını geçen her motorcuya açık. Kulübe başvur.** (≈ 140 characters; English to match.) Title unchanged.

### Desktop
Sections 3–4 become two columns (text | photo, alternating sides), 5–6 sit side by side (steps | rules card), FAQ
max ~720 px wide, all inside the page's usual `max-w-5xl` container; hero and closing photo are full width. The
1600 px originals look slightly soft on very wide screens under the gradient; accepted.

## Privacy notice

The notice (`src/app/[locale]/privacy/content-{tr,en}.tsx`, "siz" register) mentions photos only for the members'
gallery. Add, in the matching sections:
- §2 "Görsel veriler": photos showing you may also be published on the club's public website (home page) when you
  agreed to that.
- §3 purposes: introducing the club on its public website with ride/event photos, with your explicit consent.
- §4 legal basis: açık rıza (KVKK m.5/1) for the website photos, given separately; withdraw any time by writing to the
  club, the photo is then removed.
- Retention (§ "how long"): website photos stay until consent is withdrawn or the photo is replaced.

`PRIVACY_NOTICE_VERSION` is `2026-11-13-draft-4`, already deployed → bump to `…-draft-5`.

**Removal on a withdrawal** (decided by iltan 2026-11-13: photos stay in git, history is rewritten on a withdrawal,
over keeping them in Vercel Blob). The procedure goes into CLAUDE.md's Production section next to "Deleting an
account", written so it can be followed months later:
1. Remove the photo from `src/assets/home/` and the page (or replace it), commit, deploy.
2. Purge it from all git history with `git filter-repo --path src/assets/home/<file> --invert-paths` and force-push
   `main` — a documented one-off exception to the merge-only rule (iltan does or approves the push; other clones must
   re-clone).
3. Delete the old Vercel deployments that still contain the photo (every deployment since it was added), unless
   they are only reachable behind Vercel Deployment Protection — the builder checks today's protection setting and
   writes the outcome into the procedure.
4. Request removal of the old image URL in Google Search Console ("Remove outdated content").
5. The original WhatsApp files stay on the club's side only (not in the repo); the unused photos are never committed.

## Testing and verification

- Unit: none new expected (no logic); `pnpm test` still passes (message parity TR/EN).
- `scripts/e2e/apply-nav-e2e.mjs` uses the hero's `/events` link to detect that the hero rendered (`main
  a[href$="/events"]`, ~line 52): replace that anchor (e.g. a `data-` attribute on the hero) and keep the
  "Başvur shown exactly when /apply shows the form" checks for both Başvur buttons.
- Build output: `/[locale]` stays prerendered.
- Browser check at 390 px and 1280 px, dark and light, TR and EN: hero crop, text contrast on the photo, no layout
  shift when photos load (static imports give width/height), hero photo preloaded and the served width fits the
  viewport.
- `node scripts/e2e/seo-check.mjs` locally, and with `BASE=https://ridevibe.com.tr` after the deploy; then request
  re-indexing of `/` in Search Console (iltan).
- Docs: `docs/content/home-page-questions.md` records the final copy decisions; remove the "SEO round 2" item from
  `docs/follow-ups.md`; add follow-ups for anything deferred (e.g. gallery candidates, live member count).

## Left to the builder

Component split under `src/components/home/`, exact spacing/heights, gradient values, `sizes` attributes, FAQ markup
(`dl` vs headings), English copy (iltan reviews), message key names.
