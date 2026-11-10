-- Run with: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

-- Fixtures (postgres bypasses RLS). Ids 0000…0141–0145, role 0151; every query is scoped to them.
-- 141 owner (active), 142 other active member, 143 manager (members.manage), 144 pending, 145 inactive.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000141', 'pgtap-mm-owner@pgtap.invalid',    '{"full_name": "Olcay Owner"}'),
  ('00000000-0000-0000-0000-000000000142', 'pgtap-mm-other@pgtap.invalid',    '{"full_name": "Orhan Other"}'),
  ('00000000-0000-0000-0000-000000000143', 'pgtap-mm-manager@pgtap.invalid',  '{"full_name": "Mine Manager"}'),
  ('00000000-0000-0000-0000-000000000144', 'pgtap-mm-pending@pgtap.invalid',  '{"full_name": "Pelin Pending"}'),
  ('00000000-0000-0000-0000-000000000145', 'pgtap-mm-inactive@pgtap.invalid', '{"full_name": "Ilgın Inactive"}');

insert into public.roles (id, name) values ('00000000-0000-0000-0000-000000000151', 'pgtap-mm-manager');
insert into public.role_permissions (role_id, permission) values ('00000000-0000-0000-0000-000000000151', 'members.manage');
update public.profiles set status = 'active'
  where id in ('00000000-0000-0000-0000-000000000141', '00000000-0000-0000-0000-000000000142');
update public.profiles set status = 'active', role_id = '00000000-0000-0000-0000-000000000151'
  where id = '00000000-0000-0000-0000-000000000143';
update public.profiles set status = 'inactive' where id = '00000000-0000-0000-0000-000000000145';

-- A bike for the other member and one for the (later inactive-looking) rows, inserted as postgres.
insert into public.member_motorcycles (profile_id, brand, model, cc) values
  ('00000000-0000-0000-0000-000000000142', 'Honda', 'CB650R', 650);

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

select ok(
  (select relrowsecurity from pg_class where oid = 'public.member_motorcycles'::regclass),
  'RLS is enabled on member_motorcycles'
);

-- Anonymous
set local role anon;
select throws_ok('select * from public.member_motorcycles', '42501', null, 'anon cannot read member_motorcycles');
reset role;

-- Owner (active)
select pg_temp.login('00000000-0000-0000-0000-000000000141');
select lives_ok(
  $$ insert into public.member_motorcycles (profile_id, brand, model, cc)
     values ('00000000-0000-0000-0000-000000000141', 'Yamaha', 'MT-07', 689) $$,
  'active owner inserts their own bike'
);
select lives_ok(
  $$ insert into public.member_motorcycles (profile_id, brand, model)
     values ('00000000-0000-0000-0000-000000000141', 'Vespa', 'Primavera') $$,
  'cc is optional'
);
select is(
  (select count(*)::int from public.member_motorcycles
    where profile_id in ('00000000-0000-0000-0000-000000000141', '00000000-0000-0000-0000-000000000142')),
  2,
  'owner sees only their own bikes'
);
select lives_ok(
  $$ update public.member_motorcycles set model = 'MT-09', cc = 890
      where profile_id = '00000000-0000-0000-0000-000000000141' and brand = 'Yamaha' $$,
  'owner updates their bike'
);
select is(
  (select model from public.member_motorcycles
    where profile_id = '00000000-0000-0000-0000-000000000141' and brand = 'Yamaha'),
  'MT-09',
  'the update took effect'
);
select throws_ok(
  $$ update public.member_motorcycles set profile_id = '00000000-0000-0000-0000-000000000142'
      where profile_id = '00000000-0000-0000-0000-000000000141' and brand = 'Yamaha' $$,
  '42501', null, 'owner cannot hand a bike to someone else (no grant on profile_id)'
);
select throws_ok(
  $$ insert into public.member_motorcycles (profile_id, brand, model)
     values ('00000000-0000-0000-0000-000000000142', 'Ducati', 'Monster') $$,
  '42501', null, 'owner cannot insert a bike for another profile'
);
select throws_ok(
  $$ insert into public.member_motorcycles (profile_id, brand, model)
     values ('00000000-0000-0000-0000-000000000141', '', 'X') $$,
  '23514', null, 'empty brand is rejected'
);
select throws_ok(
  $$ insert into public.member_motorcycles (profile_id, brand, model)
     values ('00000000-0000-0000-0000-000000000141', 'Honda', '   ') $$,
  '23514', null, 'blank (whitespace-only) model is rejected'
);
select throws_ok(
  $$ insert into public.member_motorcycles (profile_id, brand, model, cc)
     values ('00000000-0000-0000-0000-000000000141', 'Honda', 'X', 40) $$,
  '23514', null, 'cc below 50 is rejected'
);
select lives_ok(
  $$ delete from public.member_motorcycles
      where profile_id = '00000000-0000-0000-0000-000000000141' and brand = 'Vespa' $$,
  'owner deletes their bike'
);

