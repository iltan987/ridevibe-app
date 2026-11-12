-- Run with: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;

select plan(57);

-- Fixtures (postgres bypasses RLS). Ids 0000…0611–0616, role 0653; every query is scoped to them.
-- 611 owner (active), 612 other active, 613 members.safety, 614 admin, 615 pending, 616 inactive.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000611', 'pgtap-sh-owner@pgtap.invalid',    '{"full_name": "Olcay Owner"}'),
  ('00000000-0000-0000-0000-000000000612', 'pgtap-sh-other@pgtap.invalid',    '{"full_name": "Orhan Other"}'),
  ('00000000-0000-0000-0000-000000000613', 'pgtap-sh-safety@pgtap.invalid',   '{"full_name": "Selin Safety"}'),
  ('00000000-0000-0000-0000-000000000614', 'pgtap-sh-admin@pgtap.invalid',    '{"full_name": "Adem Admin"}'),
  ('00000000-0000-0000-0000-000000000615', 'pgtap-sh-pending@pgtap.invalid',  '{"full_name": "Pelin Pending"}'),
  ('00000000-0000-0000-0000-000000000616', 'pgtap-sh-inactive@pgtap.invalid', '{"full_name": "Ilgın Inactive"}');

insert into public.roles (id, name) values ('00000000-0000-0000-0000-000000000653', 'pgtap-sh-safety');
insert into public.role_permissions (role_id, permission) values ('00000000-0000-0000-0000-000000000653', 'members.safety');
update public.profiles set status = 'active'
  where id in ('00000000-0000-0000-0000-000000000611', '00000000-0000-0000-0000-000000000612');
update public.profiles set status = 'active', role_id = '00000000-0000-0000-0000-000000000653'
  where id = '00000000-0000-0000-0000-000000000613';
update public.profiles set status = 'active', role_id = (select id from public.roles where is_admin)
  where id = '00000000-0000-0000-0000-000000000614';
update public.profiles set status = 'inactive' where id = '00000000-0000-0000-0000-000000000616';

-- The inactive member consented earlier (seeded as postgres).
insert into public.member_health (profile_id, blood_type, consent_blood_type, consent_blood_type_at, consent_blood_type_version)
  values ('00000000-0000-0000-0000-000000000616', '0-', true, '2020-01-01 00:00:00+00', 'old');

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

select ok(
  (select relrowsecurity from pg_class where oid = 'public.member_health'::regclass),
  'RLS is enabled on member_health'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.safety_access_log'::regclass),
  'RLS is enabled on safety_access_log'
);

-- Function privileges
select is(has_function_privilege('anon', 'private.log_safety_access(public.safety_action, uuid, text)', 'execute'), false, 'anon cannot execute log_safety_access');
select is(has_function_privilege('authenticated', 'private.log_safety_access(public.safety_action, uuid, text)', 'execute'), false, 'authenticated cannot execute log_safety_access');
select is(has_function_privilege('anon', 'public.set_my_blood_type(public.blood_type, text)', 'execute'), false, 'anon cannot execute set_my_blood_type');
select is(has_function_privilege('anon', 'public.withdraw_my_blood_type_consent()', 'execute'), false, 'anon cannot execute withdraw_my_blood_type_consent');
select is(has_function_privilege('authenticated', 'public.set_my_blood_type(public.blood_type, text)', 'execute'), true, 'authenticated can execute set_my_blood_type');
select is(has_function_privilege('authenticated', 'public.withdraw_my_blood_type_consent()', 'execute'), true, 'authenticated can execute withdraw_my_blood_type_consent');

-- Owner (active): no direct writes
select pg_temp.login('00000000-0000-0000-0000-000000000611');
select throws_ok(
  $$ insert into public.member_health (profile_id, blood_type, consent_blood_type, consent_blood_type_at)
     values ('00000000-0000-0000-0000-000000000611', 'A+', true, now()) $$,
  '42501', null, 'owner cannot insert into member_health directly'
);
select throws_ok(
  $$ update public.member_health set blood_type = 'A+' where profile_id = '00000000-0000-0000-0000-000000000611' $$,
  '42501', null, 'owner cannot update member_health directly'
);
select throws_ok(
  $$ delete from public.member_health where profile_id = '00000000-0000-0000-0000-000000000611' $$,
  '42501', null, 'owner cannot delete from member_health directly'
);

-- Owner sets the blood type through the RPC
select lives_ok($$ select public.set_my_blood_type('A+', '2026-11-12-v1') $$, 'owner sets A+');
select results_eq(
  $$ select blood_type::text, consent_blood_type, consent_blood_type_version, consent_blood_type_at is not null
       from public.member_health where profile_id = '00000000-0000-0000-0000-000000000611' $$,
  $$ values ('A+', true, '2026-11-12-v1', true) $$,
  'the row holds type, consent, version and a timestamp'
);
select lives_ok($$ select public.set_my_blood_type('0-', '2026-11-12-v1') $$, 'owner changes the type');
select is(
  (select blood_type::text from public.member_health where profile_id = '00000000-0000-0000-0000-000000000611'),
  '0-', 'the type changed to 0-'
);

