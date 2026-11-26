-- Run with: pnpm db:test
-- "Gelmiyorum" (docs/superpowers/specs/2026-11-26-events-not-coming-design.md): event_declines readable as own rows
-- only, written only by decline_event / join_event (a member is never both coming and not coming), a no counts
-- nowhere a sign-up counts, organisers alone read who said no (event_decliners) and how many haven't answered
-- (event_unanswered).
-- Real members make up the unanswered totals (pgTAP also runs on production): only differences around fixture
-- actions are asserted.
begin;
create extension if not exists pgtap with schema extensions;

select plan(59);

-- Fixtures: 0801 organiser (active, role 0809 holding only events.manage), 0802 and 0805 active members, 0803 ön alım
-- member, 0804 inactive, 0806 deleting, 0807 pending (the profile default).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000801', 'pgtap-ed-organiser@pgtap.invalid', '{"full_name": "Orhan Pgtapgelmiyor"}'),
  ('00000000-0000-0000-0000-000000000802', 'pgtap-ed-member@pgtap.invalid',    '{"full_name": "Deniz Pgtapgelmiyor"}'),
  ('00000000-0000-0000-0000-000000000803', 'pgtap-ed-probation@pgtap.invalid', '{"full_name": "Çağla Pgtapgelmiyor"}'),
  ('00000000-0000-0000-0000-000000000804', 'pgtap-ed-inactive@pgtap.invalid',  '{"full_name": "Emre Pgtapgelmiyor"}'),
  ('00000000-0000-0000-0000-000000000805', 'pgtap-ed-member2@pgtap.invalid',   '{"full_name": "Pelin Pgtapgelmiyor"}'),
  ('00000000-0000-0000-0000-000000000806', 'pgtap-ed-deleting@pgtap.invalid',  '{"full_name": "Burak Pgtapgelmiyor"}'),
  ('00000000-0000-0000-0000-000000000807', 'pgtap-ed-pending@pgtap.invalid',   '{"full_name": "Ayla Pgtapgelmiyor"}');
insert into public.roles (id, name) values ('00000000-0000-0000-0000-000000000809', 'pgtap-ed-organiser');
insert into public.role_permissions (role_id, permission) values
  ('00000000-0000-0000-0000-000000000809', 'events.manage');

update public.profiles set status = 'active', role_id = '00000000-0000-0000-0000-000000000809'
  where id = '00000000-0000-0000-0000-000000000801';
update public.profiles set status = 'active'
  where id in ('00000000-0000-0000-0000-000000000802', '00000000-0000-0000-0000-000000000805');
update public.profiles set status = 'probation' where id = '00000000-0000-0000-0000-000000000803';
update public.profiles set status = 'inactive' where id = '00000000-0000-0000-0000-000000000804';
update public.profiles
  set status = 'deleting', deletion_requested_at = now(), status_before_deletion = 'active'
  where id = '00000000-0000-0000-0000-000000000806';

-- Events planted as postgres. now() is fixed for the whole test transaction: 0813 (starts_at = now()) has started.
-- 0819 is never inserted (the unknown event).
insert into public.events (id, kind, title, starts_at, limit_people, full_members_only) values
  ('00000000-0000-0000-0000-000000000810', 'meetup', 'pgtap-ed one place', now() + interval '2 days', 1, false),
  ('00000000-0000-0000-0000-000000000811', 'meetup', 'pgtap-ed full', now() + interval '2 days', 1, false),
  ('00000000-0000-0000-0000-000000000812', 'meetup', 'pgtap-ed full members only', now() + interval '2 days', null, true),
  ('00000000-0000-0000-0000-000000000813', 'meetup', 'pgtap-ed right now', now(), null, false),
  ('00000000-0000-0000-0000-000000000815', 'meetup', 'pgtap-ed only a no', now() + interval '2 days', null, false),
  ('00000000-0000-0000-0000-000000000816', 'meetup', 'pgtap-ed planted noes', now() + interval '2 days', null, false),
  ('00000000-0000-0000-0000-000000000817', 'meetup', 'pgtap-ed fmo empty', now() + interval '2 days', null, true),
  ('00000000-0000-0000-0000-000000000818', 'meetup', 'pgtap-ed empty', now() + interval '2 days', null, false);
