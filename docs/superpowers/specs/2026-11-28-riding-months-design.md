# Riding months for newer riders: design (short)

Date: 2026-11-28. Size: small change. Status: approved by iltan 2026-11-28.

## Why

Applicants who have ridden for less than a year can't answer "Kaç yıldır motosiklet kullanıyorsun?" honestly: the
form takes whole years only, so 5 months becomes either "0" (reads as "never") or "1" (not true). The main goal is an
honest answer; staff seeing how new a rider is comes as a bonus.

## Approaches

- **A. Ask months when the years answer is 0 (picked by iltan).** One extra field that only riders under a year see;
  staff read "5 ay".
- B. Copy only: a hint "1 yıl dolmadıysa 0 yaz", staff see 0 as "1 yıldan az". No schema change, but typing 0 still
  feels like "never" and staff can't tell 1 month from 11.
- C. Ask the start month and year. Most precise, but long-time riders rarely know the month and every existing answer
  would need a guessed conversion.

## Design

- **Form (step 1 `riding`):** the years field stays as it is. When its value is `0`, a required field "Kaç aydır?"
  appears right below it (whole number 0–11). Any other value hides it. Like the bike details (`owns_motorcycle`),
  it is validated only while shown and saved as `null` when hidden. It is part of step 1, so the browser draft keeps
  it.
- **Data:** new nullable `applications.riding_months smallint`, check `between 0 and 11`, and a row check that it
  is null unless `riding_years = 0`. The public insert grant gets the column. Zod requires it when `riding_years`
  is 0. Old rows keep `null`.
- **Staff view** (`/admin/applications/[id]`): years > 0 → "3 yıl" (as today); 0 with months → "5 ay" (0 months →
  "1 aydan az"); 0 without months (old rows) → "1 yıldan az" instead of "0 yıl".
- **Copy (my call):** TR label "Kaç aydır?", EN "How many months?"; staff strings "{months} ay" / "{months} months",
  "1 aydan az" / "Less than a month", "1 yıldan az" / "Less than a year".
- **Privacy notice:** unchanged (it says "sürüş deneyimi", which already covers months); no version bump.
- **Tests:** pgTAP (anon can insert the column; months 12, negative, or set with years > 0 are refused); unit tests
  for the schema rule and the staff label; `apply-e2e` covers years 0 → months shown, required, kept in the draft.
- **Docs:** `docs/application-form.md` step 1 lists riding months.
- **Rollout:** additive nullable column: `pnpm db:push`, then push `main`.

## Left to the builder

Exact component reuse in `apply-form.tsx` (follow the bike-details pattern) and the label helper's location.
