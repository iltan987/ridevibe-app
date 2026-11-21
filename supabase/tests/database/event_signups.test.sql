-- Run with: pnpm db:test
-- Event sign-ups (docs/superpowers/plans/2026-11-21-events-joining.md, Global Constraints): the release gate in one
-- function (private.can_see_events), join_event / leave_event with their rules and refusal hints, "don't make it
-- worse" after an organiser tightens a rule, delete_event only without counted sign-ups, cascade when an account goes;
-- counts, rosters per viewer, authors and the change log save_event writes.
-- Two sections: GATE CLOSED (this branch: only events.manage holders) and GATE OPEN (the release body, swapped in
-- inside this transaction).
begin;
create extension if not exists pgtap with schema extensions;

select plan(155);

-- Fixtures: 0761 organiser (active, role 0769 holding only events.manage, 250 cc bike), 0762 second organiser (same
-- role, a bike without cc), 0763 active member without a role, 0764 ön alım member, 0765 organiser in deleting, 0766
-- inactive organiser, 0767 organiser with a 400 cc bike.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000761', 'pgtap-ej-organiser@pgtap.invalid',  '{"full_name": "Orhan Pgtapkatilim"}'),
  ('00000000-0000-0000-0000-000000000762', 'pgtap-ej-organiser2@pgtap.invalid', '{"full_name": "Selin Pgtapkatilim"}'),
  ('00000000-0000-0000-0000-000000000763', 'pgtap-ej-member@pgtap.invalid',     '{"full_name": "Pelin Pgtapkatilim"}'),
  ('00000000-0000-0000-0000-000000000764', 'pgtap-ej-probation@pgtap.invalid',  '{"full_name": "Okan Pgtapkatilim"}'),
  ('00000000-0000-0000-0000-000000000765', 'pgtap-ej-deleting@pgtap.invalid',   '{"full_name": "Deniz Pgtapkatilim"}'),
  ('00000000-0000-0000-0000-000000000766', 'pgtap-ej-inactive@pgtap.invalid',   '{"full_name": "Emre Pgtapkatilim"}'),
  ('00000000-0000-0000-0000-000000000767', 'pgtap-ej-organiser3@pgtap.invalid', '{"full_name": "Burak Pgtapkatilim"}');
insert into public.roles (id, name) values ('00000000-0000-0000-0000-000000000769', 'pgtap-ej-organiser');
insert into public.role_permissions (role_id, permission) values
  ('00000000-0000-0000-0000-000000000769', 'events.manage');

update public.profiles set status = 'active', role_id = '00000000-0000-0000-0000-000000000769'
  where id in ('00000000-0000-0000-0000-000000000761', '00000000-0000-0000-0000-000000000762',
               '00000000-0000-0000-0000-000000000767');
update public.profiles set status = 'active' where id = '00000000-0000-0000-0000-000000000763';
update public.profiles set status = 'probation' where id = '00000000-0000-0000-0000-000000000764';
update public.profiles
  set status = 'deleting', role_id = '00000000-0000-0000-0000-000000000769',
      deletion_requested_at = now(), status_before_deletion = 'active'
  where id = '00000000-0000-0000-0000-000000000765';
update public.profiles set status = 'inactive', role_id = '00000000-0000-0000-0000-000000000769'
  where id = '00000000-0000-0000-0000-000000000766';

insert into public.member_motorcycles (profile_id, brand, model, cc) values
  ('00000000-0000-0000-0000-000000000761', 'Honda', 'CBR250', 250),
  ('00000000-0000-0000-0000-000000000762', 'Vespa', 'Primavera', null),
  ('00000000-0000-0000-0000-000000000767', 'KTM', 'Duke 390', 400);

-- Events planted as postgres. now() is fixed for the whole test transaction and the RPCs read the same value: 0776
-- (starts_at = now()) has started, 0772 (now() + 1 s) is still open; no pg_sleep needed.
-- 0777 and 0778 serve the delete rule.
insert into public.events (id, kind, title, area, starts_at, limit_people, limit_bikes, min_cc, full_members_only) values
  ('00000000-0000-0000-0000-000000000771', 'ride', 'pgtap-ej limits', 'Üsküdar → Ağva', now() + interval '2 days', 3, 2, null, false),
  ('00000000-0000-0000-0000-000000000773', 'ride', 'pgtap-ej rules', 'Üsküdar → Şile', now() + interval '2 days', null, null, 400, true);
