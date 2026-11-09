-- Run with: pnpm db:test
-- Linking applications to accounts, the applicant's own status, "applied?"
-- flags on the members list, and staff name corrections.
begin;
create extension if not exists pgtap with schema extensions;

select plan(58);

-- ---------------------------------------------------------------------------
-- Fixtures
-- Staff: decider (view + decide), reviewer (view + review), member manager
-- (members.manage), a plain active member, two admins.
-- Pending accounts (Google name "Google Name"):
--   4a1 / 4a2  targets for linking an approved / contacted application
--   4a3        pending, nothing linked or matching (linkable)
--   4a4        submitted its own application while signed in (linked)
--   4a5        "Zeynep Kaya", no application at all (linkable)
--   4a6        has an open application with its sign-in email (matched)
--   4a7        an application with its email exists but belongs to someone else
--   4a8        has a *rejected* linked application (re-applied under another email)
--   4a9        older rejected linked application + newer unlinked one with its email
--   4aa        inactive (suspended) account
--   4ab        has an open unlinked application with its own email
--   4c1–4c3    keyset fixtures; 470–48a: 27 accounts for the page size
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000004d1', 'pgtap-decider@pgtap.invalid', '{"full_name": "Deniz Decider"}'),
  ('00000000-0000-0000-0000-0000000004d2', 'pgtap-reviewer@pgtap.invalid', '{"full_name": "Rana Reviewer"}'),
  ('00000000-0000-0000-0000-0000000004d3', 'pgtap-manager@pgtap.invalid', '{"full_name": "Mine Manager"}'),
  ('00000000-0000-0000-0000-0000000004d4', 'pgtap-member@pgtap.invalid', '{"full_name": "Mert Member"}'),
  ('00000000-0000-0000-0000-0000000004d5', 'pgtap-admin@pgtap.invalid', '{"full_name": "Ada Admin"}'),
  ('00000000-0000-0000-0000-0000000004d6', 'pgtap-admin2@pgtap.invalid', '{"full_name": "Ali Admin"}'),
  ('00000000-0000-0000-0000-0000000004a1', 'link-approved@pgtap.invalid', '{"full_name": "Google Name"}'),
  ('00000000-0000-0000-0000-0000000004a2', 'link-contacted@pgtap.invalid', '{"full_name": "Google Name"}'),
  ('00000000-0000-0000-0000-0000000004a3', 'spare@pgtap.invalid', '{"full_name": "Google Name"}'),
  ('00000000-0000-0000-0000-0000000004a4', 'own@pgtap.invalid', '{"full_name": "Google Name"}'),
  ('00000000-0000-0000-0000-0000000004a5', 'unmatched@pgtap.invalid', '{"full_name": "Zeynep Kaya"}'),
  ('00000000-0000-0000-0000-0000000004a6', 'matched@pgtap.invalid', '{"full_name": "Google Name"}'),
  ('00000000-0000-0000-0000-0000000004a7', 'shared@pgtap.invalid', '{"full_name": "Google Name"}'),
  ('00000000-0000-0000-0000-0000000004a8', 'rejected-before@pgtap.invalid', '{"full_name": "Google Name"}'),
  ('00000000-0000-0000-0000-0000000004a9', 'mixed@pgtap.invalid', '{"full_name": "Google Name"}'),
  ('00000000-0000-0000-0000-0000000004aa', 'suspended@pgtap.invalid', '{"full_name": "Google Name"}'),
  ('00000000-0000-0000-0000-0000000004ab', 'self-match@pgtap.invalid', '{"full_name": "Google Name"}'),
  ('00000000-0000-0000-0000-0000000004c1', 'keyset-1@pgtap.invalid', '{"full_name": "Keyset Bir"}'),
  ('00000000-0000-0000-0000-0000000004c2', 'keyset-2@pgtap.invalid', '{"full_name": "Keyset İki"}'),
  ('00000000-0000-0000-0000-0000000004c3', 'keyset-3@pgtap.invalid', '{"full_name": "Keyset Üç"}');
insert into auth.users (id, email)
select ('00000000-0000-0000-0000-000000000' || to_hex(1136 + n))::uuid, 'bulk-' || n || '@pgtap.invalid'
from generate_series(0, 26) as n; -- ids …000470 to …00048a