-- A type change keeps the stamp of the first consent (the member did not see the consent text again)
reset role;
update public.member_health set consent_blood_type_at = '2020-01-01 00:00:00+00'
  where profile_id = '00000000-0000-0000-0000-000000000611';
select pg_temp.login('00000000-0000-0000-0000-000000000611');
select lives_ok($$ select public.set_my_blood_type('A-', 'v-later') $$, 'owner changes the type with a newer notice version');
select results_eq(
  $$ select blood_type::text, consent_blood_type_at = '2020-01-01 00:00:00+00', consent_blood_type_version
       from public.member_health where profile_id = '00000000-0000-0000-0000-000000000611' $$,
  $$ values ('A-', true, '2026-11-12-v1') $$,
  'a type change keeps the first consent time and version'
);
select is(
  pg_temp.error_of($$ select public.set_my_blood_type(null, 'v') $$),
  '23514|', 'a null type is rejected with 23514'
);
select is(
  pg_temp.error_of($$ select public.set_my_blood_type('A+', repeat('a', 41)) $$),
  '23514|', 'a 41-character version is rejected with 23514'
);
select is(
  pg_temp.error_of($$ select public.set_my_blood_type('A+', null) $$),
  '23514|', 'a null version is rejected with 23514'
);
select is(
  pg_temp.error_of($$ select public.set_my_blood_type('A+', '   ') $$),
  '23514|', 'a blank version is rejected with 23514'
);
select lives_ok($$ select public.set_my_blood_type('B-', repeat('a', 40)) $$, 'a 40-character version is accepted');
select lives_ok($$ select public.set_my_blood_type('0-', '2026-11-12-v1') $$, 'owner sets 0- again');

-- Read access
select is(
  (select count(*)::int from public.member_health), 1, 'owner reads only their own row'
);

-- Other members and staff cannot read the row
select pg_temp.login('00000000-0000-0000-0000-000000000612');
select is(
  (select count(*)::int from public.member_health where profile_id = '00000000-0000-0000-0000-000000000611'),
  0, 'another active member does not see the owner''s row'
);
select lives_ok($$ select public.set_my_blood_type('AB+', 'v') $$, 'the other member sets AB+ for themselves');
select is(
  (select blood_type::text from public.member_health where profile_id = '00000000-0000-0000-0000-000000000612'),
  'AB+', 'the other member reads their own row'
);
select pg_temp.login('00000000-0000-0000-0000-000000000613');
select is(
  (select count(*)::int from public.member_health
    where profile_id in ('00000000-0000-0000-0000-000000000611', '00000000-0000-0000-0000-000000000612')),
  0, 'members.safety does not read member_health directly'
);

-- Pending cannot set
select pg_temp.login('00000000-0000-0000-0000-000000000615');
select throws_ok($$ select public.set_my_blood_type('A+', 'v') $$, '42501', null, 'a pending member cannot set a blood type');
select pg_temp.login('00000000-0000-0000-0000-000000000616');
select throws_ok($$ select public.set_my_blood_type('A+', 'v') $$, '42501', null, 'an inactive member cannot set a blood type');

-- Check constraint (as postgres)
reset role;
select is(
  pg_temp.error_of($$ insert into public.member_health (profile_id, blood_type, consent_blood_type, consent_blood_type_at)
     values ('00000000-0000-0000-0000-000000000615', 'A+', false, now()) $$),
  '23514|member_health_consent',
  'a type without consent is rejected (member_health_consent)'
);

-- Withdrawing
select is(
  (select blood_type::text from public.member_health where profile_id = '00000000-0000-0000-0000-000000000611'),
  '0-', 'owner still holds 0- before withdrawing'
);
update public.member_health set consent_blood_type_at = '2020-01-01 00:00:00+00'
  where profile_id = '00000000-0000-0000-0000-000000000611';
select pg_temp.login('00000000-0000-0000-0000-000000000611');
select lives_ok($$ select public.withdraw_my_blood_type_consent() $$, 'owner withdraws consent');
select results_eq(
  $$ select blood_type::text, consent_blood_type, consent_blood_type_at > '2020-01-01 00:00:00+00'
       from public.member_health where profile_id = '00000000-0000-0000-0000-000000000611' $$,
  $$ values (null::text, false, true) $$,
  'type cleared, consent false, timestamp advanced'
);
select lives_ok($$ select public.withdraw_my_blood_type_consent() $$, 'withdrawing again lives');
select is(
  (select blood_type::text from public.member_health where profile_id = '00000000-0000-0000-0000-000000000611'),
  null, 'the type is still null'
);

-- Consenting again after a withdrawal stamps a new time and version
reset role;
update public.member_health set consent_blood_type_at = '2020-01-01 00:00:00+00'
  where profile_id = '00000000-0000-0000-0000-000000000611';
