-- Run with: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;

select plan(27);

-- Fixtures (postgres bypasses RLS). Ids 0000…0191–0195; every query is scoped to them (or to the
-- name token "Pgtapuye"). 191 Çelik (active, asian, 2 bikes, birthday + instagram shown),
-- 192 İlker (active, european, birthday + instagram stored but hidden), 193 Zehra (active, no
-- district/side/bikes, show_birthday without a birth date), 194 pending, 195 inactive.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000191', 'pgtap-md-celik@pgtap.invalid',    '{"full_name": "Çelik Cem Pgtapuye"}'),
  ('00000000-0000-0000-0000-000000000192', 'pgtap-md-ilker@pgtap.invalid',    '{"full_name": "İlker Işık Pgtapuye"}'),
  ('00000000-0000-0000-0000-000000000193', 'pgtap-md-zehra@pgtap.invalid',    '{"full_name": "Zehra 50%_Off Pgtapuye"}'),
  ('00000000-0000-0000-0000-000000000194', 'pgtap-md-pending@pgtap.invalid',  '{"full_name": "Pelin Pgtapuye"}'),
  ('00000000-0000-0000-0000-000000000195', 'pgtap-md-inactive@pgtap.invalid', '{"full_name": "Ihsan Pgtapuye"}');

update public.profiles set status = 'active'
  where id in ('00000000-0000-0000-0000-000000000191', '00000000-0000-0000-0000-000000000192',
               '00000000-0000-0000-0000-000000000193');
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
select throws_ok($$ select * from public.member_directory_counts() $$, '42501', null, 'anon cannot call member_directory_counts');
reset role;

-- Pending and inactive callers
select pg_temp.login('00000000-0000-0000-0000-000000000194');
select throws_ok($$ select * from public.member_directory() $$, '42501', null, 'pending member cannot call member_directory');
select throws_ok($$ select * from public.member_directory_counts() $$, '42501', null, 'pending member cannot call member_directory_counts');
reset role;
select pg_temp.login('00000000-0000-0000-0000-000000000195');
select throws_ok($$ select * from public.member_directory() $$, '42501', null, 'inactive member cannot call member_directory');
select throws_ok($$ select * from public.member_directory_counts() $$, '42501', null, 'inactive member cannot call member_directory_counts');
reset role;

-- Active caller
select pg_temp.login('00000000-0000-0000-0000-000000000191');

select is(
  (select count(*)::int from public.member_directory(search => 'pgtapuye')),
  3,
  'active caller sees exactly the 3 active fixtures (no pending, no inactive)'
);

select results_eq(
  $$ select birth_month::int, birth_day::int, instagram, jsonb_array_length(motorcycles), motorcycles -> 0 ->> 'brand',
            motorcycles -> 1 ->> 'brand', pg_typeof(birth_month)::text
     from public.member_directory(search => 'celik cem pgtapuye') $$,
  $$ values (3, 12, 'celik.cem', 2, 'Honda', 'Vespa', 'smallint') $$,
  'Çelik: birthday, instagram and 2 bikes in creation order'
);
select is(
  (select motorcycles -> 1 from public.member_directory(search => 'celik cem pgtapuye')),
  '{"brand": "Vespa", "model": "Primavera", "cc": null, "plate": null}'::jsonb,
  'a bike without cc keeps a null cc'
);

select results_eq(
  $$ select birth_month, birth_day, instagram from public.member_directory(search => 'ilker isik pgtapuye') $$,
  $$ values (null::smallint, null::smallint, null::text) $$,
  'İlker: hidden birthday and instagram come back null'
);

select results_eq(
  $$ select birth_month, birth_day, instagram, motorcycles, district, side
     from public.member_directory(search => 'zehra 50%_off pgtapuye') $$,
  $$ values (null::smallint, null::smallint, null::text, '[]'::jsonb, null::text, null::public.istanbul_side) $$,
  'Zehra: no birth date, no bikes, no district; show_instagram without an instagram is null'
);

