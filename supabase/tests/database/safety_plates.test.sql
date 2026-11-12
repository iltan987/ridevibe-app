-- Run with: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;

select plan(21);

-- Fixtures (postgres bypasses RLS). Ids 0000…0621–0625, role 0654; every query is scoped to them.
-- 621 owner (active), 622 members.manage, 623 other active, 624 pending, 625 inactive.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000621', 'pgtap-pl-owner@pgtap.invalid',    '{"full_name": "Olcay Owner"}'),
  ('00000000-0000-0000-0000-000000000622', 'pgtap-pl-manager@pgtap.invalid',  '{"full_name": "Mine Manager"}'),
  ('00000000-0000-0000-0000-000000000623', 'pgtap-pl-other@pgtap.invalid',    '{"full_name": "Orhan Other"}'),
  ('00000000-0000-0000-0000-000000000624', 'pgtap-pl-pending@pgtap.invalid',  '{"full_name": "Pelin Pending"}'),
  ('00000000-0000-0000-0000-000000000625', 'pgtap-pl-inactive@pgtap.invalid', '{"full_name": "Ilgın Inactive"}');

insert into public.roles (id, name) values ('00000000-0000-0000-0000-000000000654', 'pgtap-pl-manager');
insert into public.role_permissions (role_id, permission)
  values ('00000000-0000-0000-0000-000000000654', 'members.manage');
update public.profiles set status = 'active'
  where id in ('00000000-0000-0000-0000-000000000621', '00000000-0000-0000-0000-000000000623');
update public.profiles set status = 'active', role_id = '00000000-0000-0000-0000-000000000654'
  where id = '00000000-0000-0000-0000-000000000622';
update public.profiles set status = 'inactive' where id = '00000000-0000-0000-0000-000000000625';

-- Pending and inactive members already own a bike with a plate (seeded as postgres).
insert into public.member_motorcycles (profile_id, brand, model, plate) values
  ('00000000-0000-0000-0000-000000000624', 'Honda', 'CB', '34 PEN 111'),
  ('00000000-0000-0000-0000-000000000625', 'Honda', 'CB', '34 INA 222');

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- "<sqlstate>|<constraint>" of the error a statement raises (empty when it succeeds).
create function pg_temp.error_of(stmt text) returns text language plpgsql as $$
declare s text; c text;
begin
  execute stmt;
  return '';
exception when others then
  get stacked diagnostics c = constraint_name;
  s = sqlstate;
  return s || '|' || coalesce(c, '');
end $$;

-- A new sign-up shows plates in the directory by default
select is(
  (select show_plates from public.member_details where profile_id = '00000000-0000-0000-0000-000000000621'),
  true, 'new sign-up has show_plates = true'
);

-- Anonymous
set local role anon;
select throws_ok('select plate from public.member_motorcycles', '42501', null, 'anon cannot read plates');
reset role;

