-- Run with: pnpm db:test
-- private.purge_deleted_accounts: after the 14-day grace period the account is deleted; its applications go too
-- (approved of an inactive account: kept 1 year, unlinked), rejected ones stay unlinked; expired kept applications go.
-- Also runs against production inside the rolled-back transaction: every assertion is scoped to fixture ids.
begin;
create extension if not exists pgtap with schema extensions;

select plan(41);

-- Fixtures (ids …07d1–…07d5, applications 7b-prefixed).
--   7d1 deleting 14 days (was active) with approved + rejected linked and a contacted unlinked application (same
--   email), details, bike, emergency contact, blood type; 7d2 deleting 13 days with a linked approved and an
--   unlinked same-email application; 7d3 deleting 14 days (was inactive) with a linked approved and an unlinked
--   same-email approved application; 7d4 active with an unlinked same-email application; 7d5 deleting 10 days
--   (was inactive) with a linked approved application.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000007d1', 'pgtap-purge-one@pgtap.invalid',   '{"full_name": "Pınar Bir"}'),
  ('00000000-0000-0000-0000-0000000007d2', 'pgtap-purge-two@pgtap.invalid',   '{"full_name": "Pelin Iki"}'),
  ('00000000-0000-0000-0000-0000000007d3', 'pgtap-purge-three@pgtap.invalid', '{"full_name": "Pamir Uc"}'),
  ('00000000-0000-0000-0000-0000000007d4', 'pgtap-purge-four@pgtap.invalid',  '{"full_name": "Pusat Dort"}'),
  ('00000000-0000-0000-0000-0000000007d5', 'pgtap-purge-five@pgtap.invalid',  '{"full_name": "Pınar Bes"}');

update public.profiles set status = 'active' where id = '00000000-0000-0000-0000-0000000007d4';
update public.profiles
  set status = 'deleting', deletion_requested_at = now() - interval '14 days', status_before_deletion = 'active'
  where id = '00000000-0000-0000-0000-0000000007d1';
update public.profiles
  set status = 'deleting', deletion_requested_at = now() - interval '13 days', status_before_deletion = 'active'
  where id = '00000000-0000-0000-0000-0000000007d2';
update public.profiles
  set status = 'deleting', deletion_requested_at = now() - interval '14 days', status_before_deletion = 'inactive'
  where id = '00000000-0000-0000-0000-0000000007d3';

update public.profiles
  set status = 'deleting', deletion_requested_at = now() - interval '10 days', status_before_deletion = 'inactive'
  where id = '00000000-0000-0000-0000-0000000007d5';

insert into public.member_motorcycles (profile_id, brand, model, cc)
  values ('00000000-0000-0000-0000-0000000007d1', 'Honda', 'CB650R', 650);
insert into public.member_emergency_contacts (profile_id, position, name, relationship, phone)
  values ('00000000-0000-0000-0000-0000000007d1', 1, 'Yakın Kişi', 'friend', '+905320000007');
insert into public.member_health (profile_id, blood_type, consent_blood_type, consent_blood_type_at, consent_blood_type_version)
  values ('00000000-0000-0000-0000-0000000007d1', '0-', true, '2020-01-01 00:00:00+00', 'old');

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.apply(app_id uuid, app_email text, app_status public.application_status, owner uuid)
returns void language sql as $$
  insert into public.applications (
    id, status, profile_id, full_name, phone, email, birth_date, district, side, languages, license_class,
    riding_years, owns_motorcycle, riding_styles, group_experience, in_other_clubs, heard_from, event_interests,
    expectations, alienating_behaviors, consent_privacy, consent_rules, privacy_notice_version
  ) values (
    app_id, app_status, owner, 'Aday Kişi', '+905321234567', app_email, '1995-05-17', 'Kadıköy', 'asian',
    array['tr'], 'a2', 3, false, array['city'], 'some', false, 'friend', array['day_rides'],
    'Güvenli grup sürüşleri.', 'Tehlikeli sürüş.', true, true, 'test'
  );
$$;

select pg_temp.apply('00000000-0000-0000-0000-0000000007b1', 'pgtap-purge-one@pgtap.invalid', 'approved',
  '00000000-0000-0000-0000-0000000007d1');
select pg_temp.apply('00000000-0000-0000-0000-0000000007b2', 'pgtap-purge-one@pgtap.invalid', 'rejected',
  '00000000-0000-0000-0000-0000000007d1');