insert into public.events (id, kind, title, starts_at, status, cancelled_at) values
  ('00000000-0000-0000-0000-000000000814', 'meetup', 'pgtap-ed cancelled', now() + interval '2 days', 'cancelled', now());

-- 0805 fills 0811 (limit 1), 0803 is signed up for the full-members-only 0812 (from before the rule), 0802 for the
-- cancelled 0814.
insert into public.event_signups (event_id, profile_id, role, guests) values
  ('00000000-0000-0000-0000-000000000811', '00000000-0000-0000-0000-000000000805', 'passenger', 0),
  ('00000000-0000-0000-0000-000000000812', '00000000-0000-0000-0000-000000000803', 'passenger', 0),
  ('00000000-0000-0000-0000-000000000814', '00000000-0000-0000-0000-000000000802', 'passenger', 0);
-- 0810 (one place): only 0805's no; 0815: only 0802's no (the delete case); 0816: the no's of the ön alım, inactive,
-- deleting and pending people.
insert into public.event_declines (event_id, profile_id) values
  ('00000000-0000-0000-0000-000000000810', '00000000-0000-0000-0000-000000000805'),
  ('00000000-0000-0000-0000-000000000815', '00000000-0000-0000-0000-000000000802'),
  ('00000000-0000-0000-0000-000000000816', '00000000-0000-0000-0000-000000000807'),
  ('00000000-0000-0000-0000-000000000816', '00000000-0000-0000-0000-000000000803'),
  ('00000000-0000-0000-0000-000000000816', '00000000-0000-0000-0000-000000000804'),
  ('00000000-0000-0000-0000-000000000816', '00000000-0000-0000-0000-000000000806');

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- Runs a statement and returns the error's sqlstate and hint (both null when it succeeds; then its effects stay).
-- throws_ok can't read hints.
create function pg_temp.last_error(stmt text) returns table (sqlstate text, hint text) language plpgsql as $$
declare
  v_state text;
  v_hint text;
begin
  execute stmt;
  return query select null::text, null::text;
exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_hint = pg_exception_hint;
  return query select v_state, v_hint;
end;
$$;

-- (sign-ups, declines) of one person on one event, read as postgres
create function pg_temp.answers(target uuid, person uuid) returns text language sql as $$
  select row(
    (select count(*) from public.event_signups where event_id = target and profile_id = person),
    (select count(*) from public.event_declines where event_id = target and profile_id = person))::text
$$;

-- ---------------------------------------------------------------------------
-- Grants: read own rows through RLS, write only through the RPCs; leave_event is gone
-- ---------------------------------------------------------------------------
select ok(has_table_privilege('authenticated', 'public.event_declines', 'select'), 'authenticated may select declines (RLS decides)');
select ok(not has_table_privilege('authenticated', 'public.event_declines', 'insert'), 'no direct insert');
select ok(not has_table_privilege('authenticated', 'public.event_declines', 'update'), 'no direct update');
select ok(not has_table_privilege('authenticated', 'public.event_declines', 'delete'), 'no direct delete');
select ok(not has_table_privilege('anon', 'public.event_declines', 'select'), 'anon has no select on declines');
select ok((select relrowsecurity from pg_class where oid = 'public.event_declines'::regclass), 'event_declines has RLS on');
select ok(not has_function_privilege('anon', 'public.decline_event(uuid)', 'execute'), 'anon cannot call decline_event');
select ok(not has_function_privilege('anon', 'public.event_decliners(uuid)', 'execute'), 'anon cannot call event_decliners');
select ok(not has_function_privilege('anon', 'public.event_unanswered(uuid)', 'execute'), 'anon cannot call event_unanswered');
select ok(has_function_privilege('authenticated', 'public.decline_event(uuid)', 'execute'),
  'authenticated may call decline_event (it checks the gate)');
select ok(has_function_privilege('authenticated', 'public.event_decliners(uuid)', 'execute'),
  'authenticated may call event_decliners (it checks the gate)');
select ok(has_function_privilege('authenticated', 'public.event_unanswered(uuid)', 'execute'),
  'authenticated may call event_unanswered (it checks the gate)');
