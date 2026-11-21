-- Run with: pnpm db:test
-- Events and their places (events.manage): grants, the release gate (only organisers read events until the release,
-- `private.can_see_events`), save/cancel/delete RPCs with their input rules, and what happens when an organiser's account goes.
begin;
create extension if not exists pgtap with schema extensions;

select plan(126);

-- Fixtures: 0741 admin, 0742 organiser (active, role 0749), 0743 active member without a role, 0744 probation member
-- holding role 0749, 0745 organiser in deleting. Role 0749 holds only events.manage. Events planted as postgres:
-- 0751 ride with 3 places (by the admin, a day old), 0752 meet-up with 1 place.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000741', 'pgtap-ev-admin@pgtap.invalid',     '{"full_name": "Aylin Pgtapyonetici"}'),
  ('00000000-0000-0000-0000-000000000742', 'pgtap-ev-organiser@pgtap.invalid', '{"full_name": "Orhan Pgtaporganizator"}'),
  ('00000000-0000-0000-0000-000000000743', 'pgtap-ev-member@pgtap.invalid',    '{"full_name": "Pelin Pgtapuye"}'),
  ('00000000-0000-0000-0000-000000000744', 'pgtap-ev-probation@pgtap.invalid', '{"full_name": "Okan Pgtapaday"}'),
  ('00000000-0000-0000-0000-000000000745', 'pgtap-ev-deleting@pgtap.invalid',  '{"full_name": "Deniz Pgtapsiliniyor"}');
insert into public.roles (id, name) values ('00000000-0000-0000-0000-000000000749', 'pgtap-ev-organiser');
insert into public.role_permissions (role_id, permission) values
  ('00000000-0000-0000-0000-000000000749', 'events.manage');

update public.profiles set status = 'active', role_id = (select id from public.roles where is_admin)
  where id = '00000000-0000-0000-0000-000000000741';
update public.profiles set status = 'active', role_id = '00000000-0000-0000-0000-000000000749'
  where id = '00000000-0000-0000-0000-000000000742';
update public.profiles set status = 'active' where id = '00000000-0000-0000-0000-000000000743';
update public.profiles set status = 'probation', role_id = '00000000-0000-0000-0000-000000000749'
  where id = '00000000-0000-0000-0000-000000000744';
update public.profiles
  set status = 'deleting', role_id = '00000000-0000-0000-0000-000000000749',
      deletion_requested_at = now(), status_before_deletion = 'active'
  where id = '00000000-0000-0000-0000-000000000745';

insert into public.events (id, kind, title, side, area, starts_at, created_by, updated_by, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000751', 'ride', 'pgtap-ev Ağva', 'asian', 'Üsküdar → Ağva', '2026-12-06T05:30:00Z',
   '00000000-0000-0000-0000-000000000741', '00000000-0000-0000-0000-000000000741',
   now() - interval '1 day', now() - interval '1 day');
insert into public.events (id, kind, title, starts_at) values
  ('00000000-0000-0000-0000-000000000752', 'meetup', 'pgtap-ev Moda', '2026-12-01T17:00:00Z');
insert into public.event_places (event_id, position, name, lat, lng) values
  ('00000000-0000-0000-0000-000000000751', 0, 'Üsküdar', 41.021111, 29.004167),
  ('00000000-0000-0000-0000-000000000751', 1, 'Şile', 41.176, 29.612),
  ('00000000-0000-0000-0000-000000000751', 2, 'Ağva', 41.137, 29.857),
  ('00000000-0000-0000-0000-000000000752', 0, 'Moda Sahili', 40.98, 29.02);

-- Table checks the RPCs never reach (they refuse earlier with 22023 or never write such rows)
select throws_ok($$ insert into public.events (id, kind, title, starts_at)
  values ('00000000-0000-0000-0000-000000000753', 'ride', 'x', '2026-12-06T05:30:00Z') $$,
  '23514', 'new row for relation "events" violates check constraint "events_ride_area"', 'a ride without area refused by the table');
select throws_ok($$ insert into public.events (id, kind, title, starts_at, status)
  values ('00000000-0000-0000-0000-000000000753', 'meetup', 'x', '2026-12-06T05:30:00Z', 'cancelled') $$,
  '23514', 'new row for relation "events" violates check constraint "events_cancelled_at"', 'cancelled needs cancelled_at');
