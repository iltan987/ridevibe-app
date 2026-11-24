-- ---------------------------------------------------------------------------
-- Events (docs/superpowers/specs/2026-11-20-events-design.md §3-§4): meet-ups
-- (one place) and rides (start, up to 10 stops, finish, plus a public area
-- line). Organisers (events.manage) create, edit, cancel and delete any event,
-- only through the RPCs below; nobody writes the tables directly.
-- A place is a point (lat + lng) and/or a venue link (a cleaned Google or
-- Yandex place URL, src/lib/events/place-input.ts); a pasted route link or its
-- origin is never stored.
-- Events outlive their authors: created_by / updated_by are nulled when the
-- profile goes.
-- Release gate (spec §9, open): who sees events at all is decided in one place,
-- private.can_see_events() below. The read policies on events, places and
-- sign-ups and the join/leave RPCs (42_event_signups.sql) ask it, and the app
-- asks its public wrapper. The gate is open to club members (active and ön alım).
-- The organiser RPCs here check events.manage instead.
-- ---------------------------------------------------------------------------

create type public.event_kind as enum ('meetup', 'ride');
create type public.event_status as enum ('scheduled', 'cancelled');

create table public.events (
  id uuid primary key default gen_random_uuid(),
  kind public.event_kind not null,
  title text not null check (char_length(title) between 1 and 80 and title = btrim(title)),
  side public.istanbul_side,
  -- Rides only: the district-level line visitors will see ("Üsküdar → Ağva"), never the exact spot.
  area text check (area is null or (char_length(area) between 1 and 80 and area = btrim(area))),
  starts_at timestamptz not null,
  ends_at timestamptz,
  description text check (
    description is null or (char_length(description) between 1 and 2000 and description = btrim(description))
  ),
  limit_people integer check (limit_people between 1 and 500),
  limit_bikes integer check (limit_bikes between 1 and 500),
  min_cc integer check (min_cc between 50 and 3000),
  full_members_only boolean not null default false,
  status public.event_status not null default 'scheduled',
  cancel_reason text check (
    cancel_reason is null or (char_length(cancel_reason) between 1 and 200 and cancel_reason = btrim(cancel_reason))
  ),
  cancelled_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_ride_area check ((kind = 'ride') = (area is not null)),
  constraint events_ends_after_start check (ends_at is null or ends_at > starts_at),
  constraint events_cancelled_at check ((status = 'cancelled') = (cancelled_at is not null)),
  constraint events_reason_only_when_cancelled check (cancel_reason is null or status = 'cancelled')
);

comment on table public.events is 'Meet-ups and rides. Written only via save_event / cancel_event / delete_event.';

create index events_starts_at_idx on public.events (starts_at, id);

create table public.event_places (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  -- Route order from 0 (start); a meet-up has only position 0. Counts per kind are checked in save_event.
  position smallint not null check (position between 0 and 11),
  name text not null check (char_length(name) between 1 and 80 and name = btrim(name)),
  lat numeric(9, 6) check (lat between -90 and 90),
  lng numeric(9, 6) check (lng between -180 and 180),
  venue_url text check (
    venue_url is null or (
      char_length(venue_url) <= 500
      and venue_url ~ '^https://(www\.google\.com/maps/place/|yandex\.com\.tr/maps/org/)'
      and venue_url !~ '[?#[:space:]]'
    )
  ),
  -- The "name, address" text from a Google place path (for searches in other map apps).
  venue_label text check (
    venue_label is null or (char_length(venue_label) between 1 and 200 and venue_label = btrim(venue_label))
  ),
  constraint event_places_point_pair check ((lat is null) = (lng is null)),
  constraint event_places_point_or_venue check (lat is not null or venue_url is not null),
  constraint event_places_label_needs_venue check (venue_label is null or venue_url is not null),
  unique (event_id, position)
);

comment on table public.event_places is 'Places of an event in route order. Replaced as a whole by save_event.';

-- Change log (spec §6): save_event appends one row when an event with at least one counted sign-up changes its time,
-- places, limits or requirements. changes = [{ field, old, new }] in a fixed field order (starts_at, ends_at, places,
-- limit_people, limit_bikes, min_cc, full_members_only); for places, old/new are the ordered place names. Read only
-- through public.event_change_log (42_event_signups.sql), which shows the author to organisers only.
create table public.event_changes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now(),
  changes jsonb not null,
  constraint event_changes_changes_list check (jsonb_typeof(changes) = 'array' and jsonb_array_length(changes) > 0)
);