-- Owner
select pg_temp.login('00000000-0000-0000-0000-000000000621');
select lives_ok(
  $$ insert into public.member_motorcycles (profile_id, brand, model, plate)
     values ('00000000-0000-0000-0000-000000000621', 'Yamaha', 'MT-07', '34 ABC 123') $$,
  'owner inserts a bike with plate 34 ABC 123'
);
select lives_ok(
  $$ insert into public.member_motorcycles (profile_id, brand, model, plate)
     values ('00000000-0000-0000-0000-000000000621', 'Honda', 'CBR', '06 A 1234') $$,
  'owner inserts a bike with plate 06 A 1234'
);
select is(
  pg_temp.error_of($$ insert into public.member_motorcycles (profile_id, brand, model, plate)
     values ('00000000-0000-0000-0000-000000000621', 'X', 'Y', '00 ABC 12') $$),
  '23514|member_motorcycles_plate', 'province 00 is rejected'
);
select is(
  pg_temp.error_of($$ insert into public.member_motorcycles (profile_id, brand, model, plate)
     values ('00000000-0000-0000-0000-000000000621', 'X', 'Y', '82 ABC 12') $$),
  '23514|member_motorcycles_plate', 'province 82 is rejected'
);
select is(
  pg_temp.error_of($$ insert into public.member_motorcycles (profile_id, brand, model, plate)
     values ('00000000-0000-0000-0000-000000000621', 'X', 'Y', '34 abc 123') $$),
  '23514|member_motorcycles_plate', 'lower-case letters are rejected'
);
select is(
  pg_temp.error_of($$ insert into public.member_motorcycles (profile_id, brand, model, plate)
     values ('00000000-0000-0000-0000-000000000621', 'X', 'Y', '34ABC123') $$),
  '23514|member_motorcycles_plate', 'a plate without spaces is rejected'
);
select is(
  pg_temp.error_of($$ insert into public.member_motorcycles (profile_id, brand, model, plate)
     values ('00000000-0000-0000-0000-000000000621', 'X', 'Y', '34 ABCD 12') $$),
  '23514|member_motorcycles_plate', 'four letters are rejected'
);
select is(
  pg_temp.error_of($$ insert into public.member_motorcycles (profile_id, brand, model, plate, plate_foreign)
     values ('00000000-0000-0000-0000-000000000621', 'X', 'Y', 'AB-123-CD', false) $$),
  '23514|member_motorcycles_plate', 'a foreign-format plate is rejected when plate_foreign is false'
);
select lives_ok(
  $$ insert into public.member_motorcycles (profile_id, brand, model, plate, plate_foreign)
     values ('00000000-0000-0000-0000-000000000621', 'BMW', 'GS', 'AB-123-CD', true) $$,
  'owner inserts a foreign plate AB-123-CD'
);
select is(
  pg_temp.error_of($$ insert into public.member_motorcycles (profile_id, brand, model, plate, plate_foreign)
     values ('00000000-0000-0000-0000-000000000621', 'X', 'Y', 'A', true) $$),
  '23514|member_motorcycles_plate', 'a one-character foreign plate is rejected'
);
select lives_ok(
  $$ update public.member_motorcycles set plate = null
      where profile_id = '00000000-0000-0000-0000-000000000621' and brand = 'Honda' $$,
  'owner clears a plate'
);
select lives_ok(
  $$ update public.member_details set show_plates = false
      where profile_id = '00000000-0000-0000-0000-000000000621' $$,
  'owner switches show_plates off'
);

-- Other members and staff
select pg_temp.login('00000000-0000-0000-0000-000000000622');
select is(
  (select plate from public.member_motorcycles
    where profile_id = '00000000-0000-0000-0000-000000000621' and brand = 'Yamaha'),
  '34 ABC 123', 'members.manage reads the plate'
);
select pg_temp.login('00000000-0000-0000-0000-000000000623');
select is(
  (select count(*)::int from public.member_motorcycles where profile_id = '00000000-0000-0000-0000-000000000621'),
  0, 'another active member reads 0 rows'
);
with u as (update public.member_motorcycles set plate = '34 HAK 999'
            where profile_id = '00000000-0000-0000-0000-000000000621' returning 1)
select is((select count(*)::int from u), 0, 'another active member updates 0 plates of the owner');

-- Pending and inactive cannot change a plate
select pg_temp.login('00000000-0000-0000-0000-000000000624');
with u as (update public.member_motorcycles set plate = '34 HAK 999'
            where profile_id = '00000000-0000-0000-0000-000000000624' returning 1)
select is((select count(*)::int from u), 0, 'pending member updates 0 of their own plates');
select pg_temp.login('00000000-0000-0000-0000-000000000625');
with u as (update public.member_motorcycles set plate = '34 HAK 999'
            where profile_id = '00000000-0000-0000-0000-000000000625' returning 1)
select is((select count(*)::int from u), 0, 'inactive member updates 0 of their own plates');

reset role;
select is(
  (select count(*)::int from public.member_motorcycles
    where profile_id in ('00000000-0000-0000-0000-000000000624', '00000000-0000-0000-0000-000000000625')
      and plate = '34 HAK 999'),
  0, 'pending/inactive plates were not changed'
);
select is(
  (select plate from public.member_motorcycles
    where profile_id = '00000000-0000-0000-0000-000000000621' and brand = 'Yamaha'),
  '34 ABC 123', 'the owner''s plate is untouched by others'
);

select * from finish();
rollback;