-- Limit: owner has 1 bike (Yamaha); fill up to 10, the 11th must fail because of the cap.
select lives_ok(
  $$ insert into public.member_motorcycles (profile_id, brand, model)
     select '00000000-0000-0000-0000-000000000141', 'Brand', 'Model ' || g from generate_series(1, 9) g $$,
  'owner reaches 10 bikes'
);
select throws_like(
  $$ insert into public.member_motorcycles (profile_id, brand, model)
     values ('00000000-0000-0000-0000-000000000141', 'Eleventh', 'Bike') $$,
  '%member_motorcycles_limit%',
  'the 11th bike is rejected and the error names member_motorcycles_limit'
);
do $$
declare c text;
begin
  insert into public.member_motorcycles (profile_id, brand, model)
    values ('00000000-0000-0000-0000-000000000141', 'Eleventh', 'Bike');
exception when others then
  get stacked diagnostics c = constraint_name;
  perform set_config('pgtap.limit_err', sqlstate || '/' || c, true);
end $$;
select is(
  current_setting('pgtap.limit_err', true),
  '23514/member_motorcycles_limit',
  'the 11th bike fails with 23514 and constraint member_motorcycles_limit'
);

-- Other active member
select pg_temp.login('00000000-0000-0000-0000-000000000142');
select is(
  (select count(*)::int from public.member_motorcycles
    where profile_id in ('00000000-0000-0000-0000-000000000141', '00000000-0000-0000-0000-000000000142')),
  1,
  'another active member sees only their own bikes'
);
with u as (update public.member_motorcycles set model = 'Hacked'
            where profile_id = '00000000-0000-0000-0000-000000000141' returning 1)
select is(
  (select count(*)::int from u),
  0, 'another active member updates 0 rows of someone else''s bikes'
);
with d as (delete from public.member_motorcycles
            where profile_id = '00000000-0000-0000-0000-000000000141' returning 1)
select is(
  (select count(*)::int from d),
  0, 'another active member deletes 0 rows of someone else''s bikes'
);

-- Manager sees them (read only via this policy)
select pg_temp.login('00000000-0000-0000-0000-000000000143');
select is(
  (select count(*)::int from public.member_motorcycles
    where profile_id in ('00000000-0000-0000-0000-000000000141', '00000000-0000-0000-0000-000000000142')),
  11,
  'members.manage sees every member''s bikes'
);

-- Pending and inactive owners cannot add
select pg_temp.login('00000000-0000-0000-0000-000000000144');
select throws_ok(
  $$ insert into public.member_motorcycles (profile_id, brand, model)
     values ('00000000-0000-0000-0000-000000000144', 'Honda', 'X') $$,
  '42501', null, 'pending owner cannot insert'
);
select pg_temp.login('00000000-0000-0000-0000-000000000145');
select throws_ok(
  $$ insert into public.member_motorcycles (profile_id, brand, model)
     values ('00000000-0000-0000-0000-000000000145', 'Honda', 'X') $$,
  '42501', null, 'inactive owner cannot insert'
);

select * from finish();
rollback;