select throws_ok($$ insert into public.events (id, kind, title, starts_at, cancel_reason)
  values ('00000000-0000-0000-0000-000000000753', 'meetup', 'x', '2026-12-06T05:30:00Z', 'Yağmur') $$,
  '23514', 'new row for relation "events" violates check constraint "events_reason_only_when_cancelled"',
  'a cancel reason only on a cancelled event');
select throws_ok($$ insert into public.event_places (event_id, position, name, lat, lng)
  values ('00000000-0000-0000-0000-000000000751', 12, 'x', 41, 29) $$,
  '23514', 'new row for relation "event_places" violates check constraint "event_places_position_check"', 'position 12 refused');
select throws_ok($$ insert into public.event_places (event_id, position, name, lat, lng)
  values ('00000000-0000-0000-0000-000000000751', 0, 'x', 41, 29) $$,
  '23505', null, 'two places at one position refused');

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- ---------------------------------------------------------------------------
-- Grants: read only through RLS, write only through the RPCs
-- ---------------------------------------------------------------------------
select ok(not has_table_privilege('anon', 'public.events', 'select'), 'anon has no select on events');
select ok(not has_table_privilege('anon', 'public.event_places', 'select'), 'anon has no select on event_places');
select ok(has_table_privilege('authenticated', 'public.events', 'select'), 'authenticated may select events (RLS decides)');
select ok(has_table_privilege('authenticated', 'public.event_places', 'select'),
  'authenticated may select event_places (RLS decides)');
select ok(not has_table_privilege('authenticated', 'public.events', 'insert'), 'no direct insert');
select ok(not has_table_privilege('authenticated', 'public.events', 'update'), 'no direct update');
select ok(not has_table_privilege('authenticated', 'public.events', 'delete'), 'no direct delete');
select ok(not has_table_privilege('authenticated', 'public.event_places', 'insert'), 'no direct place insert');
select ok(not has_table_privilege('authenticated', 'public.event_places', 'update'), 'no direct place update');
select ok(not has_table_privilege('authenticated', 'public.event_places', 'delete'), 'no direct place delete');
select ok(not has_function_privilege('anon', 'public.save_event(jsonb, jsonb, uuid)', 'execute'), 'anon cannot save');
select ok(not has_function_privilege('anon', 'public.cancel_event(uuid, text)', 'execute'), 'anon cannot cancel');
select ok(not has_function_privilege('anon', 'public.delete_event(uuid)', 'execute'), 'anon cannot delete');
select ok(has_function_privilege('authenticated', 'public.save_event(jsonb, jsonb, uuid)', 'execute'),
  'authenticated may call save_event (it checks events.manage)');
select ok(has_function_privilege('authenticated', 'public.cancel_event(uuid, text)', 'execute'),
  'authenticated may call cancel_event (it checks events.manage)');
select ok(has_function_privilege('authenticated', 'public.delete_event(uuid)', 'execute'),
  'authenticated may call delete_event (it checks events.manage)');
select is((select count(*)::int from pg_proc where proname = 'save_event' and pronamespace = 'public'::regnamespace), 1,
  'exactly one save_event (no overload left behind)');
select is((select count(*)::int from pg_proc where proname = 'cancel_event' and pronamespace = 'public'::regnamespace), 1,
  'exactly one cancel_event');

-- ---------------------------------------------------------------------------
-- Release gate (RLS through private.can_see_events): only events.manage holders read events and places
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-000000000742');
select is((select count(*)::int from public.events where id in ('00000000-0000-0000-0000-000000000751', '00000000-0000-0000-0000-000000000752')),
  2, 'organiser sees both fixture events');
select ok(public.can_see_events(), 'organiser passes the gate (can_see_events)');
select is((select count(*)::int from public.event_places where event_id in ('00000000-0000-0000-0000-000000000751', '00000000-0000-0000-0000-000000000752')),
  4, 'organiser sees their places');
select throws_ok($$ insert into public.events (kind, title, starts_at) values ('meetup', 'x', now()) $$, '42501', null,
  'organiser cannot insert directly');
select throws_ok($$ update public.events set title = 'x' where id = '00000000-0000-0000-0000-000000000752' $$, '42501', null,
  'organiser cannot update directly');
select throws_ok($$ delete from public.event_places where event_id = '00000000-0000-0000-0000-000000000752' $$, '42501', null,
  'organiser cannot delete places directly');
reset role;

select pg_temp.login('00000000-0000-0000-0000-000000000741');
select is((select count(*)::int from public.events where id in ('00000000-0000-0000-0000-000000000751', '00000000-0000-0000-0000-000000000752')),
  2, 'admin sees both fixture events');