insert into public.roles (id, name) values
  ('00000000-0000-0000-0000-0000000004e1', 'pgtap-decider'),
  ('00000000-0000-0000-0000-0000000004e2', 'pgtap-reviewer'),
  ('00000000-0000-0000-0000-0000000004e3', 'pgtap-manager');
insert into public.role_permissions (role_id, permission) values
  ('00000000-0000-0000-0000-0000000004e1', 'applications.view'),
  ('00000000-0000-0000-0000-0000000004e1', 'applications.decide'),
  ('00000000-0000-0000-0000-0000000004e2', 'applications.view'),
  ('00000000-0000-0000-0000-0000000004e2', 'applications.review'),
  ('00000000-0000-0000-0000-0000000004e3', 'members.manage');
update public.profiles set role_id = '00000000-0000-0000-0000-0000000004e1', status = 'active'
  where id = '00000000-0000-0000-0000-0000000004d1';
update public.profiles set role_id = '00000000-0000-0000-0000-0000000004e2', status = 'active'
  where id = '00000000-0000-0000-0000-0000000004d2';
update public.profiles set role_id = '00000000-0000-0000-0000-0000000004e3', status = 'active'
  where id = '00000000-0000-0000-0000-0000000004d3';
update public.profiles set status = 'active' where id = '00000000-0000-0000-0000-0000000004d4';
update public.profiles set status = 'inactive' where id = '00000000-0000-0000-0000-0000000004aa';
update public.profiles set role_id = (select id from public.roles where is_admin), status = 'active'
  where id in ('00000000-0000-0000-0000-0000000004d5', '00000000-0000-0000-0000-0000000004d6');
update public.profiles set created_at = '2026-01-03 12:00+00' where id = '00000000-0000-0000-0000-0000000004c1';
update public.profiles set created_at = '2026-01-02 12:00+00'
  where id in ('00000000-0000-0000-0000-0000000004c2', '00000000-0000-0000-0000-0000000004c3');

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
  select p.status || '|' || p.full_name from public.profiles p where p.id = target;
$$;

select pg_temp.apply('00000000-0000-0000-0000-000000000451', 'app-one@pgtap.invalid', 'approved', 'Başvuru Bir');
select pg_temp.apply('00000000-0000-0000-0000-000000000452', 'app-two@pgtap.invalid', 'contacted', 'Başvuru İki');
select pg_temp.apply('00000000-0000-0000-0000-000000000453', 'app-rejected@pgtap.invalid', 'rejected');
select pg_temp.apply('00000000-0000-0000-0000-000000000454', 'own@pgtap.invalid',
  app_profile => '00000000-0000-0000-0000-0000000004a4');
select pg_temp.apply('00000000-0000-0000-0000-000000000455', 'app-five@pgtap.invalid');
select pg_temp.apply('00000000-0000-0000-0000-000000000456', 'Matched@PgTap.invalid', 'contacted');
select pg_temp.apply('00000000-0000-0000-0000-000000000457', 'shared@pgtap.invalid',
  app_profile => '00000000-0000-0000-0000-0000000004d4');
select pg_temp.apply('00000000-0000-0000-0000-000000000458', 'rejected-before@pgtap.invalid', 'rejected',
  app_profile => '00000000-0000-0000-0000-0000000004a8');
select pg_temp.apply('00000000-0000-0000-0000-000000000459', 'new-other@pgtap.invalid');
select pg_temp.apply('00000000-0000-0000-0000-00000000045a', 'mixed-old@pgtap.invalid', 'rejected',
  app_profile => '00000000-0000-0000-0000-0000000004a9');
select pg_temp.apply('00000000-0000-0000-0000-00000000045b', 'mixed@pgtap.invalid');
update public.applications set created_at = '2026-01-01 12:00+00' where id = '00000000-0000-0000-0000-00000000045a';
select pg_temp.apply('00000000-0000-0000-0000-00000000045c', 'self-match@pgtap.invalid');