select pg_temp.apply('00000000-0000-0000-0000-0000000007b3', 'pgtap-purge-one@pgtap.invalid', 'contacted', null);
select pg_temp.apply('00000000-0000-0000-0000-0000000007b4', 'pgtap-purge-three@pgtap.invalid', 'approved',
  '00000000-0000-0000-0000-0000000007d3');
select pg_temp.apply('00000000-0000-0000-0000-0000000007b5', 'pgtap-purge-expired@pgtap.invalid', 'approved', null);
select pg_temp.apply('00000000-0000-0000-0000-0000000007b6', 'pgtap-purge-future@pgtap.invalid', 'approved', null);
select pg_temp.apply('00000000-0000-0000-0000-0000000007b7', 'pgtap-purge-two@pgtap.invalid', 'approved',
  '00000000-0000-0000-0000-0000000007d2');
select pg_temp.apply('00000000-0000-0000-0000-0000000007b8', 'pgtap-purge-two@pgtap.invalid', 'contacted', null);
select pg_temp.apply('00000000-0000-0000-0000-0000000007b9', 'pgtap-purge-five@pgtap.invalid', 'approved',
  '00000000-0000-0000-0000-0000000007d5');
select pg_temp.apply('00000000-0000-0000-0000-0000000007ba', 'pgtap-purge-four@pgtap.invalid', 'contacted', null);
select pg_temp.apply('00000000-0000-0000-0000-0000000007bb', 'pgtap-purge-three@pgtap.invalid', 'approved', null);
update public.applications set retained_until = now() - interval '1 second'
  where id = '00000000-0000-0000-0000-0000000007b5';
update public.applications set retained_until = now() + interval '1 day'
  where id = '00000000-0000-0000-0000-0000000007b6';

-- Grants and schedule
select ok(
  not has_function_privilege('authenticated', 'private.purge_deleted_accounts(timestamptz)', 'execute'),
  'authenticated has no execute grant on purge_deleted_accounts'
);
select ok(
  not has_function_privilege('anon', 'private.purge_deleted_accounts(timestamptz)', 'execute'),
  'anon has no execute grant on purge_deleted_accounts'
);
select is(
  (select count(*)::int from pg_proc where proname = 'purge_deleted_accounts' and pronamespace = 'private'::regnamespace),
  1,
  'one purge_deleted_accounts signature'
);
select is(
  (select schedule from cron.job where jobname = 'purge-deleted-accounts'),
  '0 2 * * *',
  'the purge job runs daily at 02:00 UTC'
);
select is(
  (select command from cron.job where jobname = 'purge-deleted-accounts'),
  'select private.purge_deleted_accounts()',
  'the purge job calls the purge function'
);

select private.purge_deleted_accounts();

-- 7d1: was active, grace over
select is((select count(*)::int from auth.users where id = '00000000-0000-0000-0000-0000000007d1'), 0,
  'the due account is deleted from auth.users');
select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-0000000007d1'), 0,
  'the due account has no profile');
select is((select count(*)::int from public.member_contacts where profile_id = '00000000-0000-0000-0000-0000000007d1'), 0,
  'its contact row is gone');
select is((select count(*)::int from public.member_details where profile_id = '00000000-0000-0000-0000-0000000007d1'), 0,
  'its details are gone');
select is((select count(*)::int from public.member_motorcycles where profile_id = '00000000-0000-0000-0000-0000000007d1'), 0,
  'its motorcycles are gone');
select is((select count(*)::int from public.member_emergency_contacts where profile_id = '00000000-0000-0000-0000-0000000007d1'), 0,
  'its emergency contacts are gone');
select is((select count(*)::int from public.member_health where profile_id = '00000000-0000-0000-0000-0000000007d1'), 0,
  'its blood type is gone');
select is((select count(*)::int from public.applications where id = '00000000-0000-0000-0000-0000000007b1'), 0,
  'its approved application is deleted (account was active)');
select is((select count(*)::int from public.applications where id = '00000000-0000-0000-0000-0000000007b3'), 0,
  'its unlinked application with the same email is deleted');
select is((select count(*)::int from public.applications where id = '00000000-0000-0000-0000-0000000007b2'), 1,
  'its rejected application is kept');
select is((select profile_id from public.applications where id = '00000000-0000-0000-0000-0000000007b2'), null,
  'the kept rejected application is unlinked');
select is((select retained_until from public.applications where id = '00000000-0000-0000-0000-0000000007b2'), null,
  'the rejected application gets no deadline');

-- 7d2: still in the grace period
select is((select count(*)::int from auth.users where id = '00000000-0000-0000-0000-0000000007d2'), 1,
  'an account inside the grace period stays');
