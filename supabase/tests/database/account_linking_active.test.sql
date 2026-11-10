-- Run with: pnpm db:test
-- Linking an approved application to an account that is already active (activated by staff
-- before its application could be matched, e.g. iCloud on the form, Gmail at sign-in).
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

-- ---------------------------------------------------------------------------
-- Fixtures
--   5d1 decider (applications.view + decide), 5d2 reviewer (view + review, no decide)
--   5b1 active, has a role, no application           → linkable when include_active
--   5b2 active, has a linked approved application    → never linkable
--   5b3 inactive, no application                     → never linkable
--   5b4 pending, no application                      → linkable either way
--   5b5 active, its sign-in email matches an open unlinked application → never linkable
-- Applications: 551 approved, 552 new, 553 contacted, 554 approved (linked to 5b2),
--   555 approved, 556 new with 5b5's email
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000005d1', 'act-decider@pgtap.invalid', '{"full_name": "Deniz Decider"}'),
  ('00000000-0000-0000-0000-0000000005d2', 'act-reviewer@pgtap.invalid', '{"full_name": "Rana Reviewer"}'),
  ('00000000-0000-0000-0000-0000000005b1', 'act-member@pgtap.invalid', '{"full_name": "Aktif Üye"}'),
  ('00000000-0000-0000-0000-0000000005b2', 'act-linked@pgtap.invalid', '{"full_name": "Bağlı Üye"}'),
  ('00000000-0000-0000-0000-0000000005b3', 'act-inactive@pgtap.invalid', '{"full_name": "Pasif Üye"}'),
  ('00000000-0000-0000-0000-0000000005b4', 'act-pending@pgtap.invalid', '{"full_name": "Bekleyen Hesap"}'),
  ('00000000-0000-0000-0000-0000000005b5', 'act-matched@pgtap.invalid', '{"full_name": "Eşleşen Üye"}');

insert into public.roles (id, name) values
  ('00000000-0000-0000-0000-0000000005e1', 'pgtap-act-decider'),
  ('00000000-0000-0000-0000-0000000005e2', 'pgtap-act-reviewer'),
  ('00000000-0000-0000-0000-0000000005e3', 'pgtap-act-organizer');
insert into public.role_permissions (role_id, permission) values
  ('00000000-0000-0000-0000-0000000005e1', 'applications.view'),
  ('00000000-0000-0000-0000-0000000005e1', 'applications.decide'),
  ('00000000-0000-0000-0000-0000000005e2', 'applications.view'),
  ('00000000-0000-0000-0000-0000000005e2', 'applications.review');
update public.profiles set role_id = '00000000-0000-0000-0000-0000000005e1', status = 'active'
  where id = '00000000-0000-0000-0000-0000000005d1';
update public.profiles set role_id = '00000000-0000-0000-0000-0000000005e2', status = 'active'
  where id = '00000000-0000-0000-0000-0000000005d2';
update public.profiles set role_id = '00000000-0000-0000-0000-0000000005e3', status = 'active'
  where id = '00000000-0000-0000-0000-0000000005b1';
update public.profiles set status = 'active'
  where id in ('00000000-0000-0000-0000-0000000005b2', '00000000-0000-0000-0000-0000000005b5');
update public.profiles set status = 'inactive' where id = '00000000-0000-0000-0000-0000000005b3';

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- A minimal valid application with a fixed id (as postgres: any status/profile).
create function pg_temp.apply(
  app_id uuid, app_email text, app_status public.application_status default 'new',
  app_name text default 'Aday Kişi', app_profile uuid default null
) returns void language sql as $$
  insert into public.applications (
    id, status, profile_id, full_name, phone, email, birth_date, district, side, languages, license_class,
    riding_years, owns_motorcycle, riding_styles, group_experience, in_other_clubs, heard_from, event_interests,
    expectations, alienating_behaviors, consent_privacy, consent_rules, privacy_notice_version
  ) values (
    app_id, app_status, app_profile, app_name, '+905321234567', app_email, '1995-05-17', 'Kadıköy', 'asian',
    array['tr'], 'a2', 3, false, array['city'], 'some', false, 'friend', array['day_rides'],
    'Güvenli grup sürüşleri.', 'Tehlikeli sürüş.', true, true, 'test'
  );
$$;

create function pg_temp.profile_of(target uuid) returns text language sql as $$
  select p.status || '|' || p.full_name || '|' || coalesce(p.role_id::text, '-') from public.profiles p where p.id = target;
$$;