-- ---------------------------------------------------------------------------
-- link_application
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok(
  $$ select public.link_application('00000000-0000-0000-0000-000000000455', '00000000-0000-0000-0000-0000000004a3') $$,
  '42501', null,
  'anon cannot call link_application'
);
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000004d2');
select throws_ok(
  $$ select public.link_application('00000000-0000-0000-0000-000000000455', '00000000-0000-0000-0000-0000000004a3') $$,
  '42501', null,
  'a reviewer without applications.decide cannot link'
);
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000004d1');
select lives_ok(
  $$ select public.link_application('00000000-0000-0000-0000-000000000451', '00000000-0000-0000-0000-0000000004a1') $$,
  'a decider links an approved anonymous application to a pending account'
);
reset role;
select is(pg_temp.profile_of('00000000-0000-0000-0000-0000000004a1'), 'active|Başvuru Bir',
  'linking an approved application activates the account and copies the application name');
select is((select profile_id from public.applications where id = '00000000-0000-0000-0000-000000000451'),
  '00000000-0000-0000-0000-0000000004a1'::uuid, 'the application now belongs to the account');

select pg_temp.login('00000000-0000-0000-0000-0000000004d1');
select lives_ok(
  $$ select public.link_application('00000000-0000-0000-0000-000000000452', '00000000-0000-0000-0000-0000000004a2') $$,
  'a decider links a contacted application to a pending account'
);
reset role;
select is(pg_temp.profile_of('00000000-0000-0000-0000-0000000004a2'), 'pending|Google Name',
  'linking an application under review keeps the account pending');

select pg_temp.login('00000000-0000-0000-0000-0000000004d1');
update public.applications set status = 'approved' where id = '00000000-0000-0000-0000-000000000452';
reset role;
select is(pg_temp.profile_of('00000000-0000-0000-0000-0000000004a2'), 'active|Başvuru İki',
  'approving the linked application later activates the account');

select pg_temp.login('00000000-0000-0000-0000-0000000004d1');
select throws_ok(
  $$ select public.link_application('00000000-0000-0000-0000-000000000451', '00000000-0000-0000-0000-0000000004a3') $$,
  'P0002', null,
  'an application that is already linked cannot be linked again'
);
select throws_ok(
  $$ select public.link_application('00000000-0000-0000-0000-000000000453', '00000000-0000-0000-0000-0000000004a3') $$,
  'P0002', null,
  'a rejected application cannot be linked'
);
select throws_ok(
  $$ select public.link_application('00000000-0000-0000-0000-0000000004ff', '00000000-0000-0000-0000-0000000004a3') $$,
  'P0002', null,
  'an unknown application cannot be linked'
);
select throws_ok(
  $$ select public.link_application('00000000-0000-0000-0000-000000000455', '00000000-0000-0000-0000-0000000004d4') $$,
  'P0002', null,
  'an application cannot be linked to an active account'
);
select throws_ok(
  $$ select public.link_application('00000000-0000-0000-0000-000000000455', '00000000-0000-0000-0000-0000000004a4') $$,
  'P0002', null,
  'an application cannot be linked to an account that already has one'
);
select throws_ok(
  $$ select public.link_application('00000000-0000-0000-0000-000000000455', '00000000-0000-0000-0000-0000000004aa') $$,
  'P0002', null,
  'an application cannot be linked to an inactive account'
);
select throws_ok(
  $$ select public.link_application('00000000-0000-0000-0000-000000000455', '00000000-0000-0000-0000-0000000004a6') $$,
  'P0002', null,
  'an application cannot be linked to an account whose email matches another open application'
);
select lives_ok(
  $$ select public.link_application('00000000-0000-0000-0000-00000000045c', '00000000-0000-0000-0000-0000000004ab') $$,
  'the application that matches the account by email can itself be linked to it'
);
reset role;
select is((select profile_id from public.applications where id = '00000000-0000-0000-0000-000000000455'), null,
  'refused links change nothing');
select is(pg_temp.profile_of('00000000-0000-0000-0000-0000000004d4'), 'active|Mert Member',
  'refused links leave the active account untouched');

-- A rejected linked application doesn't block linking a new one.
select pg_temp.login('00000000-0000-0000-0000-0000000004d1');
select ok(
  exists (select 1 from public.linkable_accounts('rejected-before@') where id = '00000000-0000-0000-0000-0000000004a8'),
  'an account whose only linked application was rejected is linkable'
);
select lives_ok(
  $$ select public.link_application('00000000-0000-0000-0000-000000000459', '00000000-0000-0000-0000-0000000004a8') $$,
  'a new application can be linked to an account with a rejected linked application'
);
reset role;
select is((select profile_id from public.applications where id = '00000000-0000-0000-0000-000000000459'),
  '00000000-0000-0000-0000-0000000004a8'::uuid, 'the new application now belongs to that account');

