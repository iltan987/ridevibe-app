-- Run with: pnpm db:test
-- Kept applications (retained_until): the application of a deleted inactive account stays unmatched, so a
-- later sign-up with the same email is not auto-approved, linked, listed as "applied" or shown its status;
-- staff see it as a former member. link_application also refuses applications hidden for a deletion.
begin;
create extension if not exists pgtap with schema extensions;

select plan(13);

-- Fixtures (ids …07c1–…07c9; applications use 7a-prefixed ids below).
--   7c1 application (kept), 7c2 new sign-up with its email, 7c3 members.manage, 7c4 applications.decide,
--   7c6 account being deleted + 7c5 approved application with its email, 7c7 pending link target
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000007c3', 'pgtap-ret-manager@pgtap.invalid', '{"full_name": "Mine Manager"}'),
  ('00000000-0000-0000-0000-0000000007c4', 'pgtap-ret-decider@pgtap.invalid', '{"full_name": "Deniz Decider"}'),
  ('00000000-0000-0000-0000-0000000007c6', 'pgtap-ret-deleting@pgtap.invalid', '{"full_name": "Dilek Siliniyor"}'),
  ('00000000-0000-0000-0000-0000000007c7', 'pgtap-ret-target@pgtap.invalid', '{"full_name": "Tuna Target"}');

insert into public.roles (id, name) values
  ('00000000-0000-0000-0000-0000000007e1', 'pgtap-ret-manager'),
  ('00000000-0000-0000-0000-0000000007e2', 'pgtap-ret-decider');
insert into public.role_permissions (role_id, permission) values
  ('00000000-0000-0000-0000-0000000007e1', 'members.manage'),
  ('00000000-0000-0000-0000-0000000007e2', 'applications.view'),
  ('00000000-0000-0000-0000-0000000007e2', 'applications.decide');
update public.profiles set role_id = '00000000-0000-0000-0000-0000000007e1', status = 'active'
  where id = '00000000-0000-0000-0000-0000000007c3';
update public.profiles set role_id = '00000000-0000-0000-0000-0000000007e2', status = 'active'
  where id = '00000000-0000-0000-0000-0000000007c4';
update public.profiles set status = 'deleting', deletion_requested_at = now(), status_before_deletion = 'active'
  where id = '00000000-0000-0000-0000-0000000007c6';

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.apply(app_id uuid, app_email text, app_status public.application_status)
returns void language sql as $$
  insert into public.applications (
    id, status, full_name, phone, email, birth_date, district, side, languages, license_class,
    riding_years, owns_motorcycle, riding_styles, group_experience, in_other_clubs, heard_from, event_interests,
    expectations, alienating_behaviors, consent_privacy, consent_rules, privacy_notice_version
  ) values (
    app_id, app_status, 'Aday Kişi', '+905321234567', app_email, '1995-05-17', 'Kadıköy', 'asian',
    array['tr'], 'a2', 3, false, array['city'], 'some', false, 'friend', array['day_rides'],
    'Güvenli grup sürüşleri.', 'Tehlikeli sürüş.', true, true, 'test'
  );
$$;

-- Kept application first, then the sign-up with its email.
select pg_temp.apply('00000000-0000-0000-0000-0000000007a1', 'pgtap-del-kept@pgtap.invalid', 'approved');
update public.applications set retained_until = now() + interval '1 year'
  where id = '00000000-0000-0000-0000-0000000007a1';
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000007c2', 'pgtap-del-kept@pgtap.invalid', '{"full_name": "Yeni Kisi"}');

select is(
  (select status::text from public.profiles where id = '00000000-0000-0000-0000-0000000007c2'),
  'pending',
  'a sign-up with the email of a kept approved application stays pending'
);
select is(
  (select profile_id from public.applications where id = '00000000-0000-0000-0000-0000000007a1'),
  null,
  'the kept application stays unlinked'
);

select pg_temp.login('00000000-0000-0000-0000-0000000007c2');
select is(public.my_application_status(), null, 'the new account sees no application status');
reset role;

-- Staff: former member flag
select pg_temp.login('00000000-0000-0000-0000-0000000007c3');
select is(
  (select has_application from public.pending_application_flags(array['00000000-0000-0000-0000-0000000007c2']::uuid[])),
  false,
  'the kept application does not count as an application'
);
select is(
  (select former_member from public.pending_application_flags(array['00000000-0000-0000-0000-0000000007c2']::uuid[])),
  true,
  'the account is flagged as a former member'
);
select is(
  (select former_member from public.pending_application_flags(array['00000000-0000-0000-0000-0000000007c7']::uuid[])),
  false,
  'an account without a kept application is not a former member'
);
reset role;

-- Decider: cannot link a kept application, but the account stays linkable
select pg_temp.login('00000000-0000-0000-0000-0000000007c4');
select throws_ok(
  $$ select public.link_application('00000000-0000-0000-0000-0000000007a1', '00000000-0000-0000-0000-0000000007c2') $$,
  'P0002', null,
  'a kept application cannot be linked'
);
select ok(
  exists (select 1 from public.linkable_accounts('pgtap-del-kept@') where id = '00000000-0000-0000-0000-0000000007c2'),
  'a kept application does not block the account in linkable_accounts'
);
reset role;

-- Hidden for deletion: unlinked application with the email of a deleting account
select pg_temp.apply('00000000-0000-0000-0000-0000000007a2', 'pgtap-ret-deleting@pgtap.invalid', 'approved');
select pg_temp.login('00000000-0000-0000-0000-0000000007c4');
select throws_ok(
  $$ select public.link_application('00000000-0000-0000-0000-0000000007a2', '00000000-0000-0000-0000-0000000007c7') $$,
  'P0002', null,
  'an application hidden for a deletion cannot be linked'
);
reset role;

-- The normal path still works: an approved application without a deadline activates a matching sign-up
select pg_temp.apply('00000000-0000-0000-0000-0000000007a3', 'pgtap-ret-normal@pgtap.invalid', 'approved');
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000007c8', 'pgtap-ret-normal@pgtap.invalid', '{"full_name": "Normal Kisi"}');
select is(
  (select status::text from public.profiles where id = '00000000-0000-0000-0000-0000000007c8'),
  'active',
  'an approved application without a deadline still activates a matching sign-up'
);
select pg_temp.login('00000000-0000-0000-0000-0000000007c8');
select is(public.my_application_status()::text, 'approved', 'and shows its status');
reset role;

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'pending_application_flags'),
  1,
  'one pending_application_flags overload'
);
select ok(
  has_function_privilege('authenticated', 'public.pending_application_flags(uuid[])', 'execute')
  and not has_function_privilege('anon', 'public.pending_application_flags(uuid[])', 'execute'),
  'pending_application_flags grants: authenticated only'
);

select * from finish();
rollback;
