-- Run with: pnpm db:test
-- Self-service account deletion: status, columns and constraints. Later tasks append their assertions here.
begin;
create extension if not exists pgtap with schema extensions;

select plan(37);

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
-- Real admins (production) must not count as "another active admin": park them inside this transaction.
update public.profiles set status = 'inactive'
  where role_id = (select id from public.roles where is_admin)
    and id not in ('00000000-0000-0000-0000-0000000007a4', '00000000-0000-0000-0000-0000000007a5');

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
select enum_has_labels('public', 'member_status', array['pending', 'active', 'inactive', 'deleting'],
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
select throws_ok($$ select public.request_my_account_deletion() $$, '42501', null, 'the only active admin cannot request');
select is(pg_temp.hint_of($$ select public.request_my_account_deletion() $$), 'last_admin', 'last admin error carries the hint');
reset role;
select is(pg_temp.profile_state('00000000-0000-0000-0000-0000000007a5'), 'active/-/false', 'the last admin stays active');

select * from finish();
rollback;