select ok(public.can_see_events(), 'admin passes the gate');
select is((select count(*)::int from public.event_places where event_id in ('00000000-0000-0000-0000-000000000751', '00000000-0000-0000-0000-000000000752')),
  4, 'admin sees their places');
reset role;

select pg_temp.login('00000000-0000-0000-0000-000000000743');
select is((select count(*)::int from public.events where id in ('00000000-0000-0000-0000-000000000751', '00000000-0000-0000-0000-000000000752')),
  0, 'member sees no events before release');
select ok(not public.can_see_events(), 'member does not pass the gate before release');
select is((select count(*)::int from public.event_places where event_id in ('00000000-0000-0000-0000-000000000751', '00000000-0000-0000-0000-000000000752')),
  0, 'member sees no places before release');
reset role;

select pg_temp.login('00000000-0000-0000-0000-000000000744');
select is((select count(*)::int from public.events where id in ('00000000-0000-0000-0000-000000000751', '00000000-0000-0000-0000-000000000752')),
  0, 'probation member holding the role sees no events (rights are active-only)');
select ok(not public.can_see_events(), 'probation member holding the role does not pass the gate');
select is((select count(*)::int from public.event_places where event_id in ('00000000-0000-0000-0000-000000000751', '00000000-0000-0000-0000-000000000752')),
  0, 'probation member holding the role sees no places');
reset role;

select pg_temp.login('00000000-0000-0000-0000-000000000745');
select is((select count(*)::int from public.events where id in ('00000000-0000-0000-0000-000000000751', '00000000-0000-0000-0000-000000000752')),
  0, 'deleting organiser sees no events');
select ok(not public.can_see_events(), 'deleting organiser does not pass the gate');
select is((select count(*)::int from public.event_places where event_id in ('00000000-0000-0000-0000-000000000751', '00000000-0000-0000-0000-000000000752')),
  0, 'deleting organiser sees no places');
reset role;

set local role anon;
select throws_ok($$ select 1 from public.events $$, '42501', null, 'anon cannot read events');
select throws_ok($$ select 1 from public.event_places $$, '42501', null, 'anon cannot read places');
select throws_ok($$ select public.save_event('{"kind":"meetup","title":"x","starts_at":"2026-12-01T17:00:00Z"}', '[{"name":"x","lat":40.98,"lng":29.02}]') $$,
  '42501', null, 'anon cannot call save_event');
reset role;

-- ---------------------------------------------------------------------------
-- No rights: active without the permission, probation with the role, deleting with the role
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-000000000743');
select throws_ok($$ select public.save_event('{"kind":"meetup","title":"x","starts_at":"2026-12-01T17:00:00Z"}', '[{"name":"x","lat":40.98,"lng":29.02}]') $$,
  '42501', null, 'member without the permission cannot save');
select throws_ok($$ select public.cancel_event('00000000-0000-0000-0000-000000000752', null) $$, '42501', null,
  'member without the permission cannot cancel');
select throws_ok($$ select public.delete_event('00000000-0000-0000-0000-000000000752') $$, '42501', null,
  'member without the permission cannot delete');
reset role;

select pg_temp.login('00000000-0000-0000-0000-000000000744');
select throws_ok($$ select public.save_event('{"kind":"meetup","title":"x","starts_at":"2026-12-01T17:00:00Z"}', '[{"name":"x","lat":40.98,"lng":29.02}]') $$,
  '42501', null, 'probation member holding the role cannot save');
select throws_ok($$ select public.cancel_event('00000000-0000-0000-0000-000000000752', null) $$, '42501', null,
  'probation member holding the role cannot cancel');
select throws_ok($$ select public.delete_event('00000000-0000-0000-0000-000000000752') $$, '42501', null,
  'probation member holding the role cannot delete');
reset role;

select pg_temp.login('00000000-0000-0000-0000-000000000745');
select throws_ok($$ select public.save_event('{"kind":"meetup","title":"x","starts_at":"2026-12-01T17:00:00Z"}', '[{"name":"x","lat":40.98,"lng":29.02}]') $$,
  '42501', null, 'deleting organiser cannot save');
select throws_ok($$ select public.cancel_event('00000000-0000-0000-0000-000000000752', null) $$, '42501', null,
  'deleting organiser cannot cancel');