select is((select count(*)::int from pg_proc where proname = 'decline_event' and pronamespace = 'public'::regnamespace), 1,
  'exactly one decline_event');
select is((select count(*)::int from pg_proc where proname = 'leave_event' and pronamespace = 'public'::regnamespace), 0,
  'leave_event is gone');

-- ---------------------------------------------------------------------------
-- RLS: own rows only; the gate refuses the inactive member
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-000000000802');
select lives_ok($$ select public.decline_event('00000000-0000-0000-0000-000000000816') $$, 'member says no to 0816');
select is((select count(*)::int from public.event_declines where event_id = '00000000-0000-0000-0000-000000000816'), 1,
  'member reads only their own no on 0816, not the planted ones');
reset role;

select pg_temp.login('00000000-0000-0000-0000-000000000804');
select throws_ok($$ select public.decline_event('00000000-0000-0000-0000-000000000818') $$, '42501', null,
  'inactive member cannot say no');
select is((select count(*)::int from public.event_declines where profile_id = '00000000-0000-0000-0000-000000000804'), 0,
  'inactive member reads not even their own kept no (the gate)');
select throws_ok($$ select * from public.event_decliners('00000000-0000-0000-0000-000000000816') $$, '42501', null,
  'inactive member refused (decliners)');
select throws_ok($$ select public.event_unanswered('00000000-0000-0000-0000-000000000818') $$, '42501', null,
  'inactive member refused (unanswered)');
reset role;

-- ---------------------------------------------------------------------------
-- decline_event: unknown, started, cancelled, full, full members only
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-000000000802');
select throws_ok($$ select public.decline_event('00000000-0000-0000-0000-000000000819') $$, 'P0002', null,
  'saying no to an unknown event → P0002');
select is((select hint from pg_temp.last_error($$ select public.decline_event('00000000-0000-0000-0000-000000000813') $$)
  where sqlstate = 'P0001'), 'started', 'saying no at starts_at exactly refused (P0001 started)');
select lives_ok($$ select public.decline_event('00000000-0000-0000-0000-000000000814') $$,
  'saying no to a cancelled event allowed');
reset role;
select is(pg_temp.answers('00000000-0000-0000-0000-000000000814', '00000000-0000-0000-0000-000000000802'), '(0,1)',
  'cancelled event: the sign-up is gone, the no is there');
select pg_temp.login('00000000-0000-0000-0000-000000000802');
select lives_ok($$ select public.decline_event('00000000-0000-0000-0000-000000000811') $$,
  'saying no to a full event allowed (no limit applies to a no)');
reset role;

select pg_temp.login('00000000-0000-0000-0000-000000000803');
select lives_ok($$ select public.decline_event('00000000-0000-0000-0000-000000000812') $$,
  'ön alım member signed up for a full-members-only event backs out');
select is((select hint from pg_temp.last_error($$ select public.decline_event('00000000-0000-0000-0000-000000000812') $$)
  where sqlstate = 'P0001'), 'full_members_only', '… but without a sign-up cannot say no again');
reset role;
select is(pg_temp.answers('00000000-0000-0000-0000-000000000812', '00000000-0000-0000-0000-000000000803'), '(0,1)',
  'the backed-out ön alım member: no sign-up, the no stays');
select pg_temp.login('00000000-0000-0000-0000-000000000803');
select is((select hint from pg_temp.last_error($$ select public.decline_event('00000000-0000-0000-0000-000000000817') $$)
  where sqlstate = 'P0001'), 'full_members_only', 'ön alım member cannot say no to a full-members-only event (P0001)');
reset role;
select is(pg_temp.answers('00000000-0000-0000-0000-000000000817', '00000000-0000-0000-0000-000000000803'), '(0,0)',
  'the refused no wrote no row');
select pg_temp.login('00000000-0000-0000-0000-000000000802');
select lives_ok($$ select public.decline_event('00000000-0000-0000-0000-000000000817') $$,
  'active member says no to a full-members-only event');
reset role;

