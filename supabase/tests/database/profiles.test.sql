-- Run with: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;

select plan(26);

-- ---------------------------------------------------------------------------
-- Fixtures (run as postgres, which bypasses RLS). All queries below are scoped
-- to these fixture ids so the test also works on a database with real data.
-- Roles: the built-in admin role, plus a fixture role with members.manage.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'pgtap-admin@pgtap.invalid',   '{"full_name": "Ada Admin"}'),
  ('00000000-0000-0000-0000-00000000000b', 'pgtap-member@pgtap.invalid',  '{"name": "Mert Member"}'),
  ('00000000-0000-0000-0000-00000000000c', 'pgtap-pending@pgtap.invalid', '{"full_name": "Pelin Pending"}'),
  ('00000000-0000-0000-0000-00000000000d', 'pgtap-other@pgtap.invalid',   '{"full_name": "Orhan Other"}'),
  ('00000000-0000-0000-0000-00000000000f', 'pgtap-manager@pgtap.invalid', '{"full_name": "Mine Manager"}');

select is(
  (select full_name || '|' || coalesce(role_id::text, 'no role') || '|' || status from public.profiles where id = '00000000-0000-0000-0000-00000000000b'),
  'Mert Member|no role|pending',
  'sign-up trigger creates a pending profile without a role, falling back to the "name" claim'
);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000e', 'pgtap-longavatar@pgtap.invalid',
   jsonb_build_object('full_name', 'Lale Long', 'avatar_url', 'https://x.invalid/' || repeat('a', 2100)));

select is(
  (select full_name || '|' || coalesce(avatar_url, 'null') from public.profiles where id = '00000000-0000-0000-0000-00000000000e'),
  'Lale Long|null',
  'an over-long avatar URL is dropped instead of breaking sign-up'
);
delete from auth.users where id = '00000000-0000-0000-0000-00000000000e';

insert into public.roles (id, name) values ('00000000-0000-0000-0000-0000000000f1', 'pgtap-manager');
insert into public.role_permissions (role_id, permission) values ('00000000-0000-0000-0000-0000000000f1', 'members.manage');

update public.profiles set role_id = (select id from public.roles where is_admin), status = 'active'
  where id = '00000000-0000-0000-0000-00000000000a';
update public.profiles set role_id = '00000000-0000-0000-0000-0000000000f1', status = 'active'
  where id = '00000000-0000-0000-0000-00000000000f';
update public.profiles set status = 'active'
  where id in ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000d');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'RLS is enabled on profiles'
);

-- Switch the session to a given user, the way PostgREST does.
create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- ---------------------------------------------------------------------------
-- Anonymous visitors
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok(
  'select * from public.profiles',
  '42501', null,
  'anon cannot read profiles'
);
reset role;

-- ---------------------------------------------------------------------------
-- Pending user
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000c');

select results_eq(
  $$ select id from public.profiles where id::text like '00000000-0000-0000-0000-%' $$,
  $$ values ('00000000-0000-0000-0000-00000000000c'::uuid) $$,
  'pending user sees only their own profile'
);

select throws_ok(
  $$ select public.set_member_status('00000000-0000-0000-0000-00000000000c', 'active') $$,
  '42501', null,
  'pending user cannot activate themselves'
);
reset role;

-- ---------------------------------------------------------------------------
-- Active member (no role)
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000b');

select is(
  (select count(*)::int from public.profiles where id::text like '00000000-0000-0000-0000-%'),
  4,
  'active member sees active members but not pending ones'
);

select lives_ok(
  $$ update public.profiles set district = 'Kadıköy', side = 'asian'
     where id = '00000000-0000-0000-0000-00000000000b' $$,
  'member can update their own personal fields'
);

select throws_ok(
  $$ update public.profiles set full_name = 'Mert M.' where id = '00000000-0000-0000-0000-00000000000b' $$,
  '42501', null,
  'member cannot change their own name (name lock)'
);

select throws_ok(
  $$ update public.profiles set avatar_url = 'https://x.invalid/a.png' where id = '00000000-0000-0000-0000-00000000000b' $$,
  '42501', null,
  'member cannot change their own avatar_url'
);

select throws_ok(
  $$ update public.profiles set role_id = (select id from public.roles where is_admin) where id = '00000000-0000-0000-0000-00000000000b' $$,
  '42501', null,
  'member cannot change their own role column'
);

select throws_ok(
  $$ update public.profiles set status = 'active' where id = '00000000-0000-0000-0000-00000000000b' $$,
  '42501', null,
  'member cannot change their own status column'
);

update public.profiles set district = 'hacked' where id = '00000000-0000-0000-0000-00000000000d';
reset role;

select is(
  (select coalesce(district, 'none') from public.profiles where id = '00000000-0000-0000-0000-00000000000d'),
  'none',
  'member cannot update someone else''s profile'
);

select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select throws_ok(
  $$ select public.set_member_role('00000000-0000-0000-0000-00000000000b', (select id from public.roles where is_admin)) $$,
  '42501', null,
  'member cannot promote themselves via set_member_role'
);
select throws_ok(
  $$ select public.set_member_status('00000000-0000-0000-0000-00000000000d', 'inactive') $$,
  '42501', null,
  'member without members.manage cannot change statuses'
);
reset role;

-- ---------------------------------------------------------------------------
-- Member with members.manage (not admin)
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000f');

select is(
  (select count(*)::int from public.profiles where id::text like '00000000-0000-0000-0000-%'),
  5,
  'members.manage sees every profile, including pending ones'
);

select lives_ok(
  $$ select public.set_member_status('00000000-0000-0000-0000-00000000000c', 'probation') $$,
  'members.manage can move a pending user to ön alım'
);

select throws_ok(
  $$ select public.set_member_status('00000000-0000-0000-0000-00000000000a', 'inactive') $$,
  '42501', null,
  'members.manage cannot deactivate an admin'
);

select throws_ok(
  $$ select public.set_member_status('00000000-0000-0000-0000-00000000000f', 'inactive') $$,
  '42501', null,
  'nobody can change their own status'
);

select throws_ok(
  $$ select public.set_member_role('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000f1') $$,
  '42501', null,
  'members.manage cannot assign roles (admins only)'
);
reset role;

select is(
  (select status::text from public.profiles where id = '00000000-0000-0000-0000-00000000000c'),
  'probation',
  'the move to ön alım by members.manage is persisted'
);

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000a');

select lives_ok(
  $$ select public.set_member_role('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000f1') $$,
  'admin can assign a role'
);

select throws_ok(
  $$ select public.set_member_role('00000000-0000-0000-0000-00000000000a', null) $$,
  '42501', null,
  'admin cannot remove their own role'
);

select lives_ok(
  $$ select public.set_member_status('00000000-0000-0000-0000-00000000000f', 'inactive') $$,
  'admin can deactivate a member with a role'
);
reset role;

select is(
  (select coalesce(role_id::text, 'none') from public.profiles where id = '00000000-0000-0000-0000-00000000000b'),
  '00000000-0000-0000-0000-0000000000f1',
  'role assignment by admin is persisted'
);

-- A deactivated member loses their role's rights immediately.
select pg_temp.login('00000000-0000-0000-0000-00000000000f');
select is(
  (select count(*)::int from public.profiles where id::text like '00000000-0000-0000-0000-%'),
  1,
  'an inactive member with members.manage sees only their own profile'
);
reset role;

select * from finish();
rollback;