-- Search: Turkish folding
select is((select count(*)::int from public.member_directory(search => 'celik', page_size => 100) where id = '00000000-0000-0000-0000-000000000191'), 1, 'search "celik" finds Çelik');
select is((select count(*)::int from public.member_directory(search => 'ÇELİK', page_size => 100) where id = '00000000-0000-0000-0000-000000000191'), 1, 'search "ÇELİK" finds Çelik');
select is((select count(*)::int from public.member_directory(search => 'ilker', page_size => 100) where id = '00000000-0000-0000-0000-000000000192'), 1, 'search "ilker" finds İlker');
select is((select count(*)::int from public.member_directory(search => 'IŞIK', page_size => 100) where id = '00000000-0000-0000-0000-000000000192'), 1, 'search "IŞIK" finds İlker');

-- Search: wildcard characters are literal
select results_eq(
  $$ select id from public.member_directory(search => '50%', page_size => 100)
     where id in ('00000000-0000-0000-0000-000000000191', '00000000-0000-0000-0000-000000000192', '00000000-0000-0000-0000-000000000193') $$,
  $$ values ('00000000-0000-0000-0000-000000000193'::uuid) $$,
  'search "50%" finds Zehra only'
);
select is(
  (select count(*)::int from public.member_directory(search => '%', page_size => 100) where id in ('00000000-0000-0000-0000-000000000191', '00000000-0000-0000-0000-000000000192')),
  0,
  'search "%" alone is literal: Çelik and İlker don''t match (only Zehra''s name contains it)'
);
select is(
  (select count(*)::int from public.member_directory(search => '_', page_size => 100) where id in ('00000000-0000-0000-0000-000000000191', '00000000-0000-0000-0000-000000000192')),
  0,
  'search "_" alone is literal: Çelik and İlker don''t match (only Zehra''s name contains it)'
);
select is(
  (select count(*)::int from public.member_directory(search => '\', page_size => 100) where id in ('00000000-0000-0000-0000-000000000191', '00000000-0000-0000-0000-000000000192', '00000000-0000-0000-0000-000000000193')),
  0,
  'search backslash alone is literal'
);
select is(
  (select count(*)::int from public.member_directory(search => '  pgtapuye  ')),
  3,
  'search is trimmed'
);

-- Side filter
select results_eq(
  $$ select id from public.member_directory(search => 'pgtapuye', side_filter => 'asian') $$,
  $$ values ('00000000-0000-0000-0000-000000000191'::uuid) $$,
  'side asian returns Çelik only'
);

select results_eq(
  $$ select id from public.member_directory(search => 'pgtapuye', side_filter => 'european') $$,
  $$ values ('00000000-0000-0000-0000-000000000192'::uuid) $$,
  'side european returns İlker only; side-less Zehra is excluded by any side filter'
);
select throws_ok(
  $$ select * from public.member_directory(after_name => 'Çelik') $$,
  '22023', null, 'after_name without after_id is rejected'
);

-- Order and keyset paging
select results_eq(
  $$ select id from public.member_directory(search => 'pgtapuye') $$,
  $$ values ('00000000-0000-0000-0000-000000000191'::uuid), ('00000000-0000-0000-0000-000000000192'::uuid),
            ('00000000-0000-0000-0000-000000000193'::uuid) $$,
  'order is Çelik < İlker < Zehra (Turkish collation)'
);
select is(
  (select count(*)::int from public.member_directory(search => 'pgtapuye', page_size => 1)),
  2,
  'page_size 1 returns 2 rows so the app can detect a next page'
);
select is(
  (select id from public.member_directory(
     search => 'pgtapuye', after_name => 'Çelik Cem Pgtapuye',
     after_id => '00000000-0000-0000-0000-000000000191', page_size => 1) limit 1),
  '00000000-0000-0000-0000-000000000192'::uuid,
  'the cursor after Çelik starts with İlker'
);

-- Counts
select results_eq(
  $$ select total, asian, european from public.member_directory_counts('pgtapuye') $$,
  $$ values (3::bigint, 1::bigint, 1::bigint) $$,
  'counts: 3 total, 1 asian, 1 european (Zehra only in the total)'
);

select * from finish();
rollback;