comment on table public.event_changes is 'What an edit changed on an event people had joined. Written only by save_event.';

create index event_changes_event_idx on public.event_changes (event_id, changed_at desc, id);

revoke all on table public.events from anon, authenticated;
revoke all on table public.event_places from anon, authenticated;
revoke all on table public.event_changes from anon, authenticated;
grant select on table public.events to authenticated;
grant select on table public.event_places to authenticated;

alter table public.events enable row level security;
alter table public.event_places enable row level security;
alter table public.event_changes enable row level security;

-- RELEASE GATE. Open to club members: active and ön alım (probation) members pass; pending, inactive and deleting
-- accounts and signed-out visitors don't. One function so every policy, RPC and page asks the same question. Granted
-- to authenticated because the policies call it; the app reads it through public.can_see_events().
create or replace function private.can_see_events()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_club_member()
$$;

revoke all on function private.can_see_events() from public, anon;
grant execute on function private.can_see_events() to authenticated;

-- Whether the signed-in caller sees events (the app shows the public teaser otherwise).
create or replace function public.can_see_events()
returns boolean
language sql
stable
set search_path = ''
as $$
  select private.can_see_events()
$$;

revoke all on function public.can_see_events() from public, anon;
grant execute on function public.can_see_events() to authenticated;

-- Public teaser list for signed-out visitors: scheduled rides from today (Istanbul day) on. Anti-goal: no time, no
-- place names or coordinates, no description, no counts, no ids, no names of people: only the day, title, area line
-- and side. The day is computed here so no client ever sees a timestamp.
create or replace function public.event_teasers()
returns table (day date, title text, area text, side public.istanbul_side)
language sql
stable
security definer
set search_path = ''
as $$
  select (e.starts_at at time zone 'Europe/Istanbul')::date, e.title, e.area, e.side
  from public.events e
  where e.kind = 'ride'
    and e.status = 'scheduled'
    and (e.starts_at at time zone 'Europe/Istanbul')::date >= (now() at time zone 'Europe/Istanbul')::date
  order by e.starts_at, e.id
$$;

revoke all on function public.event_teasers() from public;
grant execute on function public.event_teasers() to anon, authenticated;

-- Public preview of one event (link previews, the signed-out event card): any kind, any date, cancelled included; zero
-- rows when the id is unknown. Anti-goal: same as event_teasers (no time, places, description, counts or names).
create or replace function public.event_preview(p_id uuid)
returns table (kind public.event_kind, title text, day date, area text, cancelled boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select e.kind, e.title, (e.starts_at at time zone 'Europe/Istanbul')::date, e.area, e.status = 'cancelled'
  from public.events e
  where e.id = p_id
$$;

revoke all on function public.event_preview(uuid) from public;
grant execute on function public.event_preview(uuid) to anon, authenticated;

-- Upcoming = started at most 12 hours ago, or not yet ended: the rule the app's lists use (listUpcomingEvents). Past
-- events keep their counts but show members no names (event_roster).
create or replace function private.event_is_upcoming(starts_at timestamptz, ends_at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select starts_at >= now() - interval '12 hours' or coalesce(ends_at >= now(), false)
$$;

revoke all on function private.event_is_upcoming(timestamptz, timestamptz) from public, anon, authenticated;

create policy "events: read by club members"
on public.events
for select
to authenticated
using ((select private.can_see_events()));

create policy "event_places: read by club members"
on public.event_places
for select
to authenticated
using ((select private.can_see_events()));

-- ---------------------------------------------------------------------------
-- Write RPCs (events.manage). Errors: 42501 without the permission, P0002 for an unknown id, 22023 for input the
-- table checks can't judge (kind, side, place count for the kind, area rule, editing/cancelling a cancelled event),
-- 23514 from the table checks (lengths, ranges, venue link shape), P0001 with hint 'has_signups' when deleting an
-- event someone has joined. Malformed numbers, booleans and timestamps in the JSON raise Postgres cast errors besides
-- these (22P02 / 22007 / 22008 / 22003); the app's Zod schema rules them out.
-- Callers send starts_at / ends_at as ISO strings WITH an offset: a string without one is read in the session time
-- zone. Texts are trimmed here; optional ones become null when blank, required ones stay '' so the length check
-- refuses them.
-- ---------------------------------------------------------------------------

-- An event's places as the change log compares them: [{ name, lat, lng, venue_url }] in route order ('[]' without
-- places). The venue label follows the venue link, so it is left out.
create or replace function private.event_place_list(target_event uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('name', p.name, 'lat', p.lat, 'lng', p.lng, 'venue_url', p.venue_url) order by p.position),
    '[]'
  )
  from public.event_places p
  where p.event_id = target_event
