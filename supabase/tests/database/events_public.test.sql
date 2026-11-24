-- Run with: pnpm db:test
-- Public event reads (docs/superpowers/specs/2026-11-24-events-release-design.md): event_teasers (scheduled rides from
-- today on: day, title, area, side) and event_preview (one event by id: kind, title, day, area, cancelled) answer
-- anon, never a time, place, count or name; plus the opened release gate (members and ön alım members read events).
begin;
create extension if not exists pgtap with schema extensions;

select plan(30);

-- Fixtures: 0797 active member, 0798 ön alım member, 0799 pending, 0789 inactive, 0788 deleting.
-- Events planted as postgres (Istanbul day arithmetic so the test is stable at any hour):
-- 0790 ride earlier today (00:00 Istanbul, already started), 0791 ride later today (23:59), 0792 ride tomorrow,
-- 0793 ride yesterday, 0794 cancelled ride tomorrow, 0795 meet-up tomorrow, 0796 ride on 2026-12-01 00:30+03 (UTC: 2026-11-30).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000797', 'pgtap-pub-active@pgtap.invalid',    '{"full_name": "Aylin Pgtapherkes"}'),
  ('00000000-0000-0000-0000-000000000798', 'pgtap-pub-probation@pgtap.invalid', '{"full_name": "Okan Pgtapherkes"}'),
  ('00000000-0000-0000-0000-000000000799', 'pgtap-pub-pending@pgtap.invalid',   '{"full_name": "Pelin Pgtapherkes"}'),
  ('00000000-0000-0000-0000-000000000789', 'pgtap-pub-inactive@pgtap.invalid',  '{"full_name": "Ilker Pgtapherkes"}'),
  ('00000000-0000-0000-0000-000000000788', 'pgtap-pub-deleting@pgtap.invalid',  '{"full_name": "Deniz Pgtapherkes"}');
update public.profiles set status = 'active' where id = '00000000-0000-0000-0000-000000000797';
update public.profiles set status = 'probation' where id = '00000000-0000-0000-0000-000000000798';
update public.profiles set status = 'inactive' where id = '00000000-0000-0000-0000-000000000789';
update public.profiles
  set status = 'deleting', deletion_requested_at = now(), status_before_deletion = 'active'
  where id = '00000000-0000-0000-0000-000000000788';

create temp table pub_today on commit drop as
  select ((now() at time zone 'Europe/Istanbul')::date::timestamp at time zone 'Europe/Istanbul') as t0;
grant select on pub_today to anon, authenticated;

insert into public.events (id, kind, title, side, area, starts_at, description, limit_people) values
  ('00000000-0000-0000-0000-000000000790', 'ride', 'pgTAP pub earlier today', 'asian', 'Üsküdar → Şile',
   (select t0 from pub_today), 'gizli açıklama', 10),
  ('00000000-0000-0000-0000-000000000791', 'ride', 'pgTAP pub later today', 'european', 'Sarıyer → Kilyos',
   (select t0 from pub_today) + interval '23 hours 59 minutes', null, null),
  ('00000000-0000-0000-0000-000000000792', 'ride', 'pgTAP pub tomorrow', null, 'Beykoz → Riva',
   (select t0 from pub_today) + interval '1 day 12 hours', null, null),
  ('00000000-0000-0000-0000-000000000793', 'ride', 'pgTAP pub yesterday', 'asian', 'Kadıköy → Ağva',
   (select t0 from pub_today) - interval '12 hours', null, null),
  ('00000000-0000-0000-0000-000000000796', 'ride', 'pgTAP pub late evening', 'asian', 'Çekmeköy → Şile',
   '2026-12-01 00:30+03', null, null);
insert into public.events (id, kind, title, side, area, starts_at, status, cancelled_at, cancel_reason) values
  ('00000000-0000-0000-0000-000000000794', 'ride', 'pgTAP pub cancelled', 'asian', 'Kartal → Gebze',
   (select t0 from pub_today) + interval '1 day 12 hours', 'cancelled', now(), 'Yağmur');
insert into public.events (id, kind, title, starts_at) values
  ('00000000-0000-0000-0000-000000000795', 'meetup', 'pgTAP pub meetup',
   (select t0 from pub_today) + interval '1 day 12 hours');
insert into public.event_places (event_id, position, name, lat, lng) values
  ('00000000-0000-0000-0000-000000000795', 0, 'Moda Sahili', 40.98, 29.02);

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- ---------------------------------------------------------------------------
-- Grants and pinned shapes
-- ---------------------------------------------------------------------------
select ok(has_function_privilege('anon', 'public.event_teasers()', 'execute'), 'anon may call event_teasers');
select ok(has_function_privilege('authenticated', 'public.event_teasers()', 'execute'), 'authenticated may call event_teasers');
select ok(has_function_privilege('anon', 'public.event_preview(uuid)', 'execute'), 'anon may call event_preview');
select ok(has_function_privilege('authenticated', 'public.event_preview(uuid)', 'execute'), 'authenticated may call event_preview');
select is(pg_get_function_result('public.event_teasers()'::regprocedure),
  'TABLE(day date, title text, area text, side istanbul_side)', 'event_teasers returns exactly day, title, area, side');
