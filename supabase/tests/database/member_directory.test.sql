-- Run with: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;

select plan(10);

-- Fixtures (postgres bypasses RLS). Ids 0000…0191–0197 plus 30 bulk rows 0000-0000-0019-…; every query is scoped
-- to them. 191 Çelik (active, asian, 2 bikes, birthday + instagram shown), 192 İlker (active, european, birthday +
-- instagram stored but hidden), 193 Zehra (active, no district/side/bikes, show_birthday without a birth date),
-- 194 pending, 195 inactive, 196 Cem and 197 Deniz (active; Çelik sorts between them only under Turkish collation).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000191', 'pgtap-md-celik@pgtap.invalid',    '{"full_name": "Çelik Cem Pgtapuye"}'),
  ('00000000-0000-0000-0000-000000000192', 'pgtap-md-ilker@pgtap.invalid',    '{"full_name": "İlker Işık Pgtapuye"}'),
  ('00000000-0000-0000-0000-000000000193', 'pgtap-md-zehra@pgtap.invalid',    '{"full_name": "Zehra 50%_Off Pgtapuye"}'),
  ('00000000-0000-0000-0000-000000000194', 'pgtap-md-pending@pgtap.invalid',  '{"full_name": "Pelin Pgtapuye"}'),
  ('00000000-0000-0000-0000-000000000195', 'pgtap-md-inactive@pgtap.invalid', '{"full_name": "Ihsan Pgtapuye"}'),
  ('00000000-0000-0000-0000-000000000196', 'pgtap-md-cem@pgtap.invalid',      '{"full_name": "Cem Pgtapuye"}'),
  ('00000000-0000-0000-0000-000000000197', 'pgtap-md-deniz@pgtap.invalid',    '{"full_name": "Deniz Pgtapuye"}');
insert into auth.users (id, email, raw_user_meta_data)
  select ('00000000-0000-0000-0019-' || lpad(n::text, 12, '0'))::uuid, 'pgtap-md-bulk' || n || '@pgtap.invalid',
         json_build_object('full_name', 'Bulk ' || n || ' Pgtapuye')::jsonb
  from generate_series(1, 30) n;

update public.profiles set status = 'active'
  where id in ('00000000-0000-0000-0000-000000000191', '00000000-0000-0000-0000-000000000192',
               '00000000-0000-0000-0000-000000000193', '00000000-0000-0000-0000-000000000196',
               '00000000-0000-0000-0000-000000000197')
     or id::text like '00000000-0000-0000-0019-%';
update public.profiles set status = 'inactive' where id = '00000000-0000-0000-0000-000000000195';
update public.profiles set district = 'Kadıköy', side = 'asian' where id = '00000000-0000-0000-0000-000000000191';
update public.profiles set district = 'Beşiktaş', side = 'european' where id = '00000000-0000-0000-0000-000000000192';

update public.member_details set birth_date = '1990-03-12', instagram = 'celik.cem',
  show_birthday = true, show_instagram = true
  where profile_id = '00000000-0000-0000-0000-000000000191';
update public.member_details set birth_date = '1985-07-01', instagram = 'ilker',
  show_birthday = false, show_instagram = false
  where profile_id = '00000000-0000-0000-0000-000000000192';
update public.member_details set birth_date = null, show_birthday = true, show_instagram = true
  where profile_id = '00000000-0000-0000-0000-000000000193';

insert into public.member_motorcycles (profile_id, brand, model, cc, created_at) values
  ('00000000-0000-0000-0000-000000000191', 'Honda', 'CB650R', 650, '2026-01-01'),
  ('00000000-0000-0000-0000-000000000191', 'Vespa', 'Primavera', null, '2026-02-01');

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- Anonymous
set local role anon;
select throws_ok($$ select * from public.member_directory() $$, '42501', null, 'anon cannot call member_directory');
reset role;

-- Pending and inactive callers
select pg_temp.login('00000000-0000-0000-0000-000000000194');
select throws_ok($$ select * from public.member_directory() $$, '42501', null, 'pending member cannot call member_directory');
reset role;
select pg_temp.login('00000000-0000-0000-0000-000000000195');
select throws_ok($$ select * from public.member_directory() $$, '42501', null, 'inactive member cannot call member_directory');
reset role;

-- Active caller
select pg_temp.login('00000000-0000-0000-0000-000000000191');

select is(
  (select count(*)::int from public.member_directory()
    where id in ('00000000-0000-0000-0000-000000000191', '00000000-0000-0000-0000-000000000192',
                 '00000000-0000-0000-0000-000000000193', '00000000-0000-0000-0000-000000000194',
                 '00000000-0000-0000-0000-000000000195', '00000000-0000-0000-0000-000000000196',
                 '00000000-0000-0000-0000-000000000197')),
  5,
  'active caller sees exactly the 5 active fixtures (no pending, no inactive)'
);

select is(
  (select count(*)::int from public.member_directory() where id::text like '00000000-0000-0000-0019-%'),
  30,
  'no page cap: all 30 bulk fixtures come back in one call (the app reads in .range() chunks)'
);

select results_eq(
  $$ select birth_month::int, birth_day::int, instagram, jsonb_array_length(motorcycles), motorcycles -> 0 ->> 'brand',
            motorcycles -> 1 ->> 'brand', pg_typeof(birth_month)::text
     from public.member_directory() where id = '00000000-0000-0000-0000-000000000191' $$,
  $$ values (3, 12, 'celik.cem', 2, 'Honda', 'Vespa', 'smallint') $$,
  'Çelik: birthday, instagram and 2 bikes in creation order'
);
select is(
  (select motorcycles -> 1 from public.member_directory() where id = '00000000-0000-0000-0000-000000000191'),
  '{"brand": "Vespa", "model": "Primavera", "cc": null, "plate": null}'::jsonb,
  'a bike without cc keeps a null cc'
);

select results_eq(
  $$ select birth_month, birth_day, instagram from public.member_directory()
     where id = '00000000-0000-0000-0000-000000000192' $$,
  $$ values (null::smallint, null::smallint, null::text) $$,
  'İlker: hidden birthday and instagram come back null'
);

select results_eq(
  $$ select birth_month, birth_day, instagram, motorcycles, district, side
     from public.member_directory() where id = '00000000-0000-0000-0000-000000000193' $$,
  $$ values (null::smallint, null::smallint, null::text, '[]'::jsonb, null::text, null::public.istanbul_side) $$,
  'Zehra: no birth date, no bikes, no district; show_instagram without an instagram is null'
);

-- Order: Turkish collation (Ç after C, before D; İ after I-less letters), in the function's own output order
select results_eq(
  $$ select d.id from public.member_directory() with ordinality as d
     where d.id in ('00000000-0000-0000-0000-000000000191', '00000000-0000-0000-0000-000000000192',
                    '00000000-0000-0000-0000-000000000193', '00000000-0000-0000-0000-000000000196',
                    '00000000-0000-0000-0000-000000000197')
     order by d.ordinality $$,
  $$ values ('00000000-0000-0000-0000-000000000196'::uuid), ('00000000-0000-0000-0000-000000000191'::uuid),
            ('00000000-0000-0000-0000-000000000197'::uuid), ('00000000-0000-0000-0000-000000000192'::uuid),
            ('00000000-0000-0000-0000-000000000193'::uuid) $$,
  'order is Cem < Çelik < Deniz < İlker < Zehra (Turkish collation)'
);

select * from finish();
rollback;
