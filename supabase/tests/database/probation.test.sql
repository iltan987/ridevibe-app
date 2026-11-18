-- Run with: pnpm db:test
-- Ön alım (probation) status: approval starts it, staff transitions, rights stay active-only, status_changed_at.
begin;
create extension if not exists pgtap with schema extensions;

select plan(15);

-- Fixtures: 0701 admin, 0702 staff (members.manage), 0703 pending with an approved-to-be application on the same
-- email, 0704 pending without application, 0705 and 0707 inactive, 0706 probation member holding a members.manage role.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000701', 'pgtap-pb-admin@pgtap.invalid',    '{"full_name": "Ada Pgtapyonetici"}'),
  ('00000000-0000-0000-0000-000000000702', 'pgtap-pb-staff@pgtap.invalid',    '{"full_name": "Sema Pgtapyetkili"}'),
  ('00000000-0000-0000-0000-000000000703', 'pgtap-pb-applied@pgtap.invalid',  '{"full_name": "Ayse Pgtapaday"}'),
  ('00000000-0000-0000-0000-000000000704', 'pgtap-pb-pending@pgtap.invalid',  '{"full_name": "Pınar Pgtapbekleyen"}'),
  ('00000000-0000-0000-0000-000000000705', 'pgtap-pb-inactive@pgtap.invalid', '{"full_name": "Ilgaz Pgtappasif"}'),
  ('00000000-0000-0000-0000-000000000706', 'pgtap-pb-probation@pgtap.invalid', '{"full_name": "Pelin Pgtapuye"}'),
  ('00000000-0000-0000-0000-000000000707', 'pgtap-pb-inactive2@pgtap.invalid', '{"full_name": "Irmak Pgtappasif"}');
insert into public.roles (id, name) values
  ('00000000-0000-0000-0000-000000000708', 'pgtap-pb-manager'),
  ('00000000-0000-0000-0000-000000000709', 'pgtap-pb-manager2');
insert into public.role_permissions (role_id, permission) values
  ('00000000-0000-0000-0000-000000000708', 'members.manage'),
  ('00000000-0000-0000-0000-000000000709', 'members.manage');
update public.profiles set role_id = (select id from public.roles where is_admin), status = 'active'
  where id = '00000000-0000-0000-0000-000000000701';
update public.profiles set role_id = '00000000-0000-0000-0000-000000000708', status = 'active'
  where id = '00000000-0000-0000-0000-000000000702';
update public.profiles set status = 'inactive'
  where id in ('00000000-0000-0000-0000-000000000705', '00000000-0000-0000-0000-000000000707');
update public.profiles set role_id = '00000000-0000-0000-0000-000000000709', status = 'probation'
  where id = '00000000-0000-0000-0000-000000000706';

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.apply(email text) returns uuid language sql as $$
  insert into public.applications (
    full_name, phone, email, birth_date, district, side, languages, license_class, riding_years, owns_motorcycle,
    riding_styles, group_experience, in_other_clubs, heard_from, event_interests, expectations,
    alienating_behaviors, consent_privacy, consent_rules, privacy_notice_version
  ) values (
    'Ayse Pgtapaday', '+905321234567', email, '1995-05-17', 'Kadıköy', 'asian', array['tr'], 'a2', 3, false,
    array['city'], 'some', false, 'friend', array['day_rides'], 'Güvenli grup sürüşleri.',
    'Tehlikeli sürüş.', true, true, 'test'
  ) returning id;
$$;

create temp table app_fixture (id uuid);
grant all on app_fixture to authenticated;
insert into app_fixture
  select pg_temp.apply('pgtap-pb-applied@pgtap.invalid');

-- Approval path (as the admin)
select pg_temp.login('00000000-0000-0000-0000-000000000701');
update public.applications set status = 'approved' where id = (select id from app_fixture);
reset role;
select is((select status from public.profiles where id = '00000000-0000-0000-0000-000000000703'),
  'probation'::public.member_status, 'approval starts ön alım');
select isnt((select status_changed_at from public.profiles where id = '00000000-0000-0000-0000-000000000703'),
  null, 'approval stamps status_changed_at');

-- Staff transitions (as 0702)
select pg_temp.login('00000000-0000-0000-0000-000000000702');
select throws_ok($$ select public.set_member_status('00000000-0000-0000-0000-000000000704', 'active') $$,
  '42501', null, 'pending cannot become active directly');
select lives_ok($$ select public.set_member_status('00000000-0000-0000-0000-000000000704', 'probation') $$,
  'pending → probation');
select lives_ok($$ select public.set_member_status('00000000-0000-0000-0000-000000000704', 'active') $$,
  'probation → active');
select lives_ok($$ select public.set_member_status('00000000-0000-0000-0000-000000000705', 'probation') $$,
  'inactive → probation');
select lives_ok($$ select public.set_member_status('00000000-0000-0000-0000-000000000707', 'active') $$,
  'inactive → active');
select throws_ok($$ select public.set_member_status('00000000-0000-0000-0000-000000000702', 'inactive') $$,
  '42501', null, 'staff cannot change their own status');
reset role;
select is((select status from public.profiles where id = '00000000-0000-0000-0000-000000000704'),
  'active'::public.member_status, 'the promoted member is active');

-- A status change stamps status_changed_at
update public.profiles set status_changed_at = '2020-01-01' where id = '00000000-0000-0000-0000-000000000705';
update public.profiles set status = 'inactive' where id = '00000000-0000-0000-0000-000000000705';
select ok((select status_changed_at > '2020-01-01' from public.profiles where id = '00000000-0000-0000-0000-000000000705'),
  'a status change stamps status_changed_at');
update public.profiles set status_changed_at = '2020-01-01' where id = '00000000-0000-0000-0000-000000000705';
update public.profiles set city = 'İstanbul' where id = '00000000-0000-0000-0000-000000000705';
select is((select status_changed_at from public.profiles where id = '00000000-0000-0000-0000-000000000705'),
  '2020-01-01'::timestamptz, 'an update without a status change keeps the stamp');

-- Rights stay active-only (as 0706, probation)
select pg_temp.login('00000000-0000-0000-0000-000000000706');
select is(private.has_permission('members.manage'), false, 'a probation member has no staff rights');
select throws_ok($$ select public.set_member_status('00000000-0000-0000-0000-000000000704', 'inactive') $$,
  '42501', null, 'a probation member cannot manage members');
reset role;

-- Deletion round trip keeps the stamp (as 0706)
update public.profiles set status_changed_at = '2021-02-03' where id = '00000000-0000-0000-0000-000000000706';
select pg_temp.login('00000000-0000-0000-0000-000000000706');
select public.request_my_account_deletion();
select public.cancel_my_account_deletion();
reset role;
select is((select status_changed_at from public.profiles where id = '00000000-0000-0000-0000-000000000706'),
  '2021-02-03'::timestamptz, 'deleting round trip keeps status_changed_at');
select is((select status from public.profiles where id = '00000000-0000-0000-0000-000000000706'),
  'probation'::public.member_status, 'cancel restores probation');

select * from finish();
rollback;
