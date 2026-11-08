-- Run with: pnpm db:test
-- Approval → membership, and privacy of sign-in emails (member_contacts).
begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

-- Fixtures: a decider (view + decide), a member manager, an active member.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000002d1', 'pgtap-decider@pgtap.invalid', '{"full_name": "Deniz Decider"}'),
  ('00000000-0000-0000-0000-0000000002f1', 'pgtap-manager@pgtap.invalid', '{"full_name": "Mine Manager"}'),
  ('00000000-0000-0000-0000-0000000002c1', 'pgtap-member@pgtap.invalid', '{"full_name": "Mert Member"}');
insert into public.roles (id, name) values
  ('00000000-0000-0000-0000-0000000002e1', 'pgtap-decider'),
  ('00000000-0000-0000-0000-0000000002e2', 'pgtap-manager');
insert into public.role_permissions (role_id, permission) values
  ('00000000-0000-0000-0000-0000000002e1', 'applications.view'),
  ('00000000-0000-0000-0000-0000000002e1', 'applications.decide'),
  ('00000000-0000-0000-0000-0000000002e2', 'members.manage');
update public.profiles set role_id = '00000000-0000-0000-0000-0000000002e1', status = 'active'
  where id = '00000000-0000-0000-0000-0000000002d1';
update public.profiles set role_id = '00000000-0000-0000-0000-0000000002e2', status = 'active'
  where id = '00000000-0000-0000-0000-0000000002f1';
update public.profiles set status = 'active' where id = '00000000-0000-0000-0000-0000000002c1';

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- A minimal valid application (as postgres).
create function pg_temp.apply(email text, district text default 'Kadıköy') returns uuid language sql as $$
  insert into public.applications (
    full_name, phone, email, birth_date, district, side, languages, license_class, riding_years, owns_motorcycle,
    riding_styles, group_experience, in_other_clubs, heard_from, event_interests, expectations,
    alienating_behaviors, consent_privacy, consent_rules, privacy_notice_version
  ) values (
    'Aday Kişi', '+905321234567', email, '1995-05-17', district, 'asian', array['tr'], 'a2', 3, false,
    array['city'], 'some', false, 'friend', array['day_rides'], 'Güvenli grup sürüşleri.',
    'Tehlikeli sürüş.', true, true, 'test'
  ) returning id;
$$;

create function pg_temp.approve(app uuid) returns void language plpgsql as $$
begin
  perform pg_temp.login('00000000-0000-0000-0000-0000000002d1');
  update public.applications set status = 'approved' where id = app;
  reset role;
end;
$$;

create function pg_temp.profile_of(user_email text) returns text language sql as $$
  select p.status || '|' || coalesce(p.district, '-') || '|' ||
         (select count(*) from public.applications a where a.profile_id = p.id)::text
  from public.profiles p join auth.users u on u.id = p.id where u.email = user_email;
$$;

select is(private.normalize_email(' Ali.Veli+rides@GoogleMail.com '), 'aliveli@gmail.com', 'Gmail: dots, +tag and googlemail ignored');
select is(private.normalize_email('Ali.Veli+x@Example.com'), 'ali.veli+x@example.com', 'other domains: only lowercased/trimmed');

-- ---------------------------------------------------------------------------
-- Sign in after approval
-- ---------------------------------------------------------------------------
select pg_temp.approve(pg_temp.apply('ali.veli@gmail.com', 'Moda'));
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000002a1', 'aliveli+x@gmail.com');
select is(pg_temp.profile_of('aliveli+x@gmail.com'), 'active|Moda|1',
  'signing in with the approved email (Gmail variant) activates, links and copies the district');

-- ---------------------------------------------------------------------------
-- Approval after sign in
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000002a2', 'early@pgtap.invalid');
select is(pg_temp.profile_of('early@pgtap.invalid'), 'pending|-|0', 'signing in without an approved application stays pending');
select pg_temp.approve(pg_temp.apply('EARLY@pgtap.invalid'));
select is(pg_temp.profile_of('early@pgtap.invalid'), 'active|Kadıköy|1', 'approving activates an account that signed in earlier');

-- ---------------------------------------------------------------------------
-- Things that must NOT activate
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000002a3', 'other@pgtap.invalid');
select pg_temp.approve(pg_temp.apply('different@pgtap.invalid'));
select is(pg_temp.profile_of('other@pgtap.invalid'), 'pending|-|0', 'a different email is not activated');

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000002a4', 'suspended@pgtap.invalid');
update public.profiles set status = 'inactive' where id = '00000000-0000-0000-0000-0000000002a4';
select pg_temp.approve(pg_temp.apply('suspended@pgtap.invalid'));
select is(pg_temp.profile_of('suspended@pgtap.invalid'), 'inactive|-|0', 'an inactive (suspended) account is never re-activated');

select pg_temp.apply('notyet@pgtap.invalid');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000002a5', 'notyet@pgtap.invalid');
select is(pg_temp.profile_of('notyet@pgtap.invalid'), 'pending|-|0', 'an application that is not approved yet does not activate');

-- ---------------------------------------------------------------------------
-- member_contacts privacy
-- ---------------------------------------------------------------------------
select is((select email from public.member_contacts where profile_id = '00000000-0000-0000-0000-0000000002c1'),
  'pgtap-member@pgtap.invalid', 'sign-up stores the sign-in email');

update auth.users set email = 'pgtap-member-new@pgtap.invalid' where id = '00000000-0000-0000-0000-0000000002c1';
select is((select email from public.member_contacts where profile_id = '00000000-0000-0000-0000-0000000002c1'),
  'pgtap-member-new@pgtap.invalid', 'an email change is synced');

set local role anon;
select throws_ok('select email from public.member_contacts', '42501', null, 'anon cannot read contacts');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000002c1');
select results_eq(
  $$ select profile_id from public.member_contacts where profile_id::text like '00000000-0000-0000-0000-0000000002%' $$,
  $$ values ('00000000-0000-0000-0000-0000000002c1'::uuid) $$,
  'a member sees only their own email, not other members'''
);
select throws_ok(
  $$ update public.member_contacts set email = 'x@pgtap.invalid' where profile_id = '00000000-0000-0000-0000-0000000002c1' $$,
  '42501', null,
  'members cannot change contacts'
);
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000002f1');
select is(
  (select count(*)::int from public.member_contacts where profile_id::text like '00000000-0000-0000-0000-0000000002%'),
  8, 'members.manage reads every email (to recognise pending sign-ups)'
);
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000002d1');
select is(
  (select count(*)::int from public.member_contacts where profile_id::text like '00000000-0000-0000-0000-0000000002%'),
  1, 'application deciders without members.manage see only their own email'
);
select throws_ok(
  $$ update public.applications set profile_id = '00000000-0000-0000-0000-0000000002d1' where email like '%@pgtap.invalid' $$,
  '42501', null,
  'staff cannot link applications by hand (only the activation logic does)'
);
reset role;

select * from finish();
rollback;
