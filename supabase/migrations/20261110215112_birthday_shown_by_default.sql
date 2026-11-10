-- Birthday (day and month) is shown in the member directory unless the member turns it off (opt-out).
-- Decided by iltan after asking the members (2026-11-11); the privacy notice says so from version 2026-11-11-draft.
ALTER TABLE "public"."member_details"
  ALTER COLUMN "show_birthday" SET DEFAULT true;

-- Hand-written data step: switch it on for every existing member too (iltan's decision; they can turn it off).
-- The directory shows a birthday only when a birth date is stored, so rows without one stay hidden.
update public.member_details set show_birthday = true where not show_birthday;