-- ---------------------------------------------------------------------------
-- linkable_accounts (scoped to fixtures by search / id prefix)
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000004d1');
select ok(
  exists (select 1 from public.linkable_accounts('unmatched@') where id = '00000000-0000-0000-0000-0000000004a5'),
  'a decider sees a pending account without any application'
);
select is(
  (select email from public.linkable_accounts('unmatched@') where id = '00000000-0000-0000-0000-0000000004a5'),
  'unmatched@pgtap.invalid', 'with its sign-in email'
);
select ok(
  exists (select 1 from public.linkable_accounts('shared@') where id = '00000000-0000-0000-0000-0000000004a7'),
  'an application with the same email that belongs to someone else does not hide the account'
);
select ok(
  not exists (select 1 from public.linkable_accounts('matched@') where id = '00000000-0000-0000-0000-0000000004a6'),
  'a pending account whose email matches an open application is not listed'
);
select ok(
  not exists (select 1 from public.linkable_accounts('own@pgtap') where id = '00000000-0000-0000-0000-0000000004a4'),
  'a pending account that already has a linked application is not listed'
);
select ok(
  not exists (select 1 from public.linkable_accounts('pgtap-member@') where id = '00000000-0000-0000-0000-0000000004d4')
  and not exists (select 1 from public.linkable_accounts('link-approved@') where id = '00000000-0000-0000-0000-0000000004a1'),
  'active members are not listed'
);
select results_eq(
  $$ select id from public.linkable_accounts('zeynep KA') where id::text like '00000000-0000-0000-0000-0000000004%' $$,
  $$ values ('00000000-0000-0000-0000-0000000004a5'::uuid) $$,
  'search matches the name, case-insensitively'
);
select results_eq(
  $$ select id from public.linkable_accounts('UNMATCHED@PGTAP') where id::text like '00000000-0000-0000-0000-0000000004%' $$,
  $$ values ('00000000-0000-0000-0000-0000000004a5'::uuid) $$,
  'search matches the email, case-insensitively'
);
select is(
  (select count(*)::int from public.linkable_accounts('%') where id::text like '00000000-0000-0000-0000-0000000004%'), 0,
  'search treats % literally'
);
select results_eq(
  $$ select id from public.linkable_accounts('keyset-') $$,
  $$ values ('00000000-0000-0000-0000-0000000004c1'::uuid), ('00000000-0000-0000-0000-0000000004c3'::uuid),
            ('00000000-0000-0000-0000-0000000004c2'::uuid) $$,
  'newest first, ties by id desc'
);
select results_eq(
  $$ select id from public.linkable_accounts('keyset-', '2026-01-03 12:00+00', '00000000-0000-0000-0000-0000000004c1') $$,
  $$ values ('00000000-0000-0000-0000-0000000004c3'::uuid), ('00000000-0000-0000-0000-0000000004c2'::uuid) $$,
  'keyset arguments return the rows after the cursor'
);
select results_eq(
  $$ select id from public.linkable_accounts('keyset-', '2026-01-02 12:00+00', '00000000-0000-0000-0000-0000000004c3') $$,
  $$ values ('00000000-0000-0000-0000-0000000004c2'::uuid) $$,
  'keyset breaks created_at ties by id'
);
select is(
  (select count(*)::int from public.linkable_accounts('bulk-')), 26,
  'returns at most PAGE_SIZE + 1 (26) rows'
);
select throws_ok(
  $$ select * from public.linkable_accounts('keyset-', '2026-01-03 12:00+00', null) $$,
  '22023', null,
  'a cursor without after_id is rejected'
);
select throws_ok(
  $$ select * from public.linkable_accounts('keyset-', null, '00000000-0000-0000-0000-0000000004c1') $$,
  '22023', null,
  'a cursor without after_created is rejected'
);
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000004d2');
select throws_ok('select * from public.linkable_accounts()', '42501', null,
  'a reviewer without applications.decide cannot list linkable accounts');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000004d4');
select throws_ok('select * from public.linkable_accounts()', '42501', null,
  'a plain member cannot list linkable accounts');
reset role;