select throws_ok($$ select public.delete_event('00000000-0000-0000-0000-000000000752') $$, '42501', null,
  'deleting organiser cannot delete');
reset role;

-- ---------------------------------------------------------------------------
-- Create as the organiser 0742
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-000000000742');
select isnt(
  set_config('pgtap.ev_meetup', public.save_event(
    '{"kind":"meetup","title":"  Moda akşam  ","side":"asian","area":" ","starts_at":"2026-12-01T17:00:00Z","description":"   ","limit_people":null}',
    '[{"name":" Moda Sahili ","lat":40.98,"lng":29.02}]')::text, true),
  null::text, 'organiser creates a meet-up');
select is(
  (select row(kind::text, title, side::text, area, description, full_members_only, status::text, created_by, updated_by)::text
   from public.events where id = current_setting('pgtap.ev_meetup')::uuid),
  row('meetup', 'Moda akşam', 'asian', null::text, null::text, false, 'scheduled',
      '00000000-0000-0000-0000-000000000742'::uuid, '00000000-0000-0000-0000-000000000742'::uuid)::text,
  'meet-up stored trimmed (blank area/description → null), created_by = updated_by = the organiser');
select is(
  (select array_agg(row(position, name, lat, lng)::text order by position) from public.event_places
   where event_id = current_setting('pgtap.ev_meetup')::uuid),
  array[row(0, 'Moda Sahili', 40.980000, 29.020000)::text],
  'meet-up has its one place at position 0, name trimmed');

select isnt(
  set_config('pgtap.ev_ride', public.save_event(
    '{"kind":"ride","title":"Ağva kahvaltı","side":null,"area":" Üsküdar → Ağva ","starts_at":"2026-12-06T05:30:00Z","ends_at":"2026-12-06T14:00:00Z","description":" Kask şart. ","limit_people":20,"limit_bikes":15,"min_cc":250,"full_members_only":true}',
    '[{"name":"Üsküdar","lat":41.021111,"lng":29.004167},{"name":"Şile","lat":41.176,"lng":29.612},{"name":"Ağva","lat":41.137,"lng":29.857}]')::text, true),
  null::text, 'organiser creates a ride with start, stop and finish');
select is(
  (select row(kind::text, area, description, limit_people, limit_bikes, min_cc, full_members_only, ends_at)::text
   from public.events where id = current_setting('pgtap.ev_ride')::uuid),
  row('ride', 'Üsküdar → Ağva', 'Kask şart.', 20, 15, 250, true, '2026-12-06T14:00:00Z'::timestamptz)::text,
  'ride stored with area, limits and end');
select is(
  (select array_agg(name order by position) from public.event_places where event_id = current_setting('pgtap.ev_ride')::uuid),
  array['Üsküdar', 'Şile', 'Ağva'], 'ride places kept in route order');
select is(
  (select array_agg(position order by position) from public.event_places where event_id = current_setting('pgtap.ev_ride')::uuid),
  array[0, 1, 2]::smallint[], 'ride positions 0..n-1');

-- Allowed: a venue-only place (Google place URL with its label), and a place with both a point and a venue
select lives_ok($$ select public.save_event('{"kind":"meetup","title":"Kahve","starts_at":"2026-12-02T17:00:00Z"}',
  '[{"name":"Starbucks Caferağa","lat":null,"lng":null,"venue_url":"https://www.google.com/maps/place/Starbucks,+Cafera%C4%9Fa,+Muvakk%C4%B1thane+Cd.+No:9,+34710+Kad%C4%B1k%C3%B6y%2F%C4%B0stanbul/data=!4m2!3m1!1s0x14cab93c1a414691:0x31f407649c1b19e0","venue_label":"Starbucks, Caferağa, Muvakkıthane Cd. No:9, 34710 Kadıköy/İstanbul"}]') $$,
  'a venue-only place (Google place link + label) is allowed');
select lives_ok($$ select public.save_event('{"kind":"meetup","title":"Kahve 2","starts_at":"2026-12-03T17:00:00Z"}',
  '[{"name":"Starbucks","lat":40.99,"lng":29.03,"venue_url":"https://yandex.com.tr/maps/org/starbucks/1317996799/","venue_label":null}]') $$,
  'a place with both a point and a Yandex venue is allowed');
select lives_ok($$ select public.save_event('{"kind":"ride","title":"Tur","area":"Şile","starts_at":"2026-12-07T05:30:00Z"}',
  (select jsonb_agg(jsonb_build_object('name', 'Durak ' || i, 'lat', 41, 'lng', 29)) from generate_series(1, 12) i)) $$,
  'a ride with 12 places (start, 10 stops, finish) is allowed');

