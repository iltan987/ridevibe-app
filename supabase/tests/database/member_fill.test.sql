-- Run with: pnpm db:test
-- Copying birth date, Instagram, photo consent and a bike from the approved application into the member.
begin;
create extension if not exists pgtap with schema extensions;

select plan(20);

-- ---------------------------------------------------------------------------
-- Fixtures (pending accounts unless noted)
--   161 linked application, full data      162 already decided photo consent (false) before approval
--   163 application without a bike         165 already has a bike
--   164 active, no application (link target)   16d decider
-- Applications: 171→161, 172→162, 173→163, 175→165, 174 unlinked approved (for 164),
--   176 unlinked approved matching the sign-in email of user 166 (inserted later)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000016d', 'fill-decider@pgtap.invalid', '{"full_name": "Deniz Decider"}'),
  ('00000000-0000-0000-0000-000000000161', 'fill-one@pgtap.invalid', '{"full_name": "Bir Üye"}'),
  ('00000000-0000-0000-0000-000000000162', 'fill-two@pgtap.invalid', '{"full_name": "İki Üye"}'),
  ('00000000-0000-0000-0000-000000000163', 'fill-three@pgtap.invalid', '{"full_name": "Üç Üye"}'),
  ('00000000-0000-0000-0000-000000000164', 'fill-four@pgtap.invalid', '{"full_name": "Dört Üye"}'),
  ('00000000-0000-0000-0000-000000000165', 'fill-five@pgtap.invalid', '{"full_name": "Beş Üye"}');

insert into public.roles (id, name) values ('00000000-0000-0000-0000-0000000001e6', 'pgtap-fill-decider');
insert into public.role_permissions (role_id, permission) values
  ('00000000-0000-0000-0000-0000000001e6', 'applications.view'),
  ('00000000-0000-0000-0000-0000000001e6', 'applications.decide');
update public.profiles set role_id = '00000000-0000-0000-0000-0000000001e6', status = 'active'
  where id = '00000000-0000-0000-0000-00000000016d';
update public.profiles set status = 'active' where id = '00000000-0000-0000-0000-000000000164';

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.apply(
  app_id uuid, app_email text, app_status public.application_status, app_profile uuid,
  owns boolean default true, brand text default 'Yamaha', model text default 'MT-07'
) returns void language sql as $$
  insert into public.applications (
    id, status, profile_id, full_name, phone, email, birth_date, instagram, district, side, languages, license_class,
    riding_years, owns_motorcycle, motorcycle_brand, motorcycle_model, motorcycle_cc, riding_styles, group_experience,
    in_other_clubs, heard_from, event_interests, expectations, alienating_behaviors, consent_privacy, consent_rules,
    consent_photos, privacy_notice_version, created_at
  ) values (
    app_id, app_status, app_profile, 'Aday Kişi', '+905321234567', app_email, '1995-05-17', 'rider.one', 'Kadıköy',
    'asian', array['tr'], 'a2', 3, owns, case when owns then brand end, case when owns then model end,
    case when owns then 689 end, array['city'], 'some', false, 'friend', array['day_rides'],
    'Güvenli grup sürüşleri.', 'Tehlikeli sürüş.', true, true, true, 'v-app', timestamptz '2026-01-01 10:00+00'
  );
$$;

create function pg_temp.bikes(uid uuid) returns text language sql as $$
  select coalesce(string_agg(brand || ' ' || model || ' ' || coalesce(cc::text, '-'), ', ' order by created_at), 'none')
  from public.member_motorcycles where profile_id = uid;
$$;

-- Member 162 decided on photo consent (declined) before approval.
update public.member_details set consent_photos = true, consent_photos_version = 'v-own'
  where profile_id = '00000000-0000-0000-0000-000000000162';
update public.member_details set consent_photos = false
  where profile_id = '00000000-0000-0000-0000-000000000162';
-- Member 165 already listed a bike.
insert into public.member_motorcycles (profile_id, brand, model, cc)
  values ('00000000-0000-0000-0000-000000000165', 'Honda', 'CB500', 471);

select pg_temp.apply('00000000-0000-0000-0000-000000000171', 'fill-one@pgtap.invalid', 'new', '00000000-0000-0000-0000-000000000161');
select pg_temp.apply('00000000-0000-0000-0000-000000000172', 'fill-two@pgtap.invalid', 'new', '00000000-0000-0000-0000-000000000162');
select pg_temp.apply('00000000-0000-0000-0000-000000000173', 'fill-three@pgtap.invalid', 'new', '00000000-0000-0000-0000-000000000163', false);
select pg_temp.apply('00000000-0000-0000-0000-000000000175', 'fill-five@pgtap.invalid', 'new', '00000000-0000-0000-0000-000000000165');
select pg_temp.apply('00000000-0000-0000-0000-000000000174', 'fill-icloud@pgtap.invalid', 'approved', null);
select pg_temp.apply('00000000-0000-0000-0000-000000000176', 'fill-signin@pgtap.invalid', 'approved', null);

-- Approve the linked applications (activation runs in the trigger).
update public.applications set status = 'approved'
  where id in ('00000000-0000-0000-0000-000000000171', '00000000-0000-0000-0000-000000000172',
               '00000000-0000-0000-0000-000000000173', '00000000-0000-0000-0000-000000000175');