select pg_temp.apply('00000000-0000-0000-0000-000000000551', 'act-icloud@pgtap.invalid', 'approved', 'aktif üye');
select pg_temp.apply('00000000-0000-0000-0000-000000000552', 'act-new@pgtap.invalid');
select pg_temp.apply('00000000-0000-0000-0000-000000000553', 'act-contacted@pgtap.invalid', 'contacted');
select pg_temp.apply('00000000-0000-0000-0000-000000000554', 'act-linked-app@pgtap.invalid', 'approved',
  app_profile => '00000000-0000-0000-0000-0000000005b2');
select pg_temp.apply('00000000-0000-0000-0000-000000000555', 'act-second@pgtap.invalid', 'approved');
select pg_temp.apply('00000000-0000-0000-0000-000000000556', 'act-matched@pgtap.invalid');

-- ---------------------------------------------------------------------------
-- linkable_accounts(include_active)
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000005d1');
select ok(
  not exists (select 1 from public.linkable_accounts('act-') where id = '00000000-0000-0000-0000-0000000005b1'),
  'by default active accounts are not linkable'
);
select is(
  (select status::text from public.linkable_accounts('act-', include_active => true)
    where id = '00000000-0000-0000-0000-0000000005b1'),
  'active',
  'with include_active an active account without an application is listed, with its status'
);
select is(
  (select status::text from public.linkable_accounts('act-', include_active => true)
    where id = '00000000-0000-0000-0000-0000000005b4'),
  'pending',
  'with include_active pending accounts are still listed'
);
select ok(
  not exists (select 1 from public.linkable_accounts('act-', include_active => true)
    where id = '00000000-0000-0000-0000-0000000005b2'),
  'an active account with a linked application is never listed'
);
select ok(
  not exists (select 1 from public.linkable_accounts('act-', include_active => true)
    where id = '00000000-0000-0000-0000-0000000005b3'),
  'an inactive account is never listed'
);
select ok(
  not exists (select 1 from public.linkable_accounts('act-', include_active => true)
    where id = '00000000-0000-0000-0000-0000000005b5'),
  'an active account whose email matches an open application is not listed'
);
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000005d2');
select throws_ok(
  $$ select * from public.linkable_accounts('act-', include_active => true) $$,
  '42501', null,
  'a reviewer without applications.decide cannot list accounts'
);

-- ---------------------------------------------------------------------------
-- link_application to an active account
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select public.link_application('00000000-0000-0000-0000-000000000551', '00000000-0000-0000-0000-0000000005b1') $$,
  '42501', null,
  'a reviewer without applications.decide cannot link to an active account'
);
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000005d1');
select throws_ok(
  $$ select public.link_application('00000000-0000-0000-0000-000000000552', '00000000-0000-0000-0000-0000000005b1') $$,
  'P0002', null,
  'a new application cannot be linked to an active account'
);
select throws_ok(
  $$ select public.link_application('00000000-0000-0000-0000-000000000553', '00000000-0000-0000-0000-0000000005b1') $$,
  'P0002', null,
  'a contacted application cannot be linked to an active account'
);
select throws_ok(
  $$ select public.link_application('00000000-0000-0000-0000-000000000551', '00000000-0000-0000-0000-0000000005b3') $$,
  'P0002', null,
  'an approved application cannot be linked to an inactive account'
);
select throws_ok(
  $$ select public.link_application('00000000-0000-0000-0000-000000000551', '00000000-0000-0000-0000-0000000005b2') $$,
  'P0002', null,
  'an approved application cannot be linked to an active account that already has one'
);
select lives_ok(
  $$ select public.link_application('00000000-0000-0000-0000-000000000551', '00000000-0000-0000-0000-0000000005b1') $$,
  'a decider links an approved application to an active account without one'
);
reset role;

select is((select profile_id from public.applications where id = '00000000-0000-0000-0000-000000000551'),
  '00000000-0000-0000-0000-0000000005b1'::uuid, 'the application now belongs to the active account');
select is(pg_temp.profile_of('00000000-0000-0000-0000-0000000005b1'),
  'active|Aktif Üye|00000000-0000-0000-0000-0000000005e3',
  'linking keeps the active account''s status, name and role');
select is((select status::text from public.applications where id = '00000000-0000-0000-0000-000000000551'),
  'approved', 'the application stays approved');

select pg_temp.login('00000000-0000-0000-0000-0000000005d1');
select throws_ok(
  $$ select public.link_application('00000000-0000-0000-0000-000000000555', '00000000-0000-0000-0000-0000000005b1') $$,
  'P0002', null,
  'a second approved application cannot be linked to the same active account'
);
reset role;

select * from finish();
rollback;
