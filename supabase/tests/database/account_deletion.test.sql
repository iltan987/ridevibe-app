-- Run with: pnpm db:test
-- Self-service account deletion: status, columns and constraints. Later tasks append their assertions here.
begin;
create extension if not exists pgtap with schema extensions;

select plan(62);

-- Fixtures (postgres bypasses RLS). Ids 0000…07a1–07a9; every query is scoped to them.
-- 07a7 active (constraint checks).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000007a7', 'pgtap-del-constraint@pgtap.invalid', '{"full_name": "Cem Constraint"}');
update public.profiles set status = 'active' where id = '00000000-0000-0000-0000-0000000007a7';

-- Task 2 fixtures: 7a1 active member, 7a2 pending, 7a3 inactive, 7a4 + 7a5 active admins, 7a6 active member
-- with a custom role (members.manage).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000007a1', 'pgtap-del-active@pgtap.invalid',   '{"full_name": "Aslı Active"}'),
  ('00000000-0000-0000-0000-0000000007a2', 'pgtap-del-pending@pgtap.invalid',  '{"full_name": "Pınar Pending"}'),
  ('00000000-0000-0000-0000-0000000007a3', 'pgtap-del-inactive@pgtap.invalid', '{"full_name": "İlker Inactive"}'),
  ('00000000-0000-0000-0000-0000000007a4', 'pgtap-del-admin-a@pgtap.invalid',  '{"full_name": "Ada Admin"}'),
  ('00000000-0000-0000-0000-0000000007a5', 'pgtap-del-admin-b@pgtap.invalid',  '{"full_name": "Arda Admin"}'),
  ('00000000-0000-0000-0000-0000000007a6', 'pgtap-del-role@pgtap.invalid',     '{"full_name": "Rana Role"}');
insert into public.roles (id, name) values ('00000000-0000-0000-0000-0000000007b1', 'pgtap-del-role');
insert into public.role_permissions (role_id, permission)
  values ('00000000-0000-0000-0000-0000000007b1', 'members.manage');
update public.profiles set status = 'active'
  where id in ('00000000-0000-0000-0000-0000000007a1', '00000000-0000-0000-0000-0000000007a4',
               '00000000-0000-0000-0000-0000000007a5', '00000000-0000-0000-0000-0000000007a6');
update public.profiles set status = 'inactive' where id = '00000000-0000-0000-0000-0000000007a3';
update public.profiles set role_id = (select id from public.roles where is_admin)
  where id in ('00000000-0000-0000-0000-0000000007a4', '00000000-0000-0000-0000-0000000007a5');
update public.profiles set role_id = '00000000-0000-0000-0000-0000000007b1'
  where id = '00000000-0000-0000-0000-0000000007a6';
-- Real (non-fixture) active admins make the last-admin cases meaningless (production): those are skipped.
select set_config('pgtap.real_admins', (
  select count(*)::text from public.profiles
  where role_id = (select id from public.roles where is_admin) and status = 'active'
    and id not in ('00000000-0000-0000-0000-0000000007a4', '00000000-0000-0000-0000-0000000007a5')), true);

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.profile_state(uid uuid) returns text language sql as $$
  select status::text || '/' || coalesce(status_before_deletion::text, '-') || '/' ||
         (deletion_requested_at is not null)::text
  from public.profiles where id = uid;
$$;

-- Hint of the error a statement raises ('' when none).
create function pg_temp.hint_of(stmt text) returns text language plpgsql as $$
declare h text;
begin
  execute stmt;
  return '';
exception when others then
  get stacked diagnostics h = pg_exception_hint;
  return coalesce(h, '');
end;
$$;

-- Task 1: deleting status and columns
select has_column('public', 'profiles', 'deletion_requested_at', 'profiles.deletion_requested_at exists');
select has_column('public', 'profiles', 'status_before_deletion', 'profiles.status_before_deletion exists');
select has_column('public', 'applications', 'retained_until', 'applications.retained_until exists');
select enum_has_labels('public', 'member_status', array['pending', 'probation', 'active', 'inactive', 'deleting'],
  'member_status has the deleting label');