-- Must fail (22023): place count for the kind, area rules, unknown kind/side, missing start time, malformed places
select throws_ok($$ select public.save_event('{"kind":"meetup","title":"x","starts_at":"2026-12-01T17:00:00Z"}',
  '[{"name":"a","lat":40.98,"lng":29.02},{"name":"b","lat":40.98,"lng":29.02}]') $$, '22023', null, 'meet-up with 2 places refused');
select throws_ok($$ select public.save_event('{"kind":"meetup","title":"x","starts_at":"2026-12-01T17:00:00Z"}', '[]') $$,
  '22023', null, 'meet-up without a place refused');
select throws_ok($$ select public.save_event('{"kind":"ride","title":"Ağva","area":"Ağva","starts_at":"2026-12-06T05:30:00Z"}',
  '[{"name":"Üsküdar","lat":41.02,"lng":29.01}]') $$, '22023', null, 'ride needs start and finish');
select throws_ok($$ select public.save_event('{"kind":"ride","title":"Tur","area":"Şile","starts_at":"2026-12-07T05:30:00Z"}',
  (select jsonb_agg(jsonb_build_object('name', 'Durak ' || i, 'lat', 41, 'lng', 29)) from generate_series(1, 13) i)) $$,
  '22023', null, 'ride with 13 places refused');
select throws_ok($$ select public.save_event('{"kind":"ride","title":"Ağva","starts_at":"2026-12-06T05:30:00Z"}',
  '[{"name":"a","lat":41,"lng":29},{"name":"b","lat":41,"lng":29}]') $$, '22023', null, 'ride without area refused');
select throws_ok($$ select public.save_event('{"kind":"ride","title":"Ağva","area":"   ","starts_at":"2026-12-06T05:30:00Z"}',
  '[{"name":"a","lat":41,"lng":29},{"name":"b","lat":41,"lng":29}]') $$, '22023', null, 'ride with a blank area refused');
select throws_ok($$ select public.save_event('{"kind":"meetup","title":"x","area":"Moda","starts_at":"2026-12-01T17:00:00Z"}',
  '[{"name":"a","lat":40.98,"lng":29.02}]') $$, '22023', null, 'meet-up with area refused');
select throws_ok($$ select public.save_event('{"kind":"tour","title":"x","starts_at":"2026-12-01T17:00:00Z"}',
  '[{"name":"a","lat":40.98,"lng":29.02}]') $$, '22023', null, 'unknown kind refused');
select throws_ok($$ select public.save_event('{"title":"x","starts_at":"2026-12-01T17:00:00Z"}',
  '[{"name":"a","lat":40.98,"lng":29.02}]') $$, '22023', null, 'missing kind refused');
select throws_ok($$ select public.save_event('{"kind":"meetup","title":"x","side":"north","starts_at":"2026-12-01T17:00:00Z"}',
  '[{"name":"a","lat":40.98,"lng":29.02}]') $$, '22023', null, 'unknown side refused');
select throws_ok($$ select public.save_event('{"kind":"meetup","title":"x"}',
  '[{"name":"a","lat":40.98,"lng":29.02}]') $$, '22023', null, 'missing start time refused');
select throws_ok($$ select public.save_event('{"kind":"meetup","title":"x","starts_at":"infinity"}',
  '[{"name":"a","lat":40.98,"lng":29.02}]') $$, '22023', null, 'an infinite start time refused');
select throws_ok($$ select public.save_event('{"kind":"meetup","title":"x","starts_at":"2026-12-01T17:00:00Z","ends_at":"infinity"}',
  '[{"name":"a","lat":40.98,"lng":29.02}]') $$, '22023', null, 'an infinite end time refused');
select throws_ok($$ select public.save_event('{"kind":"meetup","title":"x","starts_at":"2026-12-01T17:00:00Z"}',
  '{"name":"a","lat":40.98,"lng":29.02}') $$, '22023', null, 'places must be an array');
select throws_ok($$ select public.save_event('{"kind":"meetup","title":"x","starts_at":"2026-12-01T17:00:00Z"}',
  '["Moda"]') $$, '22023', null, 'each place must be an object');