select is(pg_get_function_result('public.event_preview(uuid)'::regprocedure),
  'TABLE(kind event_kind, title text, day date, area text, cancelled boolean)',
  'event_preview returns exactly kind, title, day, area, cancelled');
select is((select count(*)::int from pg_proc where proname = 'event_teasers' and pronamespace = 'public'::regnamespace), 1,
  'exactly one event_teasers');
select is((select count(*)::int from pg_proc where proname = 'event_preview' and pronamespace = 'public'::regnamespace), 1,
  'exactly one event_preview');

-- ---------------------------------------------------------------------------
-- As a signed-out visitor
-- ---------------------------------------------------------------------------
set local role anon;
select is((select array_agg(row(t.title, t.area, t.side)::text order by t.ord)
  from public.event_teasers() with ordinality as t(day, title, area, side, ord) where t.title like 'pgTAP pub%'
    and t.title <> 'pgTAP pub late evening'),
  array[row('pgTAP pub earlier today', 'Üsküdar → Şile', 'asian')::text,
        row('pgTAP pub later today', 'Sarıyer → Kilyos', 'european')::text,
        row('pgTAP pub tomorrow', 'Beykoz → Riva', null)::text],
  'teasers: today earlier, today later, tomorrow, in start order; not yesterday, cancelled or the meet-up');
select is((select array_agg(t.day order by t.ord)
  from public.event_teasers() with ordinality as t(day, title, area, side, ord)
  where t.title in ('pgTAP pub earlier today', 'pgTAP pub later today', 'pgTAP pub tomorrow')),
  array[(select (t0 at time zone 'Europe/Istanbul')::date from pub_today),
        (select (t0 at time zone 'Europe/Istanbul')::date from pub_today),
        (select (t0 at time zone 'Europe/Istanbul')::date + 1 from pub_today)],
  'teaser days are Istanbul days');
select is((select count(*)::int from public.event_teasers() where title in
  ('pgTAP pub yesterday', 'pgTAP pub cancelled', 'pgTAP pub meetup')), 0, 'no yesterday, cancelled or meet-up in the teasers');

select is((select row(p.kind, p.title, p.day, p.area, p.cancelled)::text
  from public.event_preview('00000000-0000-0000-0000-000000000795') p),
  row('meetup'::public.event_kind, 'pgTAP pub meetup', (select (t0 at time zone 'Europe/Istanbul')::date + 1 from pub_today),
    null::text, false)::text,
  'preview of the meet-up: kind, title, day, no area, not cancelled');
select is((select p.cancelled from public.event_preview('00000000-0000-0000-0000-000000000794') p), true,
  'preview of the cancelled ride says cancelled');
select is((select p.title from public.event_preview('00000000-0000-0000-0000-000000000793') p), 'pgTAP pub yesterday',
  'preview of yesterday''s ride still returns its row');
select is((select p.area from public.event_preview('00000000-0000-0000-0000-000000000790') p), 'Üsküdar → Şile',
  'preview of a ride carries its area');
select is((select count(*)::int from public.event_preview('00000000-0000-0000-0000-000000000779')), 0,
  'an unknown id returns no rows');
select is((select p.day from public.event_preview('00000000-0000-0000-0000-000000000796') p), '2026-12-01'::date,
  '00:30 Istanbul time reads as that Istanbul day (not the UTC one)');
select throws_ok($$ select 1 from public.events $$, '42501', null, 'anon still cannot read the events table');
select throws_ok($$ select 1 from public.event_places $$, '42501', null, 'anon still cannot read places');
reset role;

-- ---------------------------------------------------------------------------
-- The opened gate: members and ön alım members read events; everyone else not
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-000000000797');
select ok(public.can_see_events(), 'active member passes the gate');
select is((select count(*)::int from public.events where title like 'pgTAP pub%'), 7, 'active member reads the fixture events');
select is((select count(*)::int from public.event_places where event_id = '00000000-0000-0000-0000-000000000795'), 1,
  'active member reads places');
reset role;

select pg_temp.login('00000000-0000-0000-0000-000000000798');
select ok(public.can_see_events(), 'ön alım member passes the gate');
select is((select count(*)::int from public.events where title like 'pgTAP pub%'), 7, 'ön alım member reads the fixture events');
reset role;

select pg_temp.login('00000000-0000-0000-0000-000000000799');
select ok(not public.can_see_events(), 'pending account fails the gate');
select is((select count(*)::int from public.events where title like 'pgTAP pub%'), 0, 'pending account reads no events');
reset role;

select pg_temp.login('00000000-0000-0000-0000-000000000789');
select ok(not public.can_see_events(), 'inactive member fails the gate');
select is((select count(*)::int from public.events where title like 'pgTAP pub%'), 0, 'inactive member reads no events');
reset role;

select pg_temp.login('00000000-0000-0000-0000-000000000788');
select ok(not public.can_see_events(), 'deleting account fails the gate');
select is((select count(*)::int from public.events where title like 'pgTAP pub%'), 0, 'deleting account reads no events');
reset role;

select * from finish();
rollback;