select throws_ok(
  $$ update public.profiles set status = 'deleting' where id = '00000000-0000-0000-0000-0000000007a7' $$,
  '23514', null, 'deleting without the two columns violates profiles_deletion_state');
select lives_ok(
  $$ update public.profiles set status = 'deleting', deletion_requested_at = now(), status_before_deletion = 'active'
     where id = '00000000-0000-0000-0000-0000000007a7' $$,
  'deleting with both columns set is allowed');
select throws_ok(
  $$ update public.profiles set status_before_deletion = 'deleting' where id = '00000000-0000-0000-0000-0000000007a7' $$,
  '23514', null, 'status_before_deletion can never be deleting');

select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'deletion_requested_at', 'update')
  and not has_column_privilege('authenticated', 'public.profiles', 'status_before_deletion', 'update')
  and not has_column_privilege('authenticated', 'public.applications', 'retained_until', 'update'),
  'authenticated has no update grant on the deletion columns');

-- Task 2: request and cancel
select ok(
  not has_function_privilege('anon', 'public.request_my_account_deletion()', 'execute')
  and not has_function_privilege('anon', 'public.cancel_my_account_deletion()', 'execute'),
  'anon has no execute grant on the deletion RPCs');
select ok(
  has_function_privilege('authenticated', 'public.request_my_account_deletion()', 'execute')
  and has_function_privilege('authenticated', 'public.cancel_my_account_deletion()', 'execute'),
  'authenticated can execute the deletion RPCs');
select is(
  (select count(*)::int from pg_proc where pronamespace = 'public'::regnamespace
     and proname in ('request_my_account_deletion', 'cancel_my_account_deletion')),
  2, 'one signature per deletion RPC');
set local role anon;
select throws_ok($$ select public.request_my_account_deletion() $$, '42501', null, 'anon cannot request');
select throws_ok($$ select public.cancel_my_account_deletion() $$, '42501', null, 'anon cannot cancel');
reset role;

-- Request by active, pending and inactive members
select pg_temp.login('00000000-0000-0000-0000-0000000007a1');
select lives_ok($$ select public.request_my_account_deletion() $$, 'active member can request deletion');
select pg_temp.login('00000000-0000-0000-0000-0000000007a2');
select lives_ok($$ select public.request_my_account_deletion() $$, 'pending member can request deletion');
select pg_temp.login('00000000-0000-0000-0000-0000000007a3');
select lives_ok($$ select public.request_my_account_deletion() $$, 'inactive member can request deletion');
reset role;

select is(pg_temp.profile_state('00000000-0000-0000-0000-0000000007a1'), 'deleting/active/true', 'active member is deleting, remembers active');
select is(pg_temp.profile_state('00000000-0000-0000-0000-0000000007a2'), 'deleting/pending/true', 'pending member is deleting, remembers pending');
select is(pg_temp.profile_state('00000000-0000-0000-0000-0000000007a3'), 'deleting/inactive/true', 'inactive member is deleting, remembers inactive');
select ok(
  (select deletion_requested_at between now() - interval '1 minute' and now() + interval '1 minute'
   from public.profiles where id = '00000000-0000-0000-0000-0000000007a1'),
  'deletion_requested_at is about now');

-- Return value = request + 14 days (7a4 is an admin with another active admin; 7a6 role holder)
select pg_temp.login('00000000-0000-0000-0000-0000000007a6');
create temp table returned_date as select public.request_my_account_deletion() as d;
grant select on returned_date to authenticated;
select is(
  (select d from returned_date),
  (select deletion_requested_at + interval '14 days' from public.profiles
   where id = '00000000-0000-0000-0000-0000000007a6'),
  'request returns deletion_requested_at + 14 days');
select is(
  (select role_id from public.profiles where id = '00000000-0000-0000-0000-0000000007a6'),
  '00000000-0000-0000-0000-0000000007b1'::uuid, 'role is kept while deleting');
select ok(
  not private.has_permission('members.manage') and not private.is_active_member(),
  'a deleting member has no permissions and is not active');