insert into public.events (id, kind, title, starts_at) values
  ('00000000-0000-0000-0000-000000000772', 'meetup', 'pgtap-ej one second', now() + interval '1 second'),
  ('00000000-0000-0000-0000-000000000775', 'meetup', 'pgtap-ej an hour ago', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-000000000776', 'meetup', 'pgtap-ej right now', now()),
  ('00000000-0000-0000-0000-000000000777', 'meetup', 'pgtap-ej uncounted only', now() + interval '2 days'),
  ('00000000-0000-0000-0000-000000000778', 'meetup', 'pgtap-ej probation only', now() + interval '2 days');
insert into public.events (id, kind, title, starts_at, status, cancelled_at) values
  ('00000000-0000-0000-0000-000000000774', 'meetup', 'pgtap-ej cancelled', now() + interval '2 days', 'cancelled', now());
-- 0780 serves the rosters, counts and authors (created by 0767, last edited by 0761); 0781 the change log of an event
-- without counted sign-ups.
insert into public.events (id, kind, title, starts_at, created_by, updated_by) values
  ('00000000-0000-0000-0000-000000000780', 'meetup', 'pgtap-ej roster', now() + interval '2 days',
   '00000000-0000-0000-0000-000000000767', '00000000-0000-0000-0000-000000000761'),
  ('00000000-0000-0000-0000-000000000781', 'meetup', 'pgtap-ej uncounted log', now() + interval '2 days', null, null);
-- Places, so the change-log saves can send the same ones back
insert into public.event_places (event_id, position, name, lat, lng) values
  ('00000000-0000-0000-0000-000000000771', 0, 'Üsküdar', 41.026, 29.015),
  ('00000000-0000-0000-0000-000000000771', 1, 'Ağva', 41.137, 29.853),
  ('00000000-0000-0000-0000-000000000781', 0, 'Moda', 40.983, 29.025);
-- 0761 has an emergency contact (the organiser's roster shows "has one")
insert into public.member_emergency_contacts (profile_id, position, name, relationship, phone) values
  ('00000000-0000-0000-0000-000000000761', 1, 'Ayşe Pgtapkatilim', 'parent', '+905321234567');

-- Sign-ups planted as postgres: 0761 on the cancelled and the started events (to edit/leave them), 0763 and 0764 on
-- 0772 (own rows the gate must still hide), only uncounted people (inactive 0766, deleting 0765) on 0777, the ön alım
-- member as the only counted one on 0778 (beside 0766 again, so the inactive member's own row outlives the 0777 delete),
-- and the inactive member as a rider with 3 guests on 0771, which must take no place under its limits.
insert into public.event_signups (event_id, profile_id, role, guests) values
  ('00000000-0000-0000-0000-000000000774', '00000000-0000-0000-0000-000000000761', 'rider', 0),
  ('00000000-0000-0000-0000-000000000775', '00000000-0000-0000-0000-000000000761', 'rider', 0),
  ('00000000-0000-0000-0000-000000000776', '00000000-0000-0000-0000-000000000761', 'rider', 0),
  ('00000000-0000-0000-0000-000000000772', '00000000-0000-0000-0000-000000000763', 'passenger', 0),
  ('00000000-0000-0000-0000-000000000772', '00000000-0000-0000-0000-000000000764', 'passenger', 0),
  ('00000000-0000-0000-0000-000000000777', '00000000-0000-0000-0000-000000000766', 'rider', 1),
  ('00000000-0000-0000-0000-000000000777', '00000000-0000-0000-0000-000000000765', 'passenger', 0),
  ('00000000-0000-0000-0000-000000000778', '00000000-0000-0000-0000-000000000764', 'passenger', 0),
  ('00000000-0000-0000-0000-000000000778', '00000000-0000-0000-0000-000000000766', 'passenger', 0),
  ('00000000-0000-0000-0000-000000000771', '00000000-0000-0000-0000-000000000766', 'rider', 3);
-- 0780: active organiser (rider + 1), active member (passenger), ön alım member (passenger + 2), and the deleting and
-- inactive people with guests, who must appear in no roster row and no count. 0781: only the inactive member.
insert into public.event_signups (event_id, profile_id, role, guests) values
  ('00000000-0000-0000-0000-000000000780', '00000000-0000-0000-0000-000000000761', 'rider', 1),
  ('00000000-0000-0000-0000-000000000780', '00000000-0000-0000-0000-000000000763', 'passenger', 0),
  ('00000000-0000-0000-0000-000000000780', '00000000-0000-0000-0000-000000000764', 'passenger', 2),
  ('00000000-0000-0000-0000-000000000780', '00000000-0000-0000-0000-000000000765', 'rider', 2),
  ('00000000-0000-0000-0000-000000000780', '00000000-0000-0000-0000-000000000766', 'passenger', 3),
  ('00000000-0000-0000-0000-000000000781', '00000000-0000-0000-0000-000000000766', 'rider', 0);

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- Runs a statement and returns the error's sqlstate and hint (both null when it succeeds; then its effects stay).
-- throws_ok can't read hints. Usage: (select hint from pg_temp.last_error($$ … $$) where sqlstate = 'P0001') is null
-- unless the statement failed with exactly that code.
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

-- save_event input built from an event's current row and places (as the caller reads them), so a test changes only
-- what it means to change.
create function pg_temp.event_json(target uuid) returns jsonb language sql as $$
  select jsonb_build_object('kind', e.kind, 'title', e.title, 'side', e.side, 'area', e.area, 'starts_at', e.starts_at,
    'ends_at', e.ends_at, 'description', e.description, 'limit_people', e.limit_people, 'limit_bikes', e.limit_bikes,
    'min_cc', e.min_cc, 'full_members_only', e.full_members_only)
  from public.events e where e.id = target
$$;
create function pg_temp.places_json(target uuid) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('name', p.name, 'lat', p.lat, 'lng', p.lng, 'venue_url', p.venue_url,
    'venue_label', p.venue_label) order by p.position)
  from public.event_places p where p.event_id = target
$$;

-- ---------------------------------------------------------------------------
-- Grants: read own rows through RLS, write only through the RPCs
-- ---------------------------------------------------------------------------
select ok(has_table_privilege('authenticated', 'public.event_signups', 'select'), 'authenticated may select sign-ups (RLS decides)');
select ok(not has_table_privilege('authenticated', 'public.event_signups', 'insert'), 'no direct insert');
select ok(not has_table_privilege('authenticated', 'public.event_signups', 'update'), 'no direct update');
select ok(not has_table_privilege('authenticated', 'public.event_signups', 'delete'), 'no direct delete');
select ok(not has_table_privilege('anon', 'public.event_signups', 'select'), 'anon has no select on sign-ups');
select ok(not has_function_privilege('anon', 'public.join_event(uuid, public.event_role, integer)', 'execute'), 'anon cannot join');
select ok(not has_function_privilege('anon', 'public.leave_event(uuid)', 'execute'), 'anon cannot leave');
select ok(not has_function_privilege('anon', 'public.can_see_events()', 'execute'), 'anon cannot call can_see_events');
select ok(has_function_privilege('authenticated', 'public.join_event(uuid, public.event_role, integer)', 'execute'),
  'authenticated may call join_event (it checks the gate)');
select ok(has_function_privilege('authenticated', 'public.leave_event(uuid)', 'execute'),
  'authenticated may call leave_event (it checks the gate)');
select ok(has_function_privilege('authenticated', 'public.can_see_events()', 'execute'), 'authenticated may call can_see_events');
select ok(has_function_privilege('authenticated', 'private.can_see_events()', 'execute'),
  'authenticated may execute private.can_see_events (the policies call it)');
select ok(not has_table_privilege('authenticated', 'private.counted_event_signups', 'select'),
  'authenticated cannot read the counted-sign-ups view (RPCs only)');
select ok(not has_table_privilege('anon', 'private.counted_event_signups', 'select'), 'anon cannot read the counted-sign-ups view');
select ok(not has_function_privilege('anon', 'private.can_see_events()', 'execute'),
  'anon cannot execute private.can_see_events (the migration revokes it from PUBLIC; this pins it)');

-- Read RPCs: authenticated only (each checks the gate); the change table only through event_change_log
select ok(not has_function_privilege('anon', 'public.event_counts(uuid[])', 'execute'), 'anon cannot call event_counts');
select ok(not has_function_privilege('anon', 'public.event_roster(uuid)', 'execute'), 'anon cannot call event_roster');
select ok(not has_function_privilege('anon', 'public.event_authors(uuid)', 'execute'), 'anon cannot call event_authors');
select ok(not has_function_privilege('anon', 'public.event_change_log(uuid)', 'execute'), 'anon cannot call event_change_log');
select ok(has_function_privilege('authenticated', 'public.event_counts(uuid[])', 'execute'), 'authenticated may call event_counts');
select ok(has_function_privilege('authenticated', 'public.event_roster(uuid)', 'execute'), 'authenticated may call event_roster');
select ok(has_function_privilege('authenticated', 'public.event_authors(uuid)', 'execute'), 'authenticated may call event_authors');
select ok(has_function_privilege('authenticated', 'public.event_change_log(uuid)', 'execute'),
  'authenticated may call event_change_log');
select ok(not has_function_privilege('authenticated', 'private.event_is_upcoming(timestamptz, timestamptz)', 'execute'),
  'authenticated cannot execute private.event_is_upcoming (the RPCs call it)');
select ok(not has_function_privilege('authenticated', 'private.event_place_list(uuid)', 'execute'),
  'authenticated cannot execute private.event_place_list (save_event calls it)');
select ok(not has_table_privilege('authenticated', 'public.event_changes', 'select, insert, update, delete'),
  'authenticated has no rights on event_changes');
select ok(not has_table_privilege('anon', 'public.event_changes', 'select, insert, update, delete'),
  'anon has no rights on event_changes');
select ok((select relrowsecurity from pg_class where oid = 'public.event_changes'::regclass), 'event_changes has RLS on');

-- Upcoming = started at most 12 hours ago, or not yet ended (the rule listUpcomingEvents uses)
select is(private.event_is_upcoming(now() - interval '11 hours', null), true, 'started 11 hours ago, no end: upcoming');
select is(private.event_is_upcoming(now() - interval '13 hours', null), false, 'started 13 hours ago, no end: past');
select is(private.event_is_upcoming(now() - interval '13 hours', now() + interval '1 minute'), true,
  'started 13 hours ago, ends in a minute: upcoming');
select is(private.event_is_upcoming(now() - interval '13 hours', now() - interval '1 minute'), false,
  'started 13 hours ago, ended a minute ago: past');
select is((select count(*)::int from pg_proc where proname = 'join_event' and pronamespace = 'public'::regnamespace), 1,
  'exactly one join_event (no overload left behind)');
select is((select count(*)::int from pg_proc where proname = 'leave_event' and pronamespace = 'public'::regnamespace), 1,
  'exactly one leave_event');

-- Table checks the RPCs never reach
select throws_ok($$ insert into public.event_signups (event_id, profile_id, role, guests)
  values ('00000000-0000-0000-0000-000000000773', '00000000-0000-0000-0000-000000000761', 'passenger', 4) $$,
  '23514', null, 'the table refuses 4 guests');

-- ===========================================================================
-- GATE CLOSED (this branch): only events.manage holders see events, read their sign-ups and join/leave.
-- ===========================================================================
select pg_temp.login('00000000-0000-0000-0000-000000000761');
select ok(public.can_see_events(), 'organiser passes the gate');
reset role;

select pg_temp.login('00000000-0000-0000-0000-000000000763');
select ok(not public.can_see_events(), 'member without the permission does not pass the gate');
select throws_ok($$ select public.join_event('00000000-0000-0000-0000-000000000771', 'passenger') $$, '42501', null,
  'member refused before the release (join)');
select throws_ok($$ select public.leave_event('00000000-0000-0000-0000-000000000772') $$, '42501', null,
  'member refused before the release (leave)');
select is((select count(*)::int from public.event_signups where profile_id = '00000000-0000-0000-0000-000000000763'), 0,
  'member reads not even their own sign-up before the release');
reset role;

select pg_temp.login('00000000-0000-0000-0000-000000000764');
select ok(not public.can_see_events(), 'ön alım member does not pass the gate');
select throws_ok($$ select public.join_event('00000000-0000-0000-0000-000000000771', 'passenger') $$, '42501', null,
  'ön alım member refused before the release (join)');
select throws_ok($$ select public.leave_event('00000000-0000-0000-0000-000000000772') $$, '42501', null,
  'ön alım member refused before the release (leave)');
select is((select count(*)::int from public.event_signups where profile_id = '00000000-0000-0000-0000-000000000764'), 0,
  'ön alım member reads not even their own sign-ups before the release');
reset role;

select pg_temp.login('00000000-0000-0000-0000-000000000765');
select ok(not public.can_see_events(), 'deleting organiser does not pass the gate');
select throws_ok($$ select public.join_event('00000000-0000-0000-0000-000000000771', 'passenger') $$, '42501', null,
  'deleting organiser cannot join');
select is((select count(*)::int from public.event_signups where profile_id = '00000000-0000-0000-0000-000000000765'), 0,
  'deleting organiser reads no sign-ups');
reset role;

select pg_temp.login('00000000-0000-0000-0000-000000000766');
select ok(not public.can_see_events(), 'inactive organiser does not pass the gate');
select throws_ok($$ select public.join_event('00000000-0000-0000-0000-000000000771', 'passenger') $$, '42501', null,
  'inactive organiser cannot join');
select throws_ok($$ select public.leave_event('00000000-0000-0000-0000-000000000777') $$, '42501', null,
  'inactive organiser cannot leave');
select is((select count(*)::int from public.event_signups where profile_id = '00000000-0000-0000-0000-000000000766'), 0,
  'inactive organiser reads no sign-ups');
reset role;

set local role anon;
select throws_ok($$ select public.join_event('00000000-0000-0000-0000-000000000771', 'passenger') $$, '42501', null,
  'anon cannot call join_event');
select throws_ok($$ select 1 from public.event_signups $$, '42501', null, 'anon cannot read sign-ups');
reset role;

-- ---------------------------------------------------------------------------
-- Joining 0771 (limit_people 3, limit_bikes 2; the inactive member's rider + 3 guests don't count); own row readable,
-- others' not
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-000000000761');
select lives_ok($$ select public.join_event('00000000-0000-0000-0000-000000000771', 'rider', 1) $$,
  'organiser joins as rider with a guest');
select is((select row(role, guests)::text from public.event_signups
  where event_id = '00000000-0000-0000-0000-000000000771' and profile_id = '00000000-0000-0000-0000-000000000761'),
  row('rider', 1)::text, 'own sign-up readable: rider with 1 guest');
reset role;

select pg_temp.login('00000000-0000-0000-0000-000000000762');
select is((select hint from pg_temp.last_error($$ select public.join_event('00000000-0000-0000-0000-000000000771', 'passenger', 1) $$)
  where sqlstate = 'P0001'), 'people_limit', 'third and fourth person refused (P0001 people_limit)');
select lives_ok($$ select public.join_event('00000000-0000-0000-0000-000000000771', 'passenger') $$,
  'third person alone fits (default 0 guests)');
select is((select count(*)::int from public.event_signups where event_id = '00000000-0000-0000-0000-000000000771'), 1,
  'a second organiser reads only their own sign-up, not the first one''s');
reset role;

-- Bike limit 2: room for people, so only bikes decide
update public.events set limit_people = 10 where id = '00000000-0000-0000-0000-000000000771';
select pg_temp.login('00000000-0000-0000-0000-000000000762');
select lives_ok($$ select public.join_event('00000000-0000-0000-0000-000000000771', 'rider') $$,
  'switching passenger → rider while a bike place is free');
reset role;
select pg_temp.login('00000000-0000-0000-0000-000000000767');
select is((select hint from pg_temp.last_error($$ select public.join_event('00000000-0000-0000-0000-000000000771', 'rider') $$)
  where sqlstate = 'P0001'), 'bike_limit', 'a third rider refused (P0001 bike_limit)');
select lives_ok($$ select public.join_event('00000000-0000-0000-0000-000000000771', 'passenger') $$,
  'the same person joins as passenger');
reset role;

-- Don't make it worse: the organiser tightens both limits below the current numbers (people 4, bikes 2)
update public.events set limit_people = 1, limit_bikes = 1 where id = '00000000-0000-0000-0000-000000000771';
select pg_temp.login('00000000-0000-0000-0000-000000000761');
select lives_ok($$ select public.join_event('00000000-0000-0000-0000-000000000771', 'rider', 0) $$,
  'over both limits: lowering own guests 1 → 0 still allowed');
select is((select hint from pg_temp.last_error($$ select public.join_event('00000000-0000-0000-0000-000000000771', 'rider', 1) $$)
  where sqlstate = 'P0001'), 'people_limit', 'raising own guests 0 → 1 over the limit refused');
select lives_ok($$ select public.join_event('00000000-0000-0000-0000-000000000771', 'passenger', 0) $$,
  'switching rider → passenger over the limits allowed');
select is((select hint from pg_temp.last_error($$ select public.join_event('00000000-0000-0000-0000-000000000771', 'rider', 0) $$)
  where sqlstate = 'P0001'), 'bike_limit', 'switching passenger → rider with the bikes full refused');
select is((select row(role, guests)::text from public.event_signups
  where event_id = '00000000-0000-0000-0000-000000000771' and profile_id = '00000000-0000-0000-0000-000000000761'),
  row('passenger', 0)::text, 'refused changes leave the sign-up as it was');
reset role;
select is((select count(*)::int from public.event_signups where event_id = '00000000-0000-0000-0000-000000000771'), 4,
  'tightening the limits removed nobody (3 counted + the inactive member''s kept row)');

-- ---------------------------------------------------------------------------
-- min_cc 400 and full_members_only (0773)
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-000000000761');
select is((select hint from pg_temp.last_error($$ select public.join_event('00000000-0000-0000-0000-000000000773', 'rider') $$)
  where sqlstate = 'P0001'), 'min_cc', 'rider with a 250 cc bike refused (P0001 min_cc)');
select lives_ok($$ select public.join_event('00000000-0000-0000-0000-000000000773', 'passenger') $$,
  'the same full member joins as passenger (full_members_only only stops ön alım)');
select is((select hint from pg_temp.last_error($$ select public.join_event('00000000-0000-0000-0000-000000000773', 'rider') $$)
  where sqlstate = 'P0001'), 'min_cc', 'switching passenger → rider without a big enough bike refused');
reset role;
select pg_temp.login('00000000-0000-0000-0000-000000000762');
select is((select hint from pg_temp.last_error($$ select public.join_event('00000000-0000-0000-0000-000000000773', 'rider') $$)
  where sqlstate = 'P0001'), 'min_cc', 'a bike without cc doesn''t count for min_cc');
reset role;
select pg_temp.login('00000000-0000-0000-0000-000000000767');
select lives_ok($$ select public.join_event('00000000-0000-0000-0000-000000000773', 'rider') $$, 'rider with a 400 cc bike joins');
reset role;
update public.events set min_cc = 500 where id = '00000000-0000-0000-0000-000000000773';
select pg_temp.login('00000000-0000-0000-0000-000000000767');
select lives_ok($$ select public.join_event('00000000-0000-0000-0000-000000000773', 'rider', 1) $$,
  'after min_cc rises, an existing rider can still edit (stays rider)');
reset role;

-- ---------------------------------------------------------------------------
-- Malformed input, cancelled, started, unknown event
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-000000000761');
select throws_ok($$ select public.join_event('00000000-0000-0000-0000-000000000772', 'passenger', -1) $$, '22023', null,
  'guests -1 refused');
select throws_ok($$ select public.join_event('00000000-0000-0000-0000-000000000772', 'passenger', 4) $$, '22023', null,
  'guests 4 refused');
select throws_ok($$ select public.join_event('00000000-0000-0000-0000-000000000772', 'passenger', null) $$, '22023', null,
  'guests null refused');
select throws_ok($$ select public.join_event('00000000-0000-0000-0000-000000000772', null, 0) $$, '22023', null,
  'role null refused');
select throws_ok($$ select public.join_event('00000000-0000-0000-0000-000000000772', 'pilot', 0) $$, '22P02', null,
  'unknown role refused by the enum cast');
select throws_ok($$ select public.join_event('00000000-0000-0000-0000-000000000779', 'passenger') $$, 'P0002', null,
  'joining an unknown event → P0002');
select throws_ok($$ select public.leave_event('00000000-0000-0000-0000-000000000779') $$, 'P0002', null,
  'leaving an unknown event → P0002');

select is((select hint from pg_temp.last_error($$ select public.join_event('00000000-0000-0000-0000-000000000774', 'passenger') $$)
  where sqlstate = 'P0001'), 'cancelled', 'editing a sign-up on a cancelled event refused (P0001 cancelled)');
select lives_ok($$ select public.leave_event('00000000-0000-0000-0000-000000000774') $$, 'leaving a cancelled event allowed');
select is((select count(*)::int from public.event_signups where event_id = '00000000-0000-0000-0000-000000000774'), 0,
  'the sign-up on the cancelled event is gone');

select is((select hint from pg_temp.last_error($$ select public.join_event('00000000-0000-0000-0000-000000000775', 'rider', 1) $$)
  where sqlstate = 'P0001'), 'started', 'editing after the start refused (P0001 started)');
select is((select hint from pg_temp.last_error($$ select public.leave_event('00000000-0000-0000-0000-000000000775') $$)
  where sqlstate = 'P0001'), 'started', 'leaving after the start refused');
select is((select hint from pg_temp.last_error($$ select public.join_event('00000000-0000-0000-0000-000000000776', 'rider', 1) $$)
  where sqlstate = 'P0001'), 'started', 'editing at starts_at exactly refused');
select is((select hint from pg_temp.last_error($$ select public.leave_event('00000000-0000-0000-0000-000000000776') $$)
  where sqlstate = 'P0001'), 'started', 'leaving at starts_at exactly refused');
select is((select array_agg(row(event_id, role, guests)::text order by event_id) from public.event_signups
  where event_id in ('00000000-0000-0000-0000-000000000775', '00000000-0000-0000-0000-000000000776')),
  array[row('00000000-0000-0000-0000-000000000775'::uuid, 'rider', 0)::text,
        row('00000000-0000-0000-0000-000000000776'::uuid, 'rider', 0)::text],
  'the sign-ups on started events stay unchanged');
select lives_ok($$ select public.join_event('00000000-0000-0000-0000-000000000772', 'passenger') $$,
  'joining one second before the start allowed');
select lives_ok($$ select public.leave_event('00000000-0000-0000-0000-000000000772') $$,
  'leaving one second before the start allowed');
select is((select count(*)::int from public.event_signups where event_id = '00000000-0000-0000-0000-000000000772'), 0,
  'own sign-up on 0772 gone');
select lives_ok($$ select public.leave_event('00000000-0000-0000-0000-000000000772') $$,
  'leaving without a sign-up is a no-op');
reset role;

select pg_temp.login('00000000-0000-0000-0000-000000000762');
select is((select hint from pg_temp.last_error($$ select public.join_event('00000000-0000-0000-0000-000000000774', 'passenger') $$)
  where sqlstate = 'P0001'), 'cancelled', 'joining a cancelled event refused (P0001 cancelled)');
select is((select hint from pg_temp.last_error($$ select public.join_event('00000000-0000-0000-0000-000000000775', 'passenger') $$)
  where sqlstate = 'P0001'), 'started', 'joining an hour after the start refused');
select is((select hint from pg_temp.last_error($$ select public.join_event('00000000-0000-0000-0000-000000000776', 'passenger') $$)
  where sqlstate = 'P0001'), 'started', 'joining at starts_at exactly refused');
reset role;

-- ---------------------------------------------------------------------------
-- Delete only without counted sign-ups (active / ön alım); inactive and deleting ones don't count
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-000000000761');
select is((select hint from pg_temp.last_error($$ select public.delete_event('00000000-0000-0000-0000-000000000771') $$)
  where sqlstate = 'P0001'), 'has_signups', 'deleting an event with sign-ups refused (P0001 has_signups)');
select is((select hint from pg_temp.last_error($$ select public.delete_event('00000000-0000-0000-0000-000000000778') $$)
  where sqlstate = 'P0001'), 'has_signups', 'an ön alım member''s sign-up counts');
select lives_ok($$ select public.delete_event('00000000-0000-0000-0000-000000000777') $$,
  'an event whose only sign-ups are inactive / deleting people''s is deleted');
reset role;
select is((select count(*)::int from public.events where id in ('00000000-0000-0000-0000-000000000771', '00000000-0000-0000-0000-000000000778')),
  2, 'the refused events stay');
select is((select count(*)::int from public.event_signups where event_id = '00000000-0000-0000-0000-000000000777'), 0,
  'the uncounted sign-ups went with the event (cascade)');

-- ---------------------------------------------------------------------------
-- The account goes: its sign-ups go too
-- ---------------------------------------------------------------------------
select is((select count(*)::int from public.event_signups where profile_id = '00000000-0000-0000-0000-000000000762'), 1,
  'the second organiser has a sign-up before the account goes');
delete from auth.users where id = '00000000-0000-0000-0000-000000000762';
select is((select count(*)::int from public.event_signups where profile_id = '00000000-0000-0000-0000-000000000762'), 0,
  'deleting the account removes its sign-ups (cascade)');

-- ---------------------------------------------------------------------------
-- Read RPCs before the release: organisers see the full roster; everyone else is refused
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-000000000761');
select is((select array_agg(row(r.profile_id, r.full_name, r.role, r.guests, r.probation, r.has_emergency_contact)::text
    order by r.ord)
  from public.event_roster('00000000-0000-0000-0000-000000000780')
    with ordinality as r(profile_id, full_name, avatar_url, role, guests, probation, has_emergency_contact, ord)),
  array[row('00000000-0000-0000-0000-000000000764'::uuid, 'Okan Pgtapkatilim', 'passenger'::public.event_role, 2, true, false)::text,
        row('00000000-0000-0000-0000-000000000761'::uuid, 'Orhan Pgtapkatilim', 'rider'::public.event_role, 1, false, true)::text,
        row('00000000-0000-0000-0000-000000000763'::uuid, 'Pelin Pgtapkatilim', 'passenger'::public.event_role, 0, false, false)::text],
  'organiser: every counted participant by name, with the ön alım flag and the emergency contact; not the deleting or inactive ones');
select throws_ok($$ select * from public.event_roster('00000000-0000-0000-0000-000000000779') $$, 'P0002', null,
  'roster of an unknown event → P0002');
select is((select array_agg(row(c.*)::text order by c.event_id)
  from public.event_counts(array['00000000-0000-0000-0000-000000000780', '00000000-0000-0000-0000-000000000774',
                                 '00000000-0000-0000-0000-000000000779']::uuid[]) c),
  array[row('00000000-0000-0000-0000-000000000774'::uuid, 0, 0, 0, 0, 0)::text,
        row('00000000-0000-0000-0000-000000000780'::uuid, 6, 1, 3, 3, 1)::text],
  'counts (people, bikes, members, guests, ön alım): zeros included, unknown ids left out, deleting / inactive not counted');
reset role;

select pg_temp.login('00000000-0000-0000-0000-000000000763');
select throws_ok($$ select * from public.event_counts(array['00000000-0000-0000-0000-000000000780']::uuid[]) $$, '42501', null,
  'member refused before the release (counts)');
select throws_ok($$ select * from public.event_roster('00000000-0000-0000-0000-000000000780') $$, '42501', null,
  'member refused before the release (roster)');
select throws_ok($$ select * from public.event_authors('00000000-0000-0000-0000-000000000780') $$, '42501', null,
  'member refused before the release (authors)');
select throws_ok($$ select * from public.event_change_log('00000000-0000-0000-0000-000000000780') $$, '42501', null,
  'member refused before the release (change log)');
reset role;

select pg_temp.login('00000000-0000-0000-0000-000000000764');
select throws_ok($$ select * from public.event_counts(array['00000000-0000-0000-0000-000000000780']::uuid[]) $$, '42501', null,
  'ön alım member refused before the release (counts)');
select throws_ok($$ select * from public.event_roster('00000000-0000-0000-0000-000000000780') $$, '42501', null,
  'ön alım member refused before the release (roster)');
select throws_ok($$ select * from public.event_authors('00000000-0000-0000-0000-000000000780') $$, '42501', null,
  'ön alım member refused before the release (authors)');
select throws_ok($$ select * from public.event_change_log('00000000-0000-0000-0000-000000000780') $$, '42501', null,
  'ön alım member refused before the release (change log)');
reset role;

-- ===========================================================================
-- GATE SWAP: open the gate as the release will (members and ön alım members). Safe on every database the suite runs
-- on, production included: this runs inside the test transaction and is rolled back at the end; until then no other
-- session sees the uncommitted definition (MVCC on pg_proc), so the live gate never opens.
-- ===========================================================================
create or replace function private.can_see_events()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_club_member()
$$;

-- ===========================================================================
-- GATE OPEN (release body)
-- ===========================================================================
-- Room on 0771 again (it holds 0761 passenger, 0767 passenger after the account above went)
update public.events set limit_people = 10, limit_bikes = 10 where id = '00000000-0000-0000-0000-000000000771';

select pg_temp.login('00000000-0000-0000-0000-000000000763');
select ok(public.can_see_events(), 'member passes the open gate');
select is((select count(*)::int from public.event_signups where profile_id = '00000000-0000-0000-0000-000000000763'), 2,
  'member reads their own sign-ups (0772, 0780)');
select is((select count(*)::int from public.event_signups where event_id = '00000000-0000-0000-0000-000000000772'), 1,
  'member reads only their own row, not the ön alım member''s on the same event');
select lives_ok($$ select public.join_event('00000000-0000-0000-0000-000000000771', 'passenger') $$,
  'member joins as passenger after the release');
reset role;

select pg_temp.login('00000000-0000-0000-0000-000000000764');
select ok(public.can_see_events(), 'ön alım member passes the open gate');
select is((select hint from pg_temp.last_error($$ select public.join_event('00000000-0000-0000-0000-000000000773', 'passenger') $$)
  where sqlstate = 'P0001'), 'full_members_only', 'ön alım member refused on a full-members-only event');
select lives_ok($$ select public.join_event('00000000-0000-0000-0000-000000000771', 'passenger', 2) $$,
  'ön alım member joins an open event with 2 guests');
reset role;
update public.events set full_members_only = true where id = '00000000-0000-0000-0000-000000000771';
select pg_temp.login('00000000-0000-0000-0000-000000000764');
select lives_ok($$ select public.join_event('00000000-0000-0000-0000-000000000771', 'passenger', 1) $$,
  'after full_members_only is set, the ön alım member can still lower guests');
select is((select guests from public.event_signups
  where event_id = '00000000-0000-0000-0000-000000000771' and profile_id = '00000000-0000-0000-0000-000000000764'),
  1::smallint, 'guests lowered to 1');
select lives_ok($$ select public.leave_event('00000000-0000-0000-0000-000000000771') $$, '… and leave');
select is((select hint from pg_temp.last_error($$ select public.join_event('00000000-0000-0000-0000-000000000771', 'passenger') $$)
  where sqlstate = 'P0001'), 'full_members_only', '… but not join again');
reset role;

select pg_temp.login('00000000-0000-0000-0000-000000000765');
select ok(not public.can_see_events(), 'deleting member does not pass the open gate');
select throws_ok($$ select public.join_event('00000000-0000-0000-0000-000000000771', 'passenger') $$, '42501', null,
  'deleting member cannot join after the release');
reset role;

select pg_temp.login('00000000-0000-0000-0000-000000000766');
select ok(not public.can_see_events(), 'inactive member does not pass the open gate');
select throws_ok($$ select public.join_event('00000000-0000-0000-0000-000000000771', 'passenger') $$, '42501', null,
  'inactive member cannot join after the release');
select is((select count(*)::int from public.event_signups where profile_id = '00000000-0000-0000-0000-000000000766'), 0,
  'inactive member reads no sign-ups');
reset role;

set local role anon;
select throws_ok($$ select public.join_event('00000000-0000-0000-0000-000000000771', 'passenger') $$, '42501', null,
  'anon still cannot join after the release');
reset role;

-- ---------------------------------------------------------------------------
-- Rosters and counts per viewer after the release (0780: organiser 0761 rider + 1, member 0763, ön alım 0764 + 2,
-- deleting 0765 and inactive 0766 with guests)
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-000000000763');
select is((select array_agg(row(r.profile_id, r.full_name, r.role, r.guests, r.probation, r.has_emergency_contact)::text
    order by r.ord)
  from public.event_roster('00000000-0000-0000-0000-000000000780')
    with ordinality as r(profile_id, full_name, avatar_url, role, guests, probation, has_emergency_contact, ord)),
  array[row('00000000-0000-0000-0000-000000000761'::uuid, 'Orhan Pgtapkatilim', 'rider'::public.event_role, 1, null::boolean, null::boolean)::text,
        row('00000000-0000-0000-0000-000000000763'::uuid, 'Pelin Pgtapkatilim', 'passenger'::public.event_role, 0, null::boolean, null::boolean)::text],
  'member, upcoming event: only active participants, without the ön alım flag or the emergency-contact field');
select is((select count(*)::int from public.event_roster('00000000-0000-0000-0000-000000000775')), 1,
  'member: an event that started an hour ago (no end) is still upcoming, its roster still shows');
reset role;

-- 0775 moves to 13 hours ago: past by the 12-hour rule
update public.events set starts_at = now() - interval '13 hours' where id = '00000000-0000-0000-0000-000000000775';
select pg_temp.login('00000000-0000-0000-0000-000000000763');
select is((select count(*)::int from public.event_roster('00000000-0000-0000-0000-000000000775')), 0,
  'member: no names once the event is past');
reset role;
select pg_temp.login('00000000-0000-0000-0000-000000000761');
select is((select count(*)::int from public.event_roster('00000000-0000-0000-0000-000000000775')), 1,
  'organiser: the roster of a past event still shows');
reset role;

select pg_temp.login('00000000-0000-0000-0000-000000000764');
select is((select count(*)::int from public.event_roster('00000000-0000-0000-0000-000000000780')), 0,
  'ön alım member: no roster rows (not an error)');
reset role;

-- The same counts for every viewer who passes the gate
select pg_temp.login('00000000-0000-0000-0000-000000000761');
select is((select array_agg(row(c.*)::text order by c.event_id)
  from public.event_counts(array['00000000-0000-0000-0000-000000000780', '00000000-0000-0000-0000-000000000774']::uuid[]) c),
  array[row('00000000-0000-0000-0000-000000000774'::uuid, 0, 0, 0, 0, 0)::text,
        row('00000000-0000-0000-0000-000000000780'::uuid, 6, 1, 3, 3, 1)::text],
  'counts for the organiser');
reset role;
select pg_temp.login('00000000-0000-0000-0000-000000000763');
select is((select array_agg(row(c.*)::text order by c.event_id)
  from public.event_counts(array['00000000-0000-0000-0000-000000000780', '00000000-0000-0000-0000-000000000774']::uuid[]) c),
  array[row('00000000-0000-0000-0000-000000000774'::uuid, 0, 0, 0, 0, 0)::text,
        row('00000000-0000-0000-0000-000000000780'::uuid, 6, 1, 3, 3, 1)::text],
  'the same counts for a member');
reset role;
select pg_temp.login('00000000-0000-0000-0000-000000000764');
select is((select array_agg(row(c.*)::text order by c.event_id)
  from public.event_counts(array['00000000-0000-0000-0000-000000000780', '00000000-0000-0000-0000-000000000774']::uuid[]) c),
  array[row('00000000-0000-0000-0000-000000000774'::uuid, 0, 0, 0, 0, 0)::text,
        row('00000000-0000-0000-0000-000000000780'::uuid, 6, 1, 3, 3, 1)::text],
  'the same counts for an ön alım member');
reset role;

-- ---------------------------------------------------------------------------
-- Change log: save_event appends one row per save that changes a logged field of an event with counted sign-ups
-- (0771 holds 0761, 0763 and 0767 as passengers; full_members_only and limits 10/10 from above)
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-000000000761');
select lives_ok($$ select public.save_event(
    pg_temp.event_json('00000000-0000-0000-0000-000000000771') || jsonb_build_object('starts_at', now() + interval '2 days 1 hour'),
    pg_temp.places_json('00000000-0000-0000-0000-000000000771'), '00000000-0000-0000-0000-000000000771') $$,
  'organiser moves 0771 an hour later, same places');
reset role;
select is((select count(*)::int from public.event_changes where event_id = '00000000-0000-0000-0000-000000000771'), 1,
  'one change row');
select is((select changes from public.event_changes where event_id = '00000000-0000-0000-0000-000000000771'),
  jsonb_build_array(jsonb_build_object('field', 'starts_at', 'old', now() + interval '2 days', 'new', now() + interval '2 days 1 hour')),
  'the row lists only starts_at, old → new');

select pg_temp.login('00000000-0000-0000-0000-000000000761');
select lives_ok($$ select public.save_event(
    pg_temp.event_json('00000000-0000-0000-0000-000000000771') || '{"title": "pgtap-ej limits renamed"}',
    pg_temp.places_json('00000000-0000-0000-0000-000000000771'), '00000000-0000-0000-0000-000000000771') $$,
  'organiser renames 0771');
select lives_ok($$ select public.save_event(
    pg_temp.event_json('00000000-0000-0000-0000-000000000781') || jsonb_build_object('starts_at', now() + interval '3 days'),
    pg_temp.places_json('00000000-0000-0000-0000-000000000781'), '00000000-0000-0000-0000-000000000781') $$,
  'organiser moves 0781, whose only sign-up is an inactive member''s');
reset role;
select is((select count(*)::int from public.event_changes where event_id = '00000000-0000-0000-0000-000000000771'), 1,
  'a title-only edit adds no change row');
select is((select count(*)::int from public.event_changes where event_id = '00000000-0000-0000-0000-000000000781'), 0,
  'an edit of an event without counted sign-ups adds no change row');

select pg_temp.login('00000000-0000-0000-0000-000000000761');
select lives_ok($$ select public.save_event(
    pg_temp.event_json('00000000-0000-0000-0000-000000000771'),
    jsonb_set(pg_temp.places_json('00000000-0000-0000-0000-000000000771'), '{0,lat}', '41.03'),
    '00000000-0000-0000-0000-000000000771') $$,
  'organiser moves the start point, same name');
reset role;
select is((select changes from public.event_changes
    where event_id = '00000000-0000-0000-0000-000000000771' and changes @> '[{"field": "places"}]'),
  '[{"field": "places", "old": ["Üsküdar", "Ağva"], "new": ["Üsküdar", "Ağva"]}]'::jsonb,
  'a moved point logs places, with the (equal) name lists');

select pg_temp.login('00000000-0000-0000-0000-000000000761');
select lives_ok($$ select public.save_event(
    pg_temp.event_json('00000000-0000-0000-0000-000000000771') || jsonb_build_object('ends_at', now() + interval '2 days 6 hours',
      'limit_people', 12, 'limit_bikes', 8, 'min_cc', 600, 'full_members_only', false),
    pg_temp.places_json('00000000-0000-0000-0000-000000000771'), '00000000-0000-0000-0000-000000000771') $$,
  'organiser changes the end, both limits, min_cc and full_members_only at once');
reset role;
select is((select changes from public.event_changes
    where event_id = '00000000-0000-0000-0000-000000000771' and changes @> '[{"field": "ends_at"}]'),
  jsonb_build_array(
    jsonb_build_object('field', 'ends_at', 'old', null, 'new', now() + interval '2 days 6 hours'),
    '{"field": "limit_people", "old": 10, "new": 12}'::jsonb,
    '{"field": "limit_bikes", "old": 10, "new": 8}'::jsonb,
    '{"field": "min_cc", "old": null, "new": 600}'::jsonb,
    '{"field": "full_members_only", "old": true, "new": false}'::jsonb),
  'one row with every changed field, in the fixed order');

-- now() is fixed in the transaction: spread the rows' times to see the order (newest first)
update public.event_changes set changed_at = now() - interval '3 minutes'
  where event_id = '00000000-0000-0000-0000-000000000771' and changes @> '[{"field": "starts_at"}]';
update public.event_changes set changed_at = now() - interval '2 minutes'
  where event_id = '00000000-0000-0000-0000-000000000771' and changes @> '[{"field": "places"}]';

select pg_temp.login('00000000-0000-0000-0000-000000000763');
select is((select array_agg(row(r.changes -> 0 ->> 'field', r.changed_by_name)::text order by r.ord)
  from public.event_change_log('00000000-0000-0000-0000-000000000771')
    with ordinality as r(id, changed_at, changes, changed_by_name, ord)),
  array[row('ends_at', null::text)::text, row('places', null::text)::text, row('starts_at', null::text)::text],
  'member: the change log, newest first, without the author');
reset role;
select pg_temp.login('00000000-0000-0000-0000-000000000764');
select is((select array_agg(row(r.changes -> 0 ->> 'field', r.changed_by_name)::text order by r.ord)
  from public.event_change_log('00000000-0000-0000-0000-000000000771')
    with ordinality as r(id, changed_at, changes, changed_by_name, ord)),
  array[row('ends_at', null::text)::text, row('places', null::text)::text, row('starts_at', null::text)::text],
  'ön alım member: the same log, without the author');
reset role;
select pg_temp.login('00000000-0000-0000-0000-000000000761');
select is((select array_agg(row(r.changes -> 0 ->> 'field', r.changed_by_name)::text order by r.ord)
  from public.event_change_log('00000000-0000-0000-0000-000000000771')
    with ordinality as r(id, changed_at, changes, changed_by_name, ord)),
  array[row('ends_at', 'Orhan Pgtapkatilim')::text, row('places', 'Orhan Pgtapkatilim')::text,
        row('starts_at', 'Orhan Pgtapkatilim')::text],
  'organiser: the change log with the author');
reset role;

-- ---------------------------------------------------------------------------
-- Authors ("Düzenleyen") for viewers who can't read profiles; null once the author is deleting
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-000000000764');
select is((select row(a.*)::text from public.event_authors('00000000-0000-0000-0000-000000000780') a),
  row('Burak Pgtapkatilim', 'Orhan Pgtapkatilim', true)::text,
  'ön alım member reads the authors'' names and that someone else edited it');
reset role;
update public.profiles
  set status = 'deleting', deletion_requested_at = now(), status_before_deletion = 'active'
  where id = '00000000-0000-0000-0000-000000000767';
select pg_temp.login('00000000-0000-0000-0000-000000000764');
select is((select row(a.*)::text from public.event_authors('00000000-0000-0000-0000-000000000780') a),
  row(null::text, 'Orhan Pgtapkatilim', true)::text,
  'a deleting author''s name is null');
reset role;

-- The author's account goes: the change rows stay, without an author
delete from auth.users where id = '00000000-0000-0000-0000-000000000761';
select is((select row(count(*), count(*) filter (where changed_by is null))::text from public.event_changes
  where event_id = '00000000-0000-0000-0000-000000000771'),
  row(3, 3)::text, 'after the author''s account is deleted, the change rows stay with changed_by null');

select * from finish();
rollback;