$$;

revoke all on function private.event_place_list(uuid) from public, anon, authenticated;

-- p_id null (default) = create. p_event: { kind, title, side, area, starts_at, ends_at, description, limit_people, limit_bikes,
-- min_cc, full_members_only }; p_places: [{ name, lat, lng, venue_url, venue_label }] in route order (replaces all).
-- An edit that changes a logged field of an event with counted sign-ups appends one public.event_changes row.
create or replace function public.save_event(p_event jsonb, p_places jsonb, p_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  v_kind text := p_event ->> 'kind';
  v_side text := nullif(btrim(p_event ->> 'side'), '');
  v_area text := nullif(btrim(p_event ->> 'area'), '');
  v_starts timestamptz;
  v_ends timestamptz;
  v_places integer;
  v_old public.events;
  v_new public.events;
  v_old_places jsonb;
  v_new_places jsonb;
  v_changes jsonb;
  v_id uuid;
begin
  if not (select private.has_permission('events.manage')) then
    raise exception 'events.manage required' using errcode = '42501';
  end if;

  if p_event is null or jsonb_typeof(p_event) <> 'object' then
    raise exception 'event must be an object' using errcode = '22023';
  end if;
  if v_kind is null or v_kind not in ('meetup', 'ride') then
    raise exception 'unknown event kind' using errcode = '22023';
  end if;
  if v_side is not null and v_side not in ('asian', 'european') then
    raise exception 'unknown side' using errcode = '22023';
  end if;
  v_starts := (p_event ->> 'starts_at')::timestamptz;
  v_ends := (p_event ->> 'ends_at')::timestamptz;
  if v_starts is null or not isfinite(v_starts) or (v_ends is not null and not isfinite(v_ends)) then
    raise exception 'starts_at is required; starts_at and ends_at must be finite' using errcode = '22023';
  end if;
  if (v_kind = 'ride') <> (v_area is not null) then
    raise exception 'a ride needs an area; a meet-up has none' using errcode = '22023';
  end if;
  if p_places is null or jsonb_typeof(p_places) <> 'array' then
    raise exception 'places must be an array' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_places) e where jsonb_typeof(e) <> 'object') then
    raise exception 'each place must be an object' using errcode = '22023';
  end if;
  v_places := jsonb_array_length(p_places);
  if (v_kind = 'meetup' and v_places <> 1) or (v_kind = 'ride' and v_places not between 2 and 12) then
    raise exception 'a meet-up has 1 place; a ride 2-12' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.events (
      kind, title, side, area, starts_at, ends_at, description, limit_people, limit_bikes, min_cc,
      full_members_only, created_by, updated_by
    )
    values (
      v_kind::public.event_kind,
      coalesce(btrim(p_event ->> 'title'), ''),
      v_side::public.istanbul_side,
      v_area,
      v_starts,
      v_ends,
      nullif(btrim(p_event ->> 'description'), ''),
      (p_event ->> 'limit_people')::integer,
      (p_event ->> 'limit_bikes')::integer,
      (p_event ->> 'min_cc')::integer,
      coalesce((p_event ->> 'full_members_only')::boolean, false),
      uid,
      uid
    )
    returning id into v_id;
  else
    select e.* into v_old from public.events e where e.id = p_id for update;
    if not found then
      raise exception 'event not found' using errcode = 'P0002';
    end if;
    if v_old.status = 'cancelled' then
      raise exception 'a cancelled event can''t be edited' using errcode = '22023';
    end if;
    v_old_places := private.event_place_list(p_id);

    update public.events
    set kind = v_kind::public.event_kind,
        title = coalesce(btrim(p_event ->> 'title'), ''),
        side = v_side::public.istanbul_side,
        area = v_area,
        starts_at = v_starts,
        ends_at = v_ends,
        description = nullif(btrim(p_event ->> 'description'), ''),
        limit_people = (p_event ->> 'limit_people')::integer,
        limit_bikes = (p_event ->> 'limit_bikes')::integer,
        min_cc = (p_event ->> 'min_cc')::integer,
        full_members_only = coalesce((p_event ->> 'full_members_only')::boolean, false),
        updated_by = uid,
        updated_at = now()
    where id = p_id
    returning * into v_new;

    delete from public.event_places where event_id = p_id;
    v_id := p_id;
  end if;

  insert into public.event_places (event_id, position, name, lat, lng, venue_url, venue_label)
  select
    v_id,
    (p.ord - 1)::smallint,
    coalesce(btrim(p.place ->> 'name'), ''),
    (p.place ->> 'lat')::numeric,
    (p.place ->> 'lng')::numeric,
    nullif(btrim(p.place ->> 'venue_url'), ''),
    nullif(btrim(p.place ->> 'venue_label'), '')
  from jsonb_array_elements(p_places) with ordinality as p(place, ord);

  -- Change log (edits only): compare the stored values before and after, so input that only looks different (an
  -- offset, trailing zeros) logs nothing; log only when someone counted has joined.
  if p_id is not null then
    v_new_places := private.event_place_list(p_id);
    select coalesce(jsonb_agg(jsonb_build_object('field', c.field, 'old', c.old_value, 'new', c.new_value) order by c.ord), '[]')
    into v_changes
    from (values
      (1, 'starts_at', to_jsonb(v_old.starts_at), to_jsonb(v_new.starts_at), v_old.starts_at is distinct from v_new.starts_at),
      (2, 'ends_at', to_jsonb(v_old.ends_at), to_jsonb(v_new.ends_at), v_old.ends_at is distinct from v_new.ends_at),
      (3, 'places', jsonb_path_query_array(v_old_places, '$[*].name'), jsonb_path_query_array(v_new_places, '$[*].name'),
        v_old_places is distinct from v_new_places),
      (4, 'limit_people', to_jsonb(v_old.limit_people), to_jsonb(v_new.limit_people),
        v_old.limit_people is distinct from v_new.limit_people),
      (5, 'limit_bikes', to_jsonb(v_old.limit_bikes), to_jsonb(v_new.limit_bikes),
        v_old.limit_bikes is distinct from v_new.limit_bikes),
      (6, 'min_cc', to_jsonb(v_old.min_cc), to_jsonb(v_new.min_cc), v_old.min_cc is distinct from v_new.min_cc),
      (7, 'full_members_only', to_jsonb(v_old.full_members_only), to_jsonb(v_new.full_members_only),
        v_old.full_members_only is distinct from v_new.full_members_only)
    ) as c(ord, field, old_value, new_value, changed)
    where c.changed;

    -- private.counted_event_signups lives in 42_event_signups.sql (plpgsql resolves it at run time)
    if jsonb_array_length(v_changes) > 0
      and exists (select 1 from private.counted_event_signups s where s.event_id = p_id) then
      insert into public.event_changes (event_id, changed_by, changes) values (p_id, uid, v_changes);
    end if;
  end if;

  return v_id;
