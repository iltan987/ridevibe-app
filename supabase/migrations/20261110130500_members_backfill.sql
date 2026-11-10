-- Members backfill (hand-written DML; declarative schemas do not track data).
-- Existing accounts predate member_details, member_motorcycles and name tidying:
--   1. every profile gets a member_details row (handle_new_user only covers new sign-ups);
--   2. each profile with a linked approved application gets birth date, Instagram, photo
--      consent and a first bike from its newest approved application (fills gaps only);
--   3. applicant names are tidied ("kerim çelik" -> "Kerim Çelik");
--   4. profile names likewise.
-- Idempotent: every step only fills nulls or touches rows whose result would change.
-- Preview the name changes on production first: scripts/sql/name-tidy-preview.sql.

insert into public.member_details (profile_id)
select id from public.profiles
on conflict (profile_id) do nothing;

select private.fill_member_from_application(newest.profile_id, newest.id)
from (
  select distinct on (profile_id) id, profile_id
  from public.applications
  where status = 'approved' and profile_id is not null
  order by profile_id, reviewed_at desc nulls last, created_at desc
) newest;

update public.applications
set full_name = private.tidy_name(full_name, private.uses_turkish_casing(full_name, locale))
where full_name is distinct from private.tidy_name(full_name, private.uses_turkish_casing(full_name, locale));

update public.profiles
set full_name = private.tidy_name(full_name, private.uses_turkish_casing(full_name, preferred_locale))
where full_name is distinct from private.tidy_name(full_name, private.uses_turkish_casing(full_name, preferred_locale));