select pg_temp.login('00000000-0000-0000-0000-0000000007a1');
select throws_ok($$ select public.request_my_account_deletion() $$, '55000', null, 'second request fails');
reset role;

-- Cancel
select pg_temp.login('00000000-0000-0000-0000-0000000007a1');
select lives_ok($$ select public.cancel_my_account_deletion() $$, 'active member can cancel');
select pg_temp.login('00000000-0000-0000-0000-0000000007a2');
select lives_ok($$ select public.cancel_my_account_deletion() $$, 'pending member can cancel');
select pg_temp.login('00000000-0000-0000-0000-0000000007a3');
select lives_ok($$ select public.cancel_my_account_deletion() $$, 'inactive member can cancel');
select pg_temp.login('00000000-0000-0000-0000-0000000007a6');
select lives_ok($$ select public.cancel_my_account_deletion() $$, 'role holder can cancel');
reset role;

select is(pg_temp.profile_state('00000000-0000-0000-0000-0000000007a1'), 'active/-/false', 'cancel restores active');
select is(pg_temp.profile_state('00000000-0000-0000-0000-0000000007a2'), 'pending/-/false', 'cancel restores pending');
select is(pg_temp.profile_state('00000000-0000-0000-0000-0000000007a3'), 'inactive/-/false', 'cancel restores inactive');
select pg_temp.login('00000000-0000-0000-0000-0000000007a6');
select ok(
  private.has_permission('members.manage') and private.is_active_member(),
  'the role works again after cancel');
select pg_temp.login('00000000-0000-0000-0000-0000000007a1');
select throws_ok($$ select public.cancel_my_account_deletion() $$, '55000', null, 'cancel when not deleting fails');
reset role;

-- Last admin
select pg_temp.login('00000000-0000-0000-0000-0000000007a4');
select lives_ok($$ select public.request_my_account_deletion() $$, 'an admin can request while another active admin remains');
select pg_temp.login('00000000-0000-0000-0000-0000000007a5');
select case when current_setting('pgtap.real_admins')::int > 0
  then skip('non-fixture active admins exist', 1)
  else throws_ok($$ select public.request_my_account_deletion() $$, '42501', null, 'the only active admin cannot request') end;
select case when current_setting('pgtap.real_admins')::int > 0
  then skip('non-fixture active admins exist', 1)
  else is(pg_temp.hint_of($$ select public.request_my_account_deletion() $$), 'last_admin', 'last admin error carries the hint') end;
reset role;
select case when current_setting('pgtap.real_admins')::int > 0
  then skip('non-fixture active admins exist', 1)
  else is(pg_temp.profile_state('00000000-0000-0000-0000-0000000007a5'), 'active/-/false', 'the last admin stays active') end;

-- Task 3: staff cannot see or touch a deleting account.
-- 7b1 deleting member (details, bike, contact), 7b2 active member, 7b3 staff (members.manage + applications.*),
-- 7b4 active admin. Applications: linked approved, linked rejected, unlinked new with 7b1's email.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000007b1', 'pgtap-del-hidden@pgtap.invalid', '{"full_name": "Hale Hidden"}'),
  ('00000000-0000-0000-0000-0000000007b2', 'pgtap-del-peer@pgtap.invalid',   '{"full_name": "Pelin Peer"}'),
  ('00000000-0000-0000-0000-0000000007b3', 'pgtap-del-staff@pgtap.invalid',  '{"full_name": "Seda Staff"}'),
  ('00000000-0000-0000-0000-0000000007b4', 'pgtap-del-boss@pgtap.invalid',   '{"full_name": "Bora Boss"}');
insert into public.roles (id, name) values ('00000000-0000-0000-0000-0000000007c1', 'pgtap-del-staff');
insert into public.role_permissions (role_id, permission) values
  ('00000000-0000-0000-0000-0000000007c1', 'members.manage'),
  ('00000000-0000-0000-0000-0000000007c1', 'members.safety'),
  ('00000000-0000-0000-0000-0000000007c1', 'applications.view'),
  ('00000000-0000-0000-0000-0000000007c1', 'applications.review'),
  ('00000000-0000-0000-0000-0000000007c1', 'applications.decide');