-- ---------------------------------------------------------------------------
-- Exclusivity: joining removes the no, saying no removes the sign-up; a refused join keeps the no
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-000000000802');
select lives_ok($$ select public.join_event('00000000-0000-0000-0000-000000000816', 'passenger') $$,
  'member who said no joins 0816');
reset role;
select is(pg_temp.answers('00000000-0000-0000-0000-000000000816', '00000000-0000-0000-0000-000000000802'), '(1,0)',
  'joined: the sign-up is there, the no is gone');
select pg_temp.login('00000000-0000-0000-0000-000000000802');
select lives_ok($$ select public.decline_event('00000000-0000-0000-0000-000000000816') $$, 'member says no again');
select lives_ok($$ select public.decline_event('00000000-0000-0000-0000-000000000816') $$, 'saying no twice is a no-op');
reset role;
select is(pg_temp.answers('00000000-0000-0000-0000-000000000816', '00000000-0000-0000-0000-000000000802'), '(0,1)',
  'declined: the sign-up is gone, one no is there');
select pg_temp.login('00000000-0000-0000-0000-000000000802');
select is((select hint from pg_temp.last_error($$ select public.join_event('00000000-0000-0000-0000-000000000811', 'passenger') $$)
  where sqlstate = 'P0001'), 'people_limit', 'joining the full 0811 after saying no refused (P0001 people_limit)');
reset role;
select is(pg_temp.answers('00000000-0000-0000-0000-000000000811', '00000000-0000-0000-0000-000000000802'), '(0,1)',
  'the refused join keeps the no');

-- ---------------------------------------------------------------------------
-- A no counts nowhere: limits, counts, roster, delete_event
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-000000000802');
select lives_ok($$ select public.join_event('00000000-0000-0000-0000-000000000810', 'passenger') $$,
  'the one place of 0810 is still free beside a no (a no takes no place)');
reset role;

select pg_temp.login('00000000-0000-0000-0000-000000000801');
select is((select row(c.*)::text from public.event_counts(array['00000000-0000-0000-0000-000000000816']::uuid[]) c),
  row('00000000-0000-0000-0000-000000000816'::uuid, 0, 0, 0, 0, 0)::text,
  'counts of 0816: the no''s count as nothing');
select is((select count(*)::int from public.event_roster('00000000-0000-0000-0000-000000000816')), 0,
  'organiser: no roster rows for the no''s');
select lives_ok($$ select public.delete_event('00000000-0000-0000-0000-000000000815') $$,
  'an event with only a no is deleted (not has_signups)');
reset role;
select is((select count(*)::int from public.event_declines where event_id = '00000000-0000-0000-0000-000000000815'), 0,
  'the no went with the event (cascade)');

-- ---------------------------------------------------------------------------
-- event_decliners: organisers only; only active and ön alım people's no's
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-000000000801');
select is((select array_agg(row(r.profile_id, r.full_name, r.probation)::text order by r.ord)
  from public.event_decliners('00000000-0000-0000-0000-000000000816')
    with ordinality as r(profile_id, full_name, avatar_url, probation, ord)),
  array[row('00000000-0000-0000-0000-000000000803'::uuid, 'Çağla Pgtapgelmiyor', true)::text,
        row('00000000-0000-0000-0000-000000000802'::uuid, 'Deniz Pgtapgelmiyor', false)::text],
  'organiser: who said no, by Turkish name order, with the ön alım flag; not the inactive, deleting or pending people');
select is((select count(*)::int from public.event_decliners('00000000-0000-0000-0000-000000000816')
  where profile_id = '00000000-0000-0000-0000-000000000807'), 0,
  'organiser: a pending account''s planted no does not show');
select throws_ok($$ select * from public.event_decliners('00000000-0000-0000-0000-000000000819') $$, 'P0002', null,
  'decliners of an unknown event → P0002');
reset role;

select pg_temp.login('00000000-0000-0000-0000-000000000802');
select is((select count(*)::int from public.event_decliners('00000000-0000-0000-0000-000000000816')), 0,
  'active member: no rows (not an error)');
reset role;
select pg_temp.login('00000000-0000-0000-0000-000000000803');
select is((select count(*)::int from public.event_decliners('00000000-0000-0000-0000-000000000816')), 0,
  'ön alım member: no rows');