-- Must fail (23514): table checks
select throws_ok($$ select public.save_event('{"kind":"meetup","title":"x","starts_at":"2026-12-01T17:00:00Z","ends_at":"2026-12-01T16:00:00Z"}',
  '[{"name":"a","lat":40.98,"lng":29.02}]') $$, '23514', null, 'ends_at before starts_at refused');
select throws_ok($$ select public.save_event('{"kind":"meetup","title":"x","starts_at":"2026-12-01T17:00:00Z","ends_at":"2026-12-01T17:00:00Z"}',
  '[{"name":"a","lat":40.98,"lng":29.02}]') $$, '23514', null, 'ends_at equal to starts_at refused');
select throws_ok($$ select public.save_event('{"kind":"meetup","title":"x","starts_at":"2026-12-01T17:00:00Z"}',
  '[{"name":"a","lat":95,"lng":29.02}]') $$, '23514', null, 'lat 95 refused');
select throws_ok($$ select public.save_event('{"kind":"meetup","title":"x","starts_at":"2026-12-01T17:00:00Z"}',
  '[{"name":"a","lat":40.98,"lng":-181}]') $$, '23514', null, 'lng -181 refused');
select throws_ok($$ select public.save_event('{"kind":"meetup","title":"x","starts_at":"2026-12-01T17:00:00Z","limit_people":0}',
  '[{"name":"a","lat":40.98,"lng":29.02}]') $$, '23514', null, 'limit_people 0 refused');
select throws_ok($$ select public.save_event('{"kind":"meetup","title":"x","starts_at":"2026-12-01T17:00:00Z","limit_bikes":501}',
  '[{"name":"a","lat":40.98,"lng":29.02}]') $$, '23514', null, 'limit_bikes 501 refused');
select throws_ok($$ select public.save_event('{"kind":"meetup","title":"x","starts_at":"2026-12-01T17:00:00Z","min_cc":40}',
  '[{"name":"a","lat":40.98,"lng":29.02}]') $$, '23514', null, 'min_cc 40 refused');
select throws_ok($$ select public.save_event('{"kind":"meetup","title":"x","starts_at":"2026-12-01T17:00:00Z","min_cc":3001}',
  '[{"name":"a","lat":40.98,"lng":29.02}]') $$, '23514', null, 'min_cc 3001 refused');
select throws_ok(format($$ select public.save_event(%L, '[{"name":"a","lat":40.98,"lng":29.02}]') $$,
  jsonb_build_object('kind', 'meetup', 'title', repeat('a', 81), 'starts_at', '2026-12-01T17:00:00Z')),
  '23514', null, 'title of 81 chars refused');
select throws_ok($$ select public.save_event('{"kind":"meetup","title":"   ","starts_at":"2026-12-01T17:00:00Z"}',
  '[{"name":"a","lat":40.98,"lng":29.02}]') $$, '23514', null, 'blank title refused');
select throws_ok(format($$ select public.save_event(%L, '[{"name":"a","lat":41,"lng":29},{"name":"b","lat":41,"lng":29}]') $$,
  jsonb_build_object('kind', 'ride', 'title', 'x', 'area', repeat('a', 81), 'starts_at', '2026-12-01T17:00:00Z')),
  '23514', null, 'area of 81 chars refused');
select throws_ok(format($$ select public.save_event(%L, '[{"name":"a","lat":40.98,"lng":29.02}]') $$,
  jsonb_build_object('kind', 'meetup', 'title', 'x', 'description', repeat('a', 2001), 'starts_at', '2026-12-01T17:00:00Z')),
  '23514', null, 'description of 2001 chars refused');
select throws_ok(format($$ select public.save_event('{"kind":"meetup","title":"x","starts_at":"2026-12-01T17:00:00Z"}', %L) $$,
  jsonb_build_array(jsonb_build_object('name', repeat('a', 81), 'lat', 40.98, 'lng', 29.02))),
  '23514', null, 'place name of 81 chars refused');
select throws_ok($$ select public.save_event('{"kind":"meetup","title":"x","starts_at":"2026-12-01T17:00:00Z"}',
  '[{"name":"  ","lat":40.98,"lng":29.02}]') $$, '23514', null, 'blank place name refused');
select throws_ok($$ select public.save_event('{"kind":"meetup","title":"x","starts_at":"2026-12-01T17:00:00Z"}',
  '[{"name":"a","lat":null,"lng":null,"venue_url":null}]') $$, '23514', null, 'a place with neither point nor venue refused');