update public.profiles set status = 'active'
  where id in ('00000000-0000-0000-0000-0000000007b1', '00000000-0000-0000-0000-0000000007b2',
               '00000000-0000-0000-0000-0000000007b3', '00000000-0000-0000-0000-0000000007b4');
update public.profiles set role_id = '00000000-0000-0000-0000-0000000007c1'
  where id = '00000000-0000-0000-0000-0000000007b3';
update public.profiles set role_id = (select id from public.roles where is_admin)
  where id = '00000000-0000-0000-0000-0000000007b4';
insert into public.member_motorcycles (profile_id, brand, model) values
  ('00000000-0000-0000-0000-0000000007b1', 'Honda', 'CB500');
update public.profiles
  set status = 'deleting', deletion_requested_at = now(), status_before_deletion = 'active'
  where id = '00000000-0000-0000-0000-0000000007b1';

create function pg_temp.apply(app_id uuid, app_email text, app_profile uuid) returns void language sql as $$
  insert into public.applications (
    id, full_name, phone, email, birth_date, district, side, languages, license_class, riding_years, owns_motorcycle,
    riding_styles, group_experience, in_other_clubs, heard_from, event_interests, expectations,
    alienating_behaviors, consent_privacy, consent_rules, privacy_notice_version, profile_id
  ) values (
    app_id, 'Hale Hidden', '+905321234567', app_email, '1995-05-17', 'Kadıköy', 'asian', array['tr'], 'a2', 3, false,
    array['city'], 'some', false, 'friend', array['day_rides'], 'Güvenli grup sürüşleri.',
    'Tehlikeli sürüş.', true, true, 'test', app_profile
  );
$$;
select pg_temp.apply('00000000-0000-0000-0000-0000000007d2', 'pgtap-del-linked2@pgtap.invalid', '00000000-0000-0000-0000-0000000007b1');
update public.applications set status = 'rejected' where id = '00000000-0000-0000-0000-0000000007d2';
select pg_temp.apply('00000000-0000-0000-0000-0000000007d1', 'pgtap-del-linked1@pgtap.invalid', '00000000-0000-0000-0000-0000000007b1');
update public.applications set status = 'approved' where id = '00000000-0000-0000-0000-0000000007d1';
select pg_temp.apply('00000000-0000-0000-0000-0000000007d3', 'pgtap-del-hidden@pgtap.invalid', null);

-- A peer sees nothing of 7b1
select pg_temp.login('00000000-0000-0000-0000-0000000007b2');
select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-0000000007b1'), 0,
  'a member cannot read a deleting profile');
select is((select count(*)::int from public.member_directory() where id = '00000000-0000-0000-0000-0000000007b1'), 0,
  'the directory does not list a deleting member');
reset role;

-- Staff with members.manage sees nothing of 7b1
select pg_temp.login('00000000-0000-0000-0000-0000000007b3');
select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-0000000007b2'), 1,
  'staff still read other profiles');
select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-0000000007b1'), 0,
  'staff cannot read a deleting profile');
select is((select count(*)::int from public.member_contacts where profile_id = '00000000-0000-0000-0000-0000000007b1'), 0,
  'staff cannot read a deleting member''s contact row');
select is((select count(*)::int from public.member_details where profile_id = '00000000-0000-0000-0000-0000000007b1'), 0,
  'staff cannot read a deleting member''s details');
select is((select count(*)::int from public.member_motorcycles where profile_id = '00000000-0000-0000-0000-0000000007b1'), 0,
  'staff cannot read a deleting member''s motorcycles');
select is((select count(*)::int from public.applications where id = '00000000-0000-0000-0000-0000000007d1'), 0,
  'the linked approved application is hidden from staff');
select is((select count(*)::int from public.applications where id = '00000000-0000-0000-0000-0000000007d3'), 0,
  'the unlinked application with the deleting member''s email is hidden from staff');