select is((select status::text from public.profiles where id = '00000000-0000-0000-0000-0000000007d2'), 'deleting',
  'and is still deleting');

-- 7d3: was inactive
select is((select count(*)::int from auth.users where id = '00000000-0000-0000-0000-0000000007d3'), 0,
  'the due inactive account is deleted');
select is((select count(*)::int from public.applications where id = '00000000-0000-0000-0000-0000000007b4'), 1,
  'the approved application of an inactive account is kept');
select is((select profile_id from public.applications where id = '00000000-0000-0000-0000-0000000007b4'), null,
  'and unlinked');
select is(
  (select retained_until from public.applications where id = '00000000-0000-0000-0000-0000000007b4'),
  (now() - interval '14 days') + interval '1 year',
  'and kept one year from the deletion request'
);

select is((select count(*)::int from public.applications where id = '00000000-0000-0000-0000-0000000007bb'), 1,
  'the unlinked approved application with the inactive account''s email is kept too');
select is(
  (select retained_until from public.applications where id = '00000000-0000-0000-0000-0000000007bb'),
  (now() - interval '14 days') + interval '1 year',
  'and kept one year from the deletion request'
);

-- Not due: nothing of 7d2 / 7d5 is touched
select is((select count(*)::int from public.applications where id in
  ('00000000-0000-0000-0000-0000000007b7', '00000000-0000-0000-0000-0000000007b8')), 2,
  'applications of an account inside the grace period stay');
select is((select profile_id from public.applications where id = '00000000-0000-0000-0000-0000000007b7'),
  '00000000-0000-0000-0000-0000000007d2'::uuid, 'and stay linked');
select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-0000000007d5'), 1,
  'an inactive account inside the grace period stays');
select is((select profile_id from public.applications where id = '00000000-0000-0000-0000-0000000007b9'),
  '00000000-0000-0000-0000-0000000007d5'::uuid, 'with its approved application still linked');
select is((select retained_until from public.applications where id = '00000000-0000-0000-0000-0000000007b9'), null,
  'and not yet kept');

-- 7d4 and kept applications
select is((select status::text from public.profiles where id = '00000000-0000-0000-0000-0000000007d4'), 'active',
  'an active account is untouched');
select is((select count(*)::int from public.applications where id = '00000000-0000-0000-0000-0000000007ba'), 1,
  'an unlinked application with the email of an account that is not deleting survives');
select is((select count(*)::int from public.applications where id = '00000000-0000-0000-0000-0000000007b5'), 0,
  'an expired kept application is deleted');
select is((select count(*)::int from public.applications where id = '00000000-0000-0000-0000-0000000007b6'), 1,
  'a kept application not yet expired stays');

-- Cancelled deletions are not purged
select pg_temp.login('00000000-0000-0000-0000-0000000007d2');
select public.cancel_my_account_deletion();
reset role;
select private.purge_deleted_accounts(now() + interval '2 days');
select is((select status::text from public.profiles where id = '00000000-0000-0000-0000-0000000007d2'), 'active',
  'a cancelled deletion is not purged later');
select is((select count(*)::int from public.applications where id in
  ('00000000-0000-0000-0000-0000000007b7', '00000000-0000-0000-0000-0000000007b8')), 2,
  'a cancelled account keeps its applications');
select is((select profile_id from public.applications where id = '00000000-0000-0000-0000-0000000007b7'),
  '00000000-0000-0000-0000-0000000007d2'::uuid, 'still linked');
select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-0000000007d5'), 1,
  'the account still inside the grace period stays after the second run');
select is((select count(*)::int from public.applications where id in
  ('00000000-0000-0000-0000-0000000007b9', '00000000-0000-0000-0000-0000000007ba')), 2,
  'and so do the other applications');

-- Retention deadline of the kept rows (last: these runs treat the grace-period accounts as due).
-- 7d3 and 7bb were requested at now() - 14 days.
select private.purge_deleted_accounts((now() - interval '14 days') + interval '1 year' - interval '1 day');
select is((select count(*)::int from public.applications where id in
  ('00000000-0000-0000-0000-0000000007b4', '00000000-0000-0000-0000-0000000007bb')), 2,
  'kept applications stay until one year after the request');
select private.purge_deleted_accounts((now() - interval '14 days') + interval '1 year');
select is((select count(*)::int from public.applications where id in
  ('00000000-0000-0000-0000-0000000007b4', '00000000-0000-0000-0000-0000000007bb')), 0,
  'and are deleted one year after the request');

select * from finish();
rollback;