select pg_temp.login('00000000-0000-0000-0000-000000000611');
select lives_ok($$ select public.set_my_blood_type('A+', 'v-reconsent') $$, 'owner consents again after withdrawing');
select results_eq(
  $$ select blood_type::text, consent_blood_type, consent_blood_type_at > '2020-01-01 00:00:00+00', consent_blood_type_version
       from public.member_health where profile_id = '00000000-0000-0000-0000-000000000611' $$,
  $$ values ('A+', true, true, 'v-reconsent') $$,
  'a re-consent stamps a new time and version'
);
select pg_temp.login('00000000-0000-0000-0000-000000000615');
select lives_ok($$ select public.withdraw_my_blood_type_consent() $$, 'a member without a row withdraws without error');
select pg_temp.login('00000000-0000-0000-0000-000000000616');
select lives_ok($$ select public.withdraw_my_blood_type_consent() $$, 'an inactive member withdraws');
select is(
  (select blood_type::text from public.member_health where profile_id = '00000000-0000-0000-0000-000000000616'),
  null, 'the inactive member''s type is cleared'
);

reset role;
select is(
  (select count(*)::int from public.member_health where profile_id = '00000000-0000-0000-0000-000000000615'),
  0, 'the no-op withdrawal created no row'
);

-- Access log (as postgres)
select is(
  (select count(*)::int from public.safety_access_log
    where action = 'set_blood_type' and actor_id = target_id and actor_id = '00000000-0000-0000-0000-000000000611'),
  6, 'six set_blood_type rows for the owner (actor = target)'
);
select is(
  (select count(*)::int from public.safety_access_log
    where action = 'withdraw_blood_type' and actor_id = target_id
      and actor_id in ('00000000-0000-0000-0000-000000000611', '00000000-0000-0000-0000-000000000616')),
  2, 'one withdraw row each for the owner and the inactive member (the repeat is a no-op)'
);
select is(
  (select count(*)::int from public.safety_access_log
    where actor_id in ('00000000-0000-0000-0000-000000000615', '00000000-0000-0000-0000-000000000616')
      and action = 'set_blood_type'),
  0, 'rejected sets wrote no log row'
);

-- Log visibility
select pg_temp.login('00000000-0000-0000-0000-000000000613');
select is(
  (select count(*)::int from public.safety_access_log where actor_id = '00000000-0000-0000-0000-000000000611'),
  0, 'members.safety cannot read the access log'
);
select pg_temp.login('00000000-0000-0000-0000-000000000611');
select is(
  (select count(*)::int from public.safety_access_log where actor_id = '00000000-0000-0000-0000-000000000611'),
  0, 'the owner cannot read their own log rows'
);
select throws_ok(
  $$ insert into public.safety_access_log (actor_id, target_id, action)
     values ('00000000-0000-0000-0000-000000000611', '00000000-0000-0000-0000-000000000611', 'view_card') $$,
  '42501', null, 'owner cannot insert into the access log'
);
select pg_temp.login('00000000-0000-0000-0000-000000000614');
select ok(
  (select count(*)::int from public.safety_access_log where actor_id = '00000000-0000-0000-0000-000000000611') >= 5,
  'the admin reads the fixture log rows'
);
select throws_ok($$ update public.safety_access_log set detail = 'x' where actor_id = '00000000-0000-0000-0000-000000000611' $$,
  '42501', null, 'admin cannot update the access log');
select throws_ok($$ delete from public.safety_access_log where actor_id = '00000000-0000-0000-0000-000000000611' $$,
  '42501', null, 'admin cannot delete from the access log');
reset role;
select is(has_sequence_privilege('authenticated', 'public.safety_access_log_id_seq', 'usage'), false, 'authenticated has no usage on the log sequence');
select is(has_sequence_privilege('anon', 'public.safety_access_log_id_seq', 'usage'), false, 'anon has no usage on the log sequence');

-- Deleting a profile cascades member_health and unlinks (not deletes) its log rows
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000617', 'pgtap-sh-gone@pgtap.invalid');
insert into public.member_health (profile_id, blood_type, consent_blood_type, consent_blood_type_at)
  values ('00000000-0000-0000-0000-000000000617', 'A+', true, now());
insert into public.safety_access_log (actor_id, target_id, action, detail) values
  ('00000000-0000-0000-0000-000000000617', '00000000-0000-0000-0000-000000000617', 'set_blood_type', 'pgtap-617'),
  ('00000000-0000-0000-0000-000000000617', null, 'filter_blood_type', 'pgtap-617');
delete from auth.users where id = '00000000-0000-0000-0000-000000000617';
select is(
  (select count(*)::int from public.member_health where profile_id = '00000000-0000-0000-0000-000000000617'),
  0, 'deleting the profile removed its member_health row'
);
select is(
  (select count(*)::int from public.safety_access_log where detail = 'pgtap-617' and actor_id is null and target_id is null),
  2, 'its log rows remain with null actor and target'
);
set local role anon;
select throws_ok('select * from public.safety_access_log', '42501', null, 'anon cannot read the access log');
select throws_ok('select * from public.member_health', '42501', null, 'anon cannot read member_health');
reset role;

select * from finish();
rollback;