select throws_ok($$ select public.save_event('{"kind":"meetup","title":"x","starts_at":"2026-12-01T17:00:00Z"}',
  '[{"name":"a","lat":40.98}]') $$, '23514', null, 'lat without lng refused');
select throws_ok($$ select public.save_event('{"kind":"meetup","title":"x","starts_at":"2026-12-01T17:00:00Z"}',
  '[{"name":"a","venue_url":"https://evil.com/maps/place/x"}]') $$, '23514', null, 'venue_url on another host refused');
select throws_ok($$ select public.save_event('{"kind":"meetup","title":"x","starts_at":"2026-12-01T17:00:00Z"}',
  '[{"name":"a","venue_url":"https://www.google.com/maps/place/x?g_st=ac"}]') $$, '23514', null, 'venue_url with a query string refused');
select throws_ok($$ select public.save_event('{"kind":"meetup","title":"x","starts_at":"2026-12-01T17:00:00Z"}',
  '[{"name":"a","venue_url":"http://www.google.com/maps/place/x"}]') $$, '23514', null, 'venue_url over http refused');
select throws_ok(format($$ select public.save_event('{"kind":"meetup","title":"x","starts_at":"2026-12-01T17:00:00Z"}', %L) $$,
  jsonb_build_array(jsonb_build_object('name', 'a', 'venue_url', 'https://www.google.com/maps/place/' || repeat('a', 467)))),
  '23514', null, 'venue_url of 501 chars refused');
select throws_ok(format($$ select public.save_event('{"kind":"meetup","title":"x","starts_at":"2026-12-01T17:00:00Z"}', %L) $$,
  jsonb_build_array(jsonb_build_object('name', 'a', 'venue_url', 'https://yandex.com.tr/maps/org/x/1/', 'venue_label', repeat('a', 201)))),
  '23514', null, 'venue_label of 201 chars refused');
select throws_ok($$ select public.save_event('{"kind":"meetup","title":"x","starts_at":"2026-12-01T17:00:00Z"}',
  '[{"name":"a","lat":40.98,"lng":29.02,"venue_label":"Moda"}]') $$, '23514', null, 'a venue label without a venue link refused');
reset role;

-- ---------------------------------------------------------------------------
-- Edit as 0742: the admin's ride 0751
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-000000000742');
select is(public.save_event(p_id => '00000000-0000-0000-0000-000000000751',
    p_event => '{"kind":"ride","title":"pgtap-ev Ağva","side":"asian","area":"Üsküdar → Ağva","starts_at":"2026-12-06T05:30:00Z"}',
    p_places => '[{"name":"Ağva","lat":41.137,"lng":29.857},{"name":"Polonezköy","lat":41.11,"lng":29.21},{"name":"Şile","lat":41.176,"lng":29.612},{"name":"Üsküdar","lat":41.021111,"lng":29.004167}]'),
  '00000000-0000-0000-0000-000000000751'::uuid, 'organiser edits the admin''s ride (returns its id)');
select is(
  (select array_agg(name order by position) from public.event_places where event_id = '00000000-0000-0000-0000-000000000751'),
  array['Ağva', 'Polonezköy', 'Şile', 'Üsküdar'], 'places replaced in the new order');
select is(
  (select array_agg(position order by position) from public.event_places where event_id = '00000000-0000-0000-0000-000000000751'),
  array[0, 1, 2, 3]::smallint[], 'positions 0..n-1 after a reorder');
select is(
  (select row(created_by, updated_by)::text from public.events where id = '00000000-0000-0000-0000-000000000751'),
  row('00000000-0000-0000-0000-000000000741'::uuid, '00000000-0000-0000-0000-000000000742'::uuid)::text,
  'updated_by becomes the editor, created_by stays');
select ok((select updated_at > now() - interval '1 hour' and created_at < now() - interval '1 hour'
  from public.events where id = '00000000-0000-0000-0000-000000000751'), 'updated_at moves, created_at stays');

select lives_ok($$ select public.save_event(p_id => '00000000-0000-0000-0000-000000000751',
    p_event => '{"kind":"meetup","title":"pgtap-ev Ağva buluşma","starts_at":"2026-12-06T05:30:00Z"}',
    p_places => '[{"name":"Üsküdar","lat":41.021111,"lng":29.004167}]') $$, 'organiser turns the ride into a meet-up');
select is((select count(*)::int from public.event_places where event_id = '00000000-0000-0000-0000-000000000751'), 1,
  'exactly 1 place left');
