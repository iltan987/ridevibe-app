# Application Form — Spec

Source of truth for the public application form and its database table. Status: **draft v2**, agreed in principle,
pending Samet's review. Labels will be translated (TR default, EN).

Principles: keep it short (Instagram visitors drop off on long forms), collect only what is needed to evaluate an
applicant (KVKK data minimisation). Safety data (emergency contact, blood type, plate) is collected **after approval**,
in the member profile.

## 1. About you

| Field | Type | Required | Notes |
|---|---|---|---|
| Full name | text | yes | |
| Phone (WhatsApp) | phone, default +90 | yes | Used for the WhatsApp invite on approval |
| Email | email | yes | Should match the Google account they sign in with later |
| Birth date | date | yes | Must be 18+. Purpose (age check, birthday greetings) stated in privacy notice. Members can hide their birthday from other members |
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
| Motorcycle brand, model, engine (cc) | text + number | if owns | |
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
| What do you expect from the club? | short text | yes | Replaces a generic "why do you want to join" |
| What behaviours in a community would alienate you? | short text | yes | Kept from the current Google Form |

## 4. Consents (separate checkboxes, never pre-ticked)

| Consent | Required | Notes |
|---|---|---|
| I have read the privacy notice (aydınlatma metni) | yes | Acknowledgement, links to the notice |
| I accept the club rules | yes | Links to rules |
| Photo consent — photos of me may be shared in club galleries | no | Explicit consent (açık rıza), revocable from profile |

## Stored automatically

Submission time, form language, UTM source/medium/campaign/content, status (`new` → `contacted` → `approved` /
`rejected`), admin notes, reviewer.
