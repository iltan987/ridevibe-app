# Application Form — Spec

Source of truth for the public application form and its database table. Status: **draft v2**, agreed in principle,
pending Samet's review; shown to applicants in 4 steps since 2026-11-11 (see "Steps"). Labels will be translated (TR default, EN).

Principles: keep it short (Instagram visitors drop off on long forms), collect only what is needed to evaluate an
applicant (KVKK data minimisation). Safety data (emergency contact, blood type, plate) is collected **after approval**,
in the member profile.

## Steps (since 2026-11-11)

The sections below keep the review order (admin view, approval). The public form shows the same fields in four steps,
**easy first**: tap-only questions before typing, contact data last, after people have invested. The step map is
`src/lib/applications/steps.ts` (every schema input field belongs to exactly one step; a unit test checks it).

| Step | Title (TR) | Fields |
|---|---|---|
| 1 `riding` | Sürüş | license class, riding years, owns a motorcycle, brand/model/cc, riding styles, group experience |
| 2 `club` | Kulüp | other clubs (+ names), how they heard (+ referrer), events (+ other) |
| 3 `words` | Kendi sözlerinle | expectations, alienating behaviours, disagreement handling |
| 4 `you` | Seni tanıyalım | Google fill, name, phone, email, birth date, city, district, Instagram, languages; sub-heading "Onaylar": the three consents; submit |

- One `<form>` keeps every field mounted; inactive steps are `hidden`, so the server action, schema and honeypot are
  unchanged. Header: "Adım N/4 · title" with a progress bar.
- "Devam" validates the whole form but only shows the current step's errors (focus goes to the first invalid field).
  The final submit jumps to the earliest step with an error; server-side field errors jump to their step too.
- `?step=N` (1-4) in the URL via the History API; back/forward move between steps; invalid or missing means step 1.
- The three writing questions ask for "one short sentence": min. 15 characters, max 1000, two-row textareas.

## Draft (browser only)

- Answers of steps 1-3 are saved in the applicant's own `localStorage` (key `rv-apply-draft`, `{ v: 1, savedAt, step,
  fields, utm }`) after a change or step change, once at least one answer exists. Contact details and consents are
  never stored (whitelist derived from the step map, `src/lib/applications/draft.ts`). UTM values are kept so ad
  attribution survives a Google round trip; UTM parameters in the URL win.
- On the next visit the form restores the draft, opens at the saved step (unless the URL names one) and shows
  "Kaldığın yerden devam ediyorsun · Baştan başla"; "Baştan başla" deletes the draft and empties the form.
- The draft is deleted after a successful submit and ignored and deleted when it is older than 7 days, malformed or of
  another version. Without usable `localStorage` the form works without a draft. Nothing reaches our servers.
- The privacy notice says so in one sentence under technical data (`PRIVACY_NOTICE_VERSION` bumped).

## Google fill (step 4)

Signed-out visitors outside in-app browsers see "Google ile doldur" at the top of step 4 (hidden for signed-in users
and in in-app browsers, where Google refuses sign-in). Tap: the draft is saved with step 4, then the existing
`signInWithGoogle` action runs with `next` = `/apply?step=4` (locale-aware). Back on `/apply` the gate prefills name
and email and the draft restores steps 1-3.

## 1. About you

| Field | Type | Required | Notes |
|---|---|---|---|
| Full name | text | yes | Hint: first and last name as on the ID (staff can correct it; the member profile takes the name from the approved application) |
| Phone (WhatsApp) | phone, default +90 | yes | Used for the WhatsApp invite on approval. Turkish numbers must be mobile (`+905` + 9 digits), enforced in the form and by a DB trigger on insert / phone change |
| Email | email | yes | Hint: they sign in with Google, so use that Google account's email. Non-blocking note under the field when the domain isn't gmail.com/googlemail.com (not shown when it equals the signed-in user's own email) |
| Birth date | date | yes | Must be 18+. Purpose (age check, birthday greetings) stated in privacy notice. Shown to other members (day and month) by default; members can hide it on `/account` |
| City | select, default Istanbul | yes | Editable |
| District | select (Istanbul districts) / text for other cities | yes | |
| Side | Asian / European | auto | Derived from district for Istanbul |
| Instagram username | text | no | |
| Languages spoken | multi-select: TR, EN, other | yes | Club has foreign members |

## 2. Riding

| Field | Type | Required | Notes |
|---|---|---|---|
| License class | select: A1 / A2 / A / not yet | yes | |
| Years of riding | number / range select | yes | |
| Owns a motorcycle | yes/no | yes | |
| Motorcycle brand, model, engine (cc) | text + number | if owns | Brand is free text with a `<datalist>` of common brands in Turkey (`MOTORCYCLE_BRAND_SUGGESTIONS` in `options.ts`) |
| Riding style | multi-select: city, touring, enduro/off-road, sport, cruiser, scooter | yes | |
| Group riding experience | none / some / a lot | yes | |

## 3. You and the club

| Field | Type | Required | Notes |
|---|---|---|---|
| Member of other motorcycle clubs/groups? | yes/no | yes | |
| Which clubs? | text | if yes | |
| How did you hear about us? | Instagram ad / Instagram (other) / friend / other | yes | UTM params from the ad link are stored automatically too |
| Referring member | text | if "friend" | |
| Events you'd like to join | multi-select: weekend day rides, multi-day tours, camping, breakfast/coffee meetups, riding & safety training, off-road days, track days, maintenance workshops, social/charity rides | yes | Drives event planning |
| What do you expect from the club? | short text | yes | Replaces a generic "why do you want to join". Min. 15 characters; example placeholder |
| What behaviours in a community would alienate you? | short text | yes | Kept from the current Google Form. Min. 15 characters, no placeholder (screening question) |
| How would you handle a disagreement with another group member during an event? | short text | yes | Added 2026-11-10 at Samet's request; DB column nullable (older applications have no answer). Min. 15 characters, no placeholder |

## 4. Consents (separate checkboxes, never pre-ticked)

| Consent | Required | Notes |
|---|---|---|
| I have read the privacy notice (aydınlatma metni) | yes | Acknowledgement, links to the notice |
| I accept the club rules | yes | Links to rules |
| Photo consent — photos of me may be shared in club galleries | no | Explicit consent (açık rıza), revocable from profile |

## Signed-in applicants and the success screen

The form stays open to anonymous visitors. If the visitor is signed in, name and email are prefilled (editable) and the
application is stored with `profile_id` = their account, so approval activates that account regardless of the email
typed. An active member sees "already a member", an inactive one "membership inactive, message us on WhatsApp"; a
pending account with an open application sees "under review". After an anonymous submit the success screen repeats the
email ("after approval you sign in with the Google account for x@…; if wrong, message us on WhatsApp"); after a
signed-in submit it says "once approved, this account becomes active automatically". Staff can correct name, phone and
email afterwards and link an application to an account by hand; the application page shows the linked account's
sign-in email and warns when it differs from the application email.

## After approval

On approval, birth date, Instagram, photo consent and the motorcycle are copied to the member profile; photo consent
is then changed on `/account`.

## Stored automatically

Submission time, form language, UTM source/medium/campaign/content, status (`new` → `contacted` → `approved` /
`rejected`), admin notes, reviewer.
