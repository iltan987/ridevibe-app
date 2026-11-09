-- Run with: pnpm db:test
-- Applications belong to accounts (profile_id), staff contact corrections,
-- the Turkish mobile rule, and activation by account / corrected email.
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

-- Fixtures: a reviewer (view + review), a decider (view + decide), two
-- pending accounts that sign in before applying.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000003b1', 'pgtap-reviewer@pgtap.invalid', '{"full_name": "Rana Reviewer"}'),
  ('00000000-0000-0000-0000-0000000003d1', 'pgtap-decider@pgtap.invalid', '{"full_name": "Deniz Decider"}'),
  ('00000000-0000-0000-0000-0000000003a1', 'signed@pgtap.invalid', '{"full_name": "Google Name"}'),
  ('00000000-0000-0000-0000-0000000003a2', 'other-signed@pgtap.invalid', '{"full_name": "Other Person"}');
insert into public.roles (id, name) values
  ('00000000-0000-0000-0000-0000000003e1', 'pgtap-reviewer'),
  ('00000000-0000-0000-0000-0000000003e2', 'pgtap-decider');
insert into public.role_permissions (role_id, permission) values
  ('00000000-0000-0000-0000-0000000003e1', 'applications.view'),
  ('00000000-0000-0000-0000-0000000003e1', 'applications.review'),
  ('00000000-0000-0000-0000-0000000003e2', 'applications.view'),
  ('00000000-0000-0000-0000-0000000003e2', 'applications.decide');
update public.profiles set role_id = '00000000-0000-0000-0000-0000000003e1', status = 'active'
  where id = '00000000-0000-0000-0000-0000000003b1';