select is((select count(*)::int from public.applications where id = '00000000-0000-0000-0000-0000000007d2'), 1,
  'the linked rejected application stays visible');
with u as (update public.applications set admin_notes = 'x' where id = '00000000-0000-0000-0000-0000000007d1' returning 1)
select is((select count(*)::int from u), 0, 'staff cannot update a hidden application');
reset role;

-- Staff RPCs skip the deleting account
select pg_temp.login('00000000-0000-0000-0000-0000000007b3');
select is((select count(*)::int from public.application_account('00000000-0000-0000-0000-0000000007d1')), 0,
  'application_account returns nothing for an application linked to a deleting account');
select is((select count(*)::int from public.application_account('00000000-0000-0000-0000-0000000007d2')), 0,
  'application_account returns nothing for a rejected application of a deleting account either');
select is(
  (select array_agg(profile_id order by profile_id) from public.pending_application_flags(array[
    '00000000-0000-0000-0000-0000000007b1', '00000000-0000-0000-0000-0000000007b2']::uuid[])),
  array['00000000-0000-0000-0000-0000000007b2']::uuid[],
  'pending_application_flags returns no row for a deleting account');
select is((select count(*)::int from public.linkable_accounts(null, null, null, true)
           where id = '00000000-0000-0000-0000-0000000007b1'), 0,
  'linkable_accounts never lists a deleting account');
reset role;

-- A reviewer cannot move a visible application onto a deleting person's email (oracle / indirect delete)
select pg_temp.apply('00000000-0000-0000-0000-0000000007d5', 'pgtap-del-other@pgtap.invalid', null);
select pg_temp.login('00000000-0000-0000-0000-0000000007b3');
select throws_ok(
  $$ update public.applications set email = 'pgtap-del-hidden@pgtap.invalid' where id = '00000000-0000-0000-0000-0000000007d5' $$,
  '42501', null, 'a reviewer cannot change an application email to a deleting person''s email');
reset role;

-- 7b1 reads its own row
select pg_temp.login('00000000-0000-0000-0000-0000000007b1');
select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-0000000007b1'), 1,
  'a deleting member reads their own profile');
reset role;

-- An admin is held to the same rules
select pg_temp.login('00000000-0000-0000-0000-0000000007b4');
select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-0000000007b1'), 0,
  'an admin cannot read a deleting profile');
select throws_ok($$ select public.set_member_status('00000000-0000-0000-0000-0000000007b1', 'active') $$, 'P0002',
  'profile 00000000-0000-0000-0000-0000000007b1 not found', 'set_member_status answers a deleting target as not found');
select throws_ok($$ select public.set_member_role('00000000-0000-0000-0000-0000000007b1', null) $$, 'P0002',
  'profile 00000000-0000-0000-0000-0000000007b1 not found', 'set_member_role answers a deleting target as not found');
select throws_ok($$ select public.set_member_name('00000000-0000-0000-0000-0000000007b1', 'Yeni Ad') $$, 'P0002',
  'profile 00000000-0000-0000-0000-0000000007b1 not found', 'set_member_name answers a deleting target as not found');
select throws_ok($$ select public.set_member_status('00000000-0000-0000-0000-0000000007b2', 'deleting') $$, '42501', null,
  'staff cannot set status deleting');
select throws_ok($$ select public.link_application('00000000-0000-0000-0000-0000000007d3', '00000000-0000-0000-0000-0000000007b1') $$,
  'P0002', null, 'a deleting account cannot be linked to an application');
select throws_ok($$ select * from public.member_safety_card('00000000-0000-0000-0000-0000000007b1') $$, 'P0002', null,
  'the safety card of a deleting member is not available');
reset role;

-- Approving the unlinked application does not reactivate the deleting account
update public.applications set status = 'approved' where id = '00000000-0000-0000-0000-0000000007d3';
select is(pg_temp.profile_state('00000000-0000-0000-0000-0000000007b1'), 'deleting/active/true',
  'approving an application with the deleting member''s email leaves the account deleting');

select * from finish();
rollback;