select is((select row(kind::text, area)::text from public.events where id = '00000000-0000-0000-0000-000000000751'),
  row('meetup', null::text)::text, 'kind changed, area gone');
select throws_ok($$ select public.save_event(p_id => '00000000-0000-0000-0000-000000000751',
    p_event => '{"kind":"meetup","title":"x","area":"Moda","starts_at":"2026-12-06T05:30:00Z"}',
    p_places => '[{"name":"Üsküdar","lat":41.021111,"lng":29.004167}]') $$, '22023', null, 'edit keeps the input rules');
select throws_ok($$ select public.save_event(p_id => '00000000-0000-0000-0000-000000000758',
    p_event => '{"kind":"meetup","title":"x","starts_at":"2026-12-06T05:30:00Z"}',
    p_places => '[{"name":"Üsküdar","lat":41.021111,"lng":29.004167}]') $$, 'P0002', null, 'editing an unknown id → P0002');

-- ---------------------------------------------------------------------------
-- Cancel
-- ---------------------------------------------------------------------------
select lives_ok($$ select public.cancel_event('00000000-0000-0000-0000-000000000752', '  Yağmur bekleniyor.  ') $$,
  'organiser cancels a meet-up');
select is(
  (select row(status::text, cancelled_at is not null, cancel_reason, updated_by)::text
   from public.events where id = '00000000-0000-0000-0000-000000000752'),
  row('cancelled', true, 'Yağmur bekleniyor.', '00000000-0000-0000-0000-000000000742'::uuid)::text,
  'status cancelled, cancelled_at set, reason trimmed, updated_by the canceller');
select throws_ok($$ select public.save_event(p_id => '00000000-0000-0000-0000-000000000752',
    p_event => '{"kind":"meetup","title":"x","starts_at":"2026-12-01T17:00:00Z"}', p_places => '[{"name":"a","lat":40.98,"lng":29.02}]') $$,
  '22023', null, 'editing a cancelled event refused');
select throws_ok($$ select public.cancel_event(p_id => '00000000-0000-0000-0000-000000000752') $$, '22023', null,
  'cancelling a cancelled event refused (reason omitted)');
select lives_ok($$ select public.cancel_event(current_setting('pgtap.ev_ride')::uuid, '   ') $$,
  'cancel with a blank reason');
select is((select cancel_reason from public.events where id = current_setting('pgtap.ev_ride')::uuid), null::text,
  'a blank reason is stored as null');
select throws_ok(format($$ select public.cancel_event(%L, %L) $$, current_setting('pgtap.ev_meetup'), repeat('a', 201)),
  '23514', null, 'cancel reason of 201 chars refused');
select throws_ok($$ select public.cancel_event('00000000-0000-0000-0000-000000000758', null) $$, 'P0002', null,
  'cancelling an unknown id → P0002');

-- ---------------------------------------------------------------------------
-- Delete
-- ---------------------------------------------------------------------------
select lives_ok($$ select public.delete_event('00000000-0000-0000-0000-000000000752') $$, 'organiser deletes an event');
reset role;
select is((select count(*)::int from public.events where id = '00000000-0000-0000-0000-000000000752'), 0, 'event row gone');
select is((select count(*)::int from public.event_places where event_id = '00000000-0000-0000-0000-000000000752'), 0,
  'its places gone');
select pg_temp.login('00000000-0000-0000-0000-000000000742');
select throws_ok($$ select public.delete_event('00000000-0000-0000-0000-000000000752') $$, 'P0002', null,
  'deleting an unknown id → P0002');
reset role;

-- ---------------------------------------------------------------------------
-- The organiser's account goes: events stay, authorship nulled
-- ---------------------------------------------------------------------------
delete from auth.users where id = '00000000-0000-0000-0000-000000000742';
select is(
  (select row(created_by, updated_by)::text from public.events where id = current_setting('pgtap.ev_meetup')::uuid),
  row(null::uuid, null::uuid)::text, 'deleting the organiser nulls created_by/updated_by');
select is((select count(*)::int from public.event_places where event_id = current_setting('pgtap.ev_meetup')::uuid), 1,
  'the event and its place stay');
select is((select updated_by from public.events where id = '00000000-0000-0000-0000-000000000751'), null::uuid,
  'updated_by on an event they edited is nulled');
select is((select created_by from public.events where id = '00000000-0000-0000-0000-000000000751'),
  '00000000-0000-0000-0000-000000000741'::uuid, 'the creator stays');

select * from finish();
rollback;