update public.profiles set role_id = '00000000-0000-0000-0000-0000000003e2', status = 'active'
  where id = '00000000-0000-0000-0000-0000000003d1';

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- A minimal valid application, inserted with the caller's rights. profile_id
-- is only in the column list when given (anon has no grant on it), and there
-- is no RETURNING (applicants can't read applications).
create function pg_temp.apply(
  app_email text, app_phone text default '+905321234567', app_profile uuid default null,
  app_name text default 'Aday Kişi'
) returns void language plpgsql as $$
begin
  if app_profile is null then
    insert into public.applications (
      full_name, phone, email, birth_date, district, side, languages, license_class, riding_years, owns_motorcycle,
      riding_styles, group_experience, in_other_clubs, heard_from, event_interests, expectations,
      alienating_behaviors, consent_privacy, consent_rules, privacy_notice_version
    ) values (
      app_name, app_phone, app_email, '1995-05-17', 'Kadıköy', 'asian', array['tr'], 'a2', 3, false,
      array['city'], 'some', false, 'friend', array['day_rides'], 'Güvenli grup sürüşleri.',
      'Tehlikeli sürüş.', true, true, 'test'
    );
  else
    insert into public.applications (
      full_name, phone, email, birth_date, district, side, languages, license_class, riding_years, owns_motorcycle,
      riding_styles, group_experience, in_other_clubs, heard_from, event_interests, expectations,
      alienating_behaviors, consent_privacy, consent_rules, privacy_notice_version, profile_id
    ) values (
      app_name, app_phone, app_email, '1995-05-17', 'Kadıköy', 'asian', array['tr'], 'a2', 3, false,
      array['city'], 'some', false, 'friend', array['day_rides'], 'Güvenli grup sürüşleri.',
      'Tehlikeli sürüş.', true, true, 'test', app_profile
    );
  end if;
end;
$$;
grant execute on function pg_temp.apply(text, text, uuid, text) to anon, authenticated;

create function pg_temp.app_id(app_email text) returns uuid language sql as $$
  select id from public.applications where email = app_email;
$$;

create function pg_temp.approve(app uuid) returns void language plpgsql as $$
begin
  perform pg_temp.login('00000000-0000-0000-0000-0000000003d1');
  update public.applications set status = 'approved' where id = app;
  reset role;
end;
$$;

create function pg_temp.profile_of(user_email text) returns text language sql as $$
  select p.status || '|' || p.full_name
  from public.profiles p join auth.users u on u.id = p.id where u.email = user_email;
$$;

-- ---------------------------------------------------------------------------
-- Submitting: profile_id only for signed-in applicants, only their own
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok(
  $$ select pg_temp.apply('anon-owner@pgtap.invalid', app_profile => '00000000-0000-0000-0000-0000000003a1') $$,
  '42501', null,
  'anon cannot set profile_id'
);
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000003a1');
select lives_ok(
  $$ select pg_temp.apply('form@pgtap.invalid', app_profile => '00000000-0000-0000-0000-0000000003a1', app_name => 'Form Adı') $$,
  'a signed-in (pending) applicant can submit an application for their own account'
);
select throws_ok(
  $$ select pg_temp.apply('someone-else@pgtap.invalid', app_profile => '00000000-0000-0000-0000-0000000003a2') $$,
  '42501', null,
  'a signed-in applicant cannot submit for another account'
);
select throws_ok(
  $$ select pg_temp.apply('form2@pgtap.invalid', app_profile => '00000000-0000-0000-0000-0000000003a1') $$,
  '23505', null,
  'a second open application for the same account (different email) is rejected'
);
reset role;

-- ---------------------------------------------------------------------------
-- Turkish mobile rule and email normalisation on submit
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok(
  $$ select pg_temp.apply('landline@pgtap.invalid', '+904001234567') $$,
  '23514', null,
  'a +90 number that is not a mobile (+905…) is rejected'
);
select lives_ok(
  $$ select pg_temp.apply('mobile@pgtap.invalid', '+905001234567') $$,
  'a Turkish mobile number is accepted'
);
select lives_ok(
  $$ select pg_temp.apply('foreign@pgtap.invalid', '+4915112345678') $$,
  'a foreign number is accepted'
);
select pg_temp.apply(' Ali@PgTap.INVALID ');
reset role;

select is(
  (select email from public.applications where email like 'ali@%'), 'ali@pgtap.invalid',
  'the email is still trimmed and lowercased on submit'
);

-- ---------------------------------------------------------------------------
-- Staff corrections (reviewer: applications.view + applications.review)
-- ---------------------------------------------------------------------------
select pg_temp.apply('legacy@pgtap.invalid');
set local session_replication_role = replica;
update public.applications set phone = '+904001234567' where email = 'legacy@pgtap.invalid';
set local session_replication_role = origin;

select pg_temp.login('00000000-0000-0000-0000-0000000003b1');
select lives_ok(
  $$ update public.applications set full_name = 'Gerçek Ad', phone = '+905321112233', email = 'NEW@pgtap.invalid'
     where email = 'mobile@pgtap.invalid' $$,
  'reviewers can correct name, phone and email'
);
select is(
  (select full_name || '|' || phone || '|' || email from public.applications where email like 'new@%'),
  'Gerçek Ad|+905321112233|new@pgtap.invalid',
  'corrections are stored, the email lowercased'
);
select throws_ok(
  $$ update public.applications set phone = '+904441112233' where email = 'new@pgtap.invalid' $$,
  '23514', null,
  'a correction to a +90 non-mobile number is rejected'
);
select lives_ok(
  $$ update public.applications set email = 'legacy2@pgtap.invalid' where email = 'legacy@pgtap.invalid' $$,
  'an old row with a non-mobile +90 number can still get an email correction'
);
select throws_ok(
  $$ update public.applications set district = 'X' where email = 'new@pgtap.invalid' $$,
  '42501', null,
  'other answers stay read-only for staff'
);
reset role;

-- ---------------------------------------------------------------------------
-- Activation by account
-- ---------------------------------------------------------------------------
select pg_temp.approve(pg_temp.app_id('form@pgtap.invalid'));
select is(pg_temp.profile_of('signed@pgtap.invalid'), 'active|Form Adı',
  'approving an application submitted while signed in activates that account (other email) and copies the name');

-- Approved under a wrong email, then corrected to the sign-in email.
set local role anon;
select pg_temp.apply('wrong@pgtap.invalid', app_name => 'Doğru Kişi');
reset role;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000003a3', 'right@pgtap.invalid', '{"full_name": "Right Google"}');
select pg_temp.approve(pg_temp.app_id('wrong@pgtap.invalid'));
select pg_temp.login('00000000-0000-0000-0000-0000000003b1');
update public.applications set email = 'right@pgtap.invalid' where email = 'wrong@pgtap.invalid';
reset role;
select is(
  pg_temp.profile_of('right@pgtap.invalid') || '|' ||
    coalesce((select profile_id::text from public.applications where email = 'right@pgtap.invalid'), '-'),
  'active|Doğru Kişi|00000000-0000-0000-0000-0000000003a3',
  'correcting an approved application''s email to the sign-in email activates and links that account'
);

-- Inactive (suspended) accounts are never re-activated or renamed.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000003a4', 'inactive@pgtap.invalid', '{"full_name": "Eski Ad"}');
update public.profiles set status = 'inactive' where id = '00000000-0000-0000-0000-0000000003a4';
set local role anon;
select pg_temp.apply('inactive@pgtap.invalid', app_name => 'Yeni Ad');
reset role;
select pg_temp.approve(pg_temp.app_id('inactive@pgtap.invalid'));
select is(pg_temp.profile_of('inactive@pgtap.invalid'), 'inactive|Eski Ad',
  'an approved application never re-activates or renames an inactive account (email match)');

-- Same through profile_id: the account applied while pending, then was suspended.
select pg_temp.login('00000000-0000-0000-0000-0000000003a2');
select pg_temp.apply('linked-inactive@pgtap.invalid', app_profile => '00000000-0000-0000-0000-0000000003a2', app_name => 'Yeni Ad');
reset role;
update public.profiles set status = 'inactive' where id = '00000000-0000-0000-0000-0000000003a2';
select pg_temp.approve(pg_temp.app_id('linked-inactive@pgtap.invalid'));
select is(pg_temp.profile_of('other-signed@pgtap.invalid'), 'inactive|Other Person',
  'an approved application never re-activates or renames an inactive account (profile_id)');

select * from finish();
rollback;
