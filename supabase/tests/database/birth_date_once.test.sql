-- Run with: pnpm db:test
-- public.set_my_birth_date: an active member without a birth date may enter it once.
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

-- Fixtures (postgres bypasses RLS). Ids 0000…0201–0206; every query is scoped to them.
-- 201 active, no birth date; 202 active, no birth date; 203 active, birth date from an application;
-- 204 pending; 205 inactive; 206 active, no birth date (boundary checks).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000201', 'pgtap-bd-one@pgtap.invalid',      '{"full_name": "Bora Bir"}'),
  ('00000000-0000-0000-0000-000000000202', 'pgtap-bd-two@pgtap.invalid',      '{"full_name": "Burcu Iki"}'),
  ('00000000-0000-0000-0000-000000000203', 'pgtap-bd-set@pgtap.invalid',      '{"full_name": "Berk Set"}'),
  ('00000000-0000-0000-0000-000000000204', 'pgtap-bd-pending@pgtap.invalid',  '{"full_name": "Pelin Pending"}'),
  ('00000000-0000-0000-0000-000000000205', 'pgtap-bd-inactive@pgtap.invalid', '{"full_name": "Ilgın Inactive"}'),
  ('00000000-0000-0000-0000-000000000206', 'pgtap-bd-edge@pgtap.invalid',     '{"full_name": "Ece Edge"}');

update public.profiles set status = 'active'
  where id in ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000202',
               '00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000206');
update public.profiles set status = 'inactive' where id = '00000000-0000-0000-0000-000000000205';
update public.member_details set birth_date = '1985-03-04' where profile_id = '00000000-0000-0000-0000-000000000203';

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.birth_date_of(target_id uuid) returns date language sql as $$
  select birth_date from public.member_details where profile_id = target_id;
$$;

-- Istanbul "today" minus 18 years: the latest allowed birth date.
create function pg_temp.adult_limit() returns date language sql as $$
  select ((now() at time zone 'Europe/Istanbul')::date - interval '18 years')::date;
$$;

-- Anonymous: no execute grant
set local role anon;
select throws_ok(
  $$ select public.set_my_birth_date('1990-05-17') $$,
  '42501', null,
  'anon cannot call set_my_birth_date'
);
reset role;

-- Active member without a birth date: once
select pg_temp.login('00000000-0000-0000-0000-000000000201');
select lives_ok(
  $$ select public.set_my_birth_date('1990-05-17') $$,
  'an active member without a birth date can set it'
);
select throws_ok(
  $$ select public.set_my_birth_date('1991-06-18') $$,
  '42501', null,
  'a second call is refused'
);
select throws_ok(
  $$ select public.set_my_birth_date('2030-01-01') $$,
  '42501', null,
  'once set, even an invalid date gets "already set" (42501), not a validation error'
);
reset role;
select is(
  pg_temp.birth_date_of('00000000-0000-0000-0000-000000000201'),
  '1990-05-17'::date,
  'the first date is stored and the second call changed nothing'
);
select is(
  pg_temp.birth_date_of('00000000-0000-0000-0000-000000000202'),
  null,
  'the call changes only the caller''s own row'
);

-- Birth date copied from an application
select pg_temp.login('00000000-0000-0000-0000-000000000203');
select throws_ok(
  $$ select public.set_my_birth_date('1990-05-17') $$,
  '42501', null,
  'a member whose birth date came from an application cannot change it'
);
reset role;
select is(
  pg_temp.birth_date_of('00000000-0000-0000-0000-000000000203'),
  '1985-03-04'::date,
  'the application birth date is unchanged'
);

-- Validation (same rules as the application form)
select pg_temp.login('00000000-0000-0000-0000-000000000206');
select throws_ok(
  format('select public.set_my_birth_date(%L)', pg_temp.adult_limit() + 1),
  '23514', null,
  'one day under 18 (Istanbul date) is refused'
);
select throws_ok(
  $$ select public.set_my_birth_date('1920-01-01') $$,
  '23514', null,
  '1920-01-01 is refused (must be after it)'
);
select throws_ok(
  $$ select public.set_my_birth_date(null) $$,
  '23514', null,
  'null is refused'
);
reset role;
select is(
  pg_temp.birth_date_of('00000000-0000-0000-0000-000000000206'),
  null,
  'refused dates are not stored'
);
select pg_temp.login('00000000-0000-0000-0000-000000000206');
select lives_ok(
  format('select public.set_my_birth_date(%L)', pg_temp.adult_limit()),
  'turning 18 today is allowed'
);
reset role;
select is(
  pg_temp.birth_date_of('00000000-0000-0000-0000-000000000206'),
  pg_temp.adult_limit(),
  'the boundary date is stored'
);

-- Not active
select pg_temp.login('00000000-0000-0000-0000-000000000204');
select throws_ok(
  $$ select public.set_my_birth_date('1990-05-17') $$,
  '42501', null,
  'a pending account cannot set a birth date'
);
reset role;
select pg_temp.login('00000000-0000-0000-0000-000000000205');
select throws_ok(
  $$ select public.set_my_birth_date('1990-05-17') $$,
  '42501', null,
  'an inactive member cannot set a birth date'
);
reset role;
select is(
  (select count(*)::int from public.member_details
    where profile_id in ('00000000-0000-0000-0000-000000000204', '00000000-0000-0000-0000-000000000205')
      and birth_date is not null),
  0,
  'pending and inactive rows stay without a birth date'
);

select * from finish();
rollback;