end;
$$;

revoke all on function public.save_event(jsonb, jsonb, uuid) from public, anon;
grant execute on function public.save_event(jsonb, jsonb, uuid) to authenticated;

create or replace function public.cancel_event(p_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.event_status;
begin
  if not (select private.has_permission('events.manage')) then
    raise exception 'events.manage required' using errcode = '42501';
  end if;

  select e.status into v_status from public.events e where e.id = p_id for update;
  if not found then
    raise exception 'event not found' using errcode = 'P0002';
  end if;
  if v_status = 'cancelled' then
    raise exception 'event already cancelled' using errcode = '22023';
  end if;

  update public.events
  set status = 'cancelled',
      cancelled_at = now(),
      cancel_reason = nullif(btrim(p_reason), ''),
      updated_by = (select auth.uid()),
      updated_at = now()
  where id = p_id;
end;
$$;

revoke all on function public.cancel_event(uuid, text) from public, anon;
grant execute on function public.cancel_event(uuid, text) to authenticated;

-- Only while nobody counted has joined (spec §3); otherwise the organiser cancels. Sign-ups of inactive / deleting
-- people don't count and go with the event (cascade). private.counted_event_signups lives in 42_event_signups.sql
-- (plpgsql resolves it at run time).
create or replace function public.delete_event(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.has_permission('events.manage')) then
    raise exception 'events.manage required' using errcode = '42501';
  end if;

  perform 1 from public.events e where e.id = p_id for update;
  if not found then
    raise exception 'event not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from private.counted_event_signups s where s.event_id = p_id) then
    raise exception 'event has sign-ups; cancel it instead' using errcode = 'P0001', hint = 'has_signups';
  end if;

  delete from public.events where id = p_id;
end;
$$;

revoke all on function public.delete_event(uuid) from public, anon;
grant execute on function public.delete_event(uuid) to authenticated;
