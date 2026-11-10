-- Run with: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;

select plan(20);

-- Fixtures (postgres bypasses RLS). Ids 0000…0121–0126; every query is scoped to them.
-- 121 owner (active), 122 other active member, 123 manager (members.manage), 124 pending, 125 inactive.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000121', 'pgtap-md-owner@pgtap.invalid',    '{"full_name": "Olcay Owner"}'),
  ('00000000-0000-0000-0000-000000000122', 'pgtap-md-other@pgtap.invalid',    '{"full_name": "Orhan Other"}'),
  ('00000000-0000-0000-0000-000000000123', 'pgtap-md-manager@pgtap.invalid',  '{"full_name": "Mine Manager"}'),
  ('00000000-0000-0000-0000-000000000124', 'pgtap-md-pending@pgtap.invalid',  '{"full_name": "Pelin Pending"}'),
  ('00000000-0000-0000-0000-000000000125', 'pgtap-md-inactive@pgtap.invalid', '{"full_name": "Ilgın Inactive"}');

insert into public.roles (id, name) values ('00000000-0000-0000-0000-000000000131', 'pgtap-md-manager');
insert into public.role_permissions (role_id, permission) values ('00000000-0000-0000-0000-000000000131', 'members.manage');
update public.profiles set status = 'active'
  where id in ('00000000-0000-0000-0000-000000000121', '00000000-0000-0000-0000-000000000122');
update public.profiles set status = 'active', role_id = '00000000-0000-0000-0000-000000000131'
  where id = '00000000-0000-0000-0000-000000000123';
update public.profiles set status = 'inactive' where id = '00000000-0000-0000-0000-000000000125';

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

select is(
  (select count(*)::int from public.member_details where profile_id::text like '00000000-0000-0000-0000-0000000001__'),
  5,
  'sign-up creates a member_details row per profile'
);
select is(
  (select count(*)::int from public.member_details
    where profile_id = '00000000-0000-0000-0000-000000000121'
      and show_birthday and not show_instagram and not consent_photos
      and birth_date is null and instagram is null and consent_photos_at is null and consent_photos_version is null),
  1,
  'a new details row shows the birthday by default (opt-out), every other flag false, no data'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.member_details'::regclass),
  'RLS is enabled on member_details'
);

-- Anonymous
set local role anon;
select throws_ok('select * from public.member_details', '42501', null, 'anon cannot read member_details');
reset role;

-- Owner (active)
select pg_temp.login('00000000-0000-0000-0000-000000000121');
select is(
  (select count(*)::int from public.member_details where profile_id::text like '00000000-0000-0000-0000-0000000001__'),
  1,
  'owner sees only their own details row'
);
select lives_ok(
  $$ update public.member_details set instagram = 'olcay.rides', show_birthday = true, show_instagram = true,
       consent_photos = true, consent_photos_version = '2026-11'
     where profile_id = '00000000-0000-0000-0000-000000000121' $$,
  'owner can update the editable columns'
);
select throws_ok(
  $$ update public.member_details set birth_date = '1990-01-01' where profile_id = '00000000-0000-0000-0000-000000000121' $$,
  '42501', null,
  'owner cannot write birth_date'
);
select throws_ok(
  $$ update public.member_details set consent_photos_at = now() where profile_id = '00000000-0000-0000-0000-000000000121' $$,
  '42501', null,
  'owner cannot write consent_photos_at directly'
);
select throws_ok(
  $$ update public.member_details set instagram = 'bad handle!' where profile_id = '00000000-0000-0000-0000-000000000121' $$,
  '23514', null,
  'an invalid instagram handle is rejected'
);
reset role;

select ok(
  (select consent_photos_at is not null from public.member_details where profile_id = '00000000-0000-0000-0000-000000000121'),
  'toggling consent_photos stamps consent_photos_at'
);
update public.member_details set consent_photos_at = '2026-01-01T00:00:00Z'
  where profile_id = '00000000-0000-0000-0000-000000000121';

select pg_temp.login('00000000-0000-0000-0000-000000000121');
update public.member_details set instagram = 'olcay.new' where profile_id = '00000000-0000-0000-0000-000000000121';
reset role;
select is(
  (select consent_photos_at::text from public.member_details where profile_id = '00000000-0000-0000-0000-000000000121'),
  '2026-01-01 00:00:00+00',
  'updating only instagram leaves consent_photos_at unchanged'
);

-- A trusted writer (security-definer helper) may set both consent and its own timestamp.
update public.member_details set consent_photos = false, consent_photos_at = null
  where profile_id = '00000000-0000-0000-0000-000000000122';
update public.member_details set consent_photos = true, consent_photos_at = '2026-01-01T00:00:00Z'
  where profile_id = '00000000-0000-0000-0000-000000000122';
select is(
  (select consent_photos_at::text from public.member_details where profile_id = '00000000-0000-0000-0000-000000000122'),
  '2026-01-01 00:00:00+00',
  'an explicitly supplied consent_photos_at is kept (copy from an application)'
);

-- Another active member
select pg_temp.login('00000000-0000-0000-0000-000000000122');
select is(
  (select count(*)::int from public.member_details where profile_id = '00000000-0000-0000-0000-000000000121'),
  0,
  'another active member cannot read someone else''s details'
);
update public.member_details set instagram = 'hacked' where profile_id = '00000000-0000-0000-0000-000000000121';
reset role;
select is(
  (select instagram from public.member_details where profile_id = '00000000-0000-0000-0000-000000000121'),
  'olcay.new',
  'another member''s update affects 0 rows'
);

-- members.manage
select pg_temp.login('00000000-0000-0000-0000-000000000123');
select is(
  (select count(*)::int from public.member_details where profile_id::text like '00000000-0000-0000-0000-0000000001__'),
  5,
  'members.manage reads every details row'
);
reset role;

-- Pending and inactive owners can still update their own row
select pg_temp.login('00000000-0000-0000-0000-000000000124');
select lives_ok(
  $$ update public.member_details set show_birthday = true, instagram = 'pelin.p' where profile_id = '00000000-0000-0000-0000-000000000124' $$,
  'a pending owner can update their own details'
);
reset role;
select pg_temp.login('00000000-0000-0000-0000-000000000125');
select lives_ok(
  $$ update public.member_details set consent_photos = true, consent_photos_version = '2026-11' where profile_id = '00000000-0000-0000-0000-000000000125' $$,
  'an inactive owner can update their own details (consent withdrawal stays possible)'
);
reset role;

select is(
  (select show_birthday::text || '|' || instagram from public.member_details where profile_id = '00000000-0000-0000-0000-000000000124'),
  'true|pelin.p',
  'the pending owner''s update is persisted'
);
select ok(
  (select consent_photos and consent_photos_at is not null from public.member_details where profile_id = '00000000-0000-0000-0000-000000000125'),
  'the inactive owner''s consent is persisted and stamped'
);

-- No insert / delete over the API
select pg_temp.login('00000000-0000-0000-0000-000000000121');
select throws_ok(
  $$ delete from public.member_details where profile_id = '00000000-0000-0000-0000-000000000121' $$,
  '42501', null,
  'owner cannot delete their details row'
);
reset role;

select * from finish();
rollback;