-- ---------------------------------------------------------------------------
-- my_application_status
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000004a4');
select is(public.my_application_status(), 'new'::public.application_status,
  'an applicant sees the status of their own linked application');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000004a6');
select is(public.my_application_status(), 'contacted'::public.application_status,
  'an applicant sees the status of an application with their sign-in email');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000004a7');
select is(public.my_application_status(), null,
  'an application with the same email that belongs to someone else is not reported');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000004a5');
select is(public.my_application_status(), null, 'no application → null');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000004a9');
select is(public.my_application_status(), 'new'::public.application_status,
  'the latest application counts, whether linked or matched by email');
reset role;

set local role anon;
select throws_ok('select public.my_application_status()', '42501', null, 'anon cannot call my_application_status');
reset role;

-- ---------------------------------------------------------------------------
-- pending_application_flags
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000004d3');
select results_eq(
  $$ select profile_id, has_application from public.pending_application_flags(array[
       '00000000-0000-0000-0000-0000000004a4', '00000000-0000-0000-0000-0000000004a5',
       '00000000-0000-0000-0000-0000000004a6', '00000000-0000-0000-0000-0000000004a7']::uuid[])
     order by profile_id $$,
  $$ values ('00000000-0000-0000-0000-0000000004a4'::uuid, true), ('00000000-0000-0000-0000-0000000004a5'::uuid, false),
            ('00000000-0000-0000-0000-0000000004a6'::uuid, true), ('00000000-0000-0000-0000-0000000004a7'::uuid, false) $$,
  'members.manage sees which pending accounts have a linked or email-matching application'
);
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000004d1');
select throws_ok(
  $$ select * from public.pending_application_flags(array['00000000-0000-0000-0000-0000000004a5']::uuid[]) $$,
  '42501', null,
  'a decider without members.manage cannot read the flags'
);
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000004d4');
select throws_ok(
  $$ select * from public.pending_application_flags(array['00000000-0000-0000-0000-0000000004a5']::uuid[]) $$,
  '42501', null,
  'a plain member cannot read the flags'
);
reset role;

set local role anon;
select throws_ok(
  $$ select * from public.pending_application_flags(array['00000000-0000-0000-0000-0000000004a5']::uuid[]) $$,
  '42501', null,
  'anon cannot read the flags'
);
reset role;

-- ---------------------------------------------------------------------------
-- set_member_name
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000004d3');
select lives_ok(
  $$ select public.set_member_name('00000000-0000-0000-0000-0000000004d4', '  Mert Yılmaz  ') $$,
  'a member manager renames a member'
);
reset role;
select is(pg_temp.profile_of('00000000-0000-0000-0000-0000000004d4'), 'active|Mert Yılmaz', 'the name is trimmed');

select pg_temp.login('00000000-0000-0000-0000-0000000004d3');
select throws_ok(
  $$ select public.set_member_name('00000000-0000-0000-0000-0000000004d4', ' x ') $$,
  '23514', null,
  'a name shorter than 2 characters is rejected'
);
select throws_ok(
  $$ select public.set_member_name('00000000-0000-0000-0000-0000000004d4', repeat('a', 121)) $$,
  '23514', null,
  'a name longer than 120 characters is rejected'
);
select throws_ok(
  $$ select public.set_member_name('00000000-0000-0000-0000-0000000004d5', 'Yeni Ad') $$,
  '42501', null,
  'a member manager cannot rename an admin'
);
select throws_ok(
  $$ select public.set_member_name('00000000-0000-0000-0000-0000000004ff', 'Yeni Ad') $$,
  'P0002', null,
  'an unknown member → P0002'
);
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000004d4');
select throws_ok(
  $$ select public.set_member_name('00000000-0000-0000-0000-0000000004a5', 'Yeni Ad') $$,
  '42501', null,
  'a plain member cannot rename others'
);
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000004d5');
select lives_ok(
  $$ select public.set_member_name('00000000-0000-0000-0000-0000000004d6', 'Ali Yönetici') $$,
  'an admin can rename another admin'
);
reset role;
select is(pg_temp.profile_of('00000000-0000-0000-0000-0000000004d6'), 'active|Ali Yönetici', 'the admin was renamed');
select is(pg_temp.profile_of('00000000-0000-0000-0000-0000000004d5'), 'active|Ada Admin', 'refused renames change nothing');

select * from finish();
rollback;