reset role;

set local role anon;
select throws_ok($$ select * from public.event_decliners('00000000-0000-0000-0000-000000000816') $$, '42501', null,
  'anon cannot call event_decliners');
reset role;

-- ---------------------------------------------------------------------------
-- event_unanswered: organisers only; changes around fixture actions
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-000000000802');
select is(public.event_unanswered('00000000-0000-0000-0000-000000000818'), null, 'active member: null');
reset role;
select pg_temp.login('00000000-0000-0000-0000-000000000803');
select is(public.event_unanswered('00000000-0000-0000-0000-000000000818'), null, 'ön alım member: null');
reset role;

select pg_temp.login('00000000-0000-0000-0000-000000000801');
select set_config('pgtap.unanswered_818', public.event_unanswered('00000000-0000-0000-0000-000000000818')::text, true);
reset role;
insert into public.event_declines (event_id, profile_id) values
  ('00000000-0000-0000-0000-000000000818', '00000000-0000-0000-0000-000000000805');
select pg_temp.login('00000000-0000-0000-0000-000000000801');
select is(public.event_unanswered('00000000-0000-0000-0000-000000000818'),
  current_setting('pgtap.unanswered_818')::int - 1, 'an active member''s no: one fewer unanswered');
reset role;
insert into public.event_declines (event_id, profile_id) values
  ('00000000-0000-0000-0000-000000000818', '00000000-0000-0000-0000-000000000803');
select pg_temp.login('00000000-0000-0000-0000-000000000801');
select is(public.event_unanswered('00000000-0000-0000-0000-000000000818'),
  current_setting('pgtap.unanswered_818')::int - 2, 'an ön alım member''s no: one fewer again');
reset role;
insert into public.event_signups (event_id, profile_id, role, guests) values
  ('00000000-0000-0000-0000-000000000818', '00000000-0000-0000-0000-000000000802', 'passenger', 0);
insert into public.event_declines (event_id, profile_id) values
  ('00000000-0000-0000-0000-000000000818', '00000000-0000-0000-0000-000000000804');
select pg_temp.login('00000000-0000-0000-0000-000000000801');
select is(public.event_unanswered('00000000-0000-0000-0000-000000000818'),
  current_setting('pgtap.unanswered_818')::int - 3,
  'a sign-up answers too; an inactive member''s no changes nothing');
reset role;

select pg_temp.login('00000000-0000-0000-0000-000000000801');
select set_config('pgtap.unanswered_817', public.event_unanswered('00000000-0000-0000-0000-000000000817')::text, true);
reset role;
insert into public.event_declines (event_id, profile_id) values
  ('00000000-0000-0000-0000-000000000817', '00000000-0000-0000-0000-000000000803');
select pg_temp.login('00000000-0000-0000-0000-000000000801');
select is(public.event_unanswered('00000000-0000-0000-0000-000000000817'),
  current_setting('pgtap.unanswered_817')::int, 'full members only: an ön alım member isn''t invited, their no changes nothing');
reset role;
insert into public.event_declines (event_id, profile_id) values
  ('00000000-0000-0000-0000-000000000817', '00000000-0000-0000-0000-000000000805');
select pg_temp.login('00000000-0000-0000-0000-000000000801');
select is(public.event_unanswered('00000000-0000-0000-0000-000000000817'),
  current_setting('pgtap.unanswered_817')::int - 1, 'full members only: an active member''s no counts');
select throws_ok($$ select public.event_unanswered('00000000-0000-0000-0000-000000000819') $$, 'P0002', null,
  'unanswered of an unknown event → P0002');
reset role;

-- ---------------------------------------------------------------------------
-- The account goes: its no's go too
-- ---------------------------------------------------------------------------
select ok((select count(*) from public.event_declines where profile_id = '00000000-0000-0000-0000-000000000802') > 0,
  'the member has no''s before the account goes');
delete from auth.users where id = '00000000-0000-0000-0000-000000000802';
select is((select count(*)::int from public.event_declines where profile_id = '00000000-0000-0000-0000-000000000802'), 0,
  'deleting the account removes its no''s (cascade)');

select * from finish();
rollback;
