-- Run with: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;

select plan(15);

-- ---------------------------------------------------------------------------
-- Fixtures (run as postgres, which bypasses RLS)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local',   '{"full_name": "Ada Admin"}'),
  ('00000000-0000-0000-0000-00000000000b', 'member@test.local',  '{"name": "Mert Member"}'),
  ('00000000-0000-0000-0000-00000000000c', 'pending@test.local', '{"full_name": "Pelin Pending"}'),
  ('00000000-0000-0000-0000-00000000000d', 'other@test.local',   '{"full_name": "Orhan Other"}');

select is(
  (select full_name || '|' || role || '|' || status from public.profiles where id = '00000000-0000-0000-0000-00000000000b'),
  'Mert Member|member|pending',
  'sign-up trigger creates a pending member profile, falling back to the "name" claim'
);

update public.profiles set role = 'admin', status = 'active' where id = '00000000-0000-0000-0000-00000000000a';
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
  'select id from public.profiles',
  $$ values ('00000000-0000-0000-0000-00000000000c'::uuid) $$,
  'pending user sees only their own profile'
);

select throws_ok(
  $$ select public.admin_set_member_access('00000000-0000-0000-0000-00000000000c', 'member', 'active') $$,
  '42501', null,
  'pending user cannot activate themselves'
);
reset role;

-- ---------------------------------------------------------------------------
-- Active member
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000b');

select is(
  (select count(*)::int from public.profiles),
  3,
  'active member sees active members but not pending ones'
);

select lives_ok(
  $$ update public.profiles set full_name = 'Mert M.', district = 'Kadıköy', side = 'asian'
     where id = '00000000-0000-0000-0000-00000000000b' $$,
  'member can update their own personal fields'
);

select throws_ok(
  $$ update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000b' $$,
  '42501', null,
  'member cannot change their own role'
);

select throws_ok(
  $$ update public.profiles set status = 'active' where id = '00000000-0000-0000-0000-00000000000b' $$,
  '42501', null,
  'member cannot change their own status'
);

update public.profiles set full_name = 'hacked' where id = '00000000-0000-0000-0000-00000000000d';
reset role;

select is(
  (select full_name from public.profiles where id = '00000000-0000-0000-0000-00000000000d'),
  'Orhan Other',
  'member cannot update someone else''s profile'
);

select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select throws_ok(
  $$ select public.admin_set_member_access('00000000-0000-0000-0000-00000000000b', 'admin', 'active') $$,
  '42501', null,
  'member cannot promote themselves via the admin RPC'
);
reset role;

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000a');

select is(
  (select count(*)::int from public.profiles),
  4,
  'admin sees every profile, including pending ones'
);

select lives_ok(
  $$ select public.admin_set_member_access('00000000-0000-0000-0000-00000000000c', 'member', 'active') $$,
  'admin can activate a pending user'
);

select throws_ok(
  $$ select public.admin_set_member_access('00000000-0000-0000-0000-00000000000a', 'member', 'active') $$,
  '42501', null,
  'admin cannot demote themselves'
);
reset role;

select is(
  (select status::text from public.profiles where id = '00000000-0000-0000-0000-00000000000c'),
  'active',
  'activation by admin is persisted'
);

select * from finish();
rollback;