-- 1. Full copy
select is(
  (select birth_date::text || '|' || instagram from public.member_details
    where profile_id = '00000000-0000-0000-0000-000000000161'),
  '1995-05-17|rider.one', 'approval copies birth date and Instagram');
select is(
  (select consent_photos::text || '|' || consent_photos_at::text || '|' || consent_photos_version
    from public.member_details where profile_id = '00000000-0000-0000-0000-000000000161'),
  'true|2026-01-01 10:00:00+00|v-app', 'approval copies photo consent with the application time and notice version');
select is(pg_temp.bikes('00000000-0000-0000-0000-000000000161'), 'Yamaha MT-07 689', 'approval adds the bike');
select is((select status::text from public.profiles where id = '00000000-0000-0000-0000-000000000161'),
  'probation', 'the account is in ön alım');

-- 2. Idempotent, and never overwrites member edits
update public.member_details set instagram = 'edited.one' where profile_id = '00000000-0000-0000-0000-000000000161';
select private.fill_member_from_application('00000000-0000-0000-0000-000000000161', '00000000-0000-0000-0000-000000000171');
select is(pg_temp.bikes('00000000-0000-0000-0000-000000000161'), 'Yamaha MT-07 689', 're-running adds no second bike');
select is((select instagram from public.member_details where profile_id = '00000000-0000-0000-0000-000000000161'),
  'edited.one', 're-running keeps a member-edited Instagram');

-- 3. Existing photo decision stays
select is(
  (select consent_photos::text || '|' || consent_photos_version from public.member_details
    where profile_id = '00000000-0000-0000-0000-000000000162'),
  'false|v-own', 'an earlier photo-consent decision is kept');
select is(
  (select birth_date::text from public.member_details where profile_id = '00000000-0000-0000-0000-000000000162'),
  '1995-05-17', 'the other empty fields are still filled');

-- 4. No bike without owns_motorcycle
select is(pg_temp.bikes('00000000-0000-0000-0000-000000000163'), 'none', 'owns_motorcycle = false adds no bike');

-- 5. A member who already has a bike gets none added
select is(pg_temp.bikes('00000000-0000-0000-0000-000000000165'), 'Honda CB500 471', 'an existing bike list is left alone');

-- 6. Blank brand after trimming adds nothing (helper called directly: the application's checks
--    allow whitespace-only text).
select pg_temp.apply('00000000-0000-0000-0000-000000000177', 'fill-blank@pgtap.invalid', 'approved', null,
  true, '   ', 'MT-07');
select private.fill_member_from_application('00000000-0000-0000-0000-000000000163', '00000000-0000-0000-0000-000000000177');
select is(pg_temp.bikes('00000000-0000-0000-0000-000000000163'), 'none', 'a blank brand adds no bike');

-- 7. Sign-in after approval fills too
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000166', 'fill-signin@pgtap.invalid', '{"full_name": "Altı Üye"}');
select is((select status::text from public.profiles where id = '00000000-0000-0000-0000-000000000166'),
  'probation', 'sign-in matched the approved application');
select is(
  (select birth_date::text || '|' || instagram || '|' || consent_photos::text from public.member_details
    where profile_id = '00000000-0000-0000-0000-000000000166'),
  '1995-05-17|rider.one|true', 'sign-in after approval copies details and consent');
select is(pg_temp.bikes('00000000-0000-0000-0000-000000000166'), 'Yamaha MT-07 689', 'sign-in after approval adds the bike');

-- 8. link_application to an active account fills its empty details
select is(pg_temp.bikes('00000000-0000-0000-0000-000000000164'), 'none', 'before linking: no bike');
select pg_temp.login('00000000-0000-0000-0000-00000000016d');
select public.link_application('00000000-0000-0000-0000-000000000174', '00000000-0000-0000-0000-000000000164');
reset role;
select is(
  (select birth_date::text || '|' || instagram || '|' || consent_photos::text from public.member_details
    where profile_id = '00000000-0000-0000-0000-000000000164'),
  '1995-05-17|rider.one|true', 'linking an approved application to an active account fills its details');
select is(pg_temp.bikes('00000000-0000-0000-0000-000000000164'), 'Yamaha MT-07 689', 'linking adds the bike');

-- 9. Nobody can call the helper directly
select is(
  (select has_function_privilege('authenticated', 'private.fill_member_from_application(uuid, uuid)', 'execute')
       or has_function_privilege('anon', 'private.fill_member_from_application(uuid, uuid)', 'execute')),
  false, 'the helper is not executable by anon or authenticated');

-- 10. Creation rows: a profile without a details row gets one (upsert)
delete from public.member_details where profile_id = '00000000-0000-0000-0000-000000000163';
select private.fill_member_from_application('00000000-0000-0000-0000-000000000163', '00000000-0000-0000-0000-000000000173');
select is(
  (select birth_date::text || '|' || consent_photos::text || '|' || consent_photos_at::text
    from public.member_details where profile_id = '00000000-0000-0000-0000-000000000163'),
  '1995-05-17|true|2026-01-01 10:00:00+00', 'a missing details row is created and filled');
select is((select count(*)::int from public.member_details where profile_id = '00000000-0000-0000-0000-000000000163'),
  1, 'exactly one details row');

select * from finish();
rollback;
