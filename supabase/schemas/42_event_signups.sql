-- ---------------------------------------------------------------------------
-- Event sign-ups (spec §3, §5; docs/superpowers/plans/2026-11-21-events-joining.md): a member joins an event as
-- rider (own bike) or passenger, with up to 3 guests (non-member passengers, a count only). Written only by
-- join_event / leave_event; readable only as one's own row, behind the release gate (private.can_see_events,
-- 40_events.sql). Others see counts and rosters only through RPCs.
-- Only sign-ups of active and ön alım (probation) profiles count (limits, counts, rosters, "has sign-ups"): see
-- private.counted_event_signups. Others' rows are kept and come back with the status. Deleting an account or an
-- event removes its sign-ups (cascade).
-- ---------------------------------------------------------------------------

create type public.event_role as enum ('rider', 'passenger');

create table public.event_signups (
  event_id uuid not null references public.events (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role public.event_role not null,
  guests smallint not null default 0 check (guests between 0 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, profile_id)
);

comment on table public.event_signups is 'Who joined which event, as rider or passenger, with guests. Written only via join_event / leave_event.';
comment on column public.event_signups.guests is 'Non-member passengers brought along (0-3); a count only, never names.';

create index event_signups_profile_idx on public.event_signups (profile_id, event_id);

create trigger event_signups_set_updated_at
before update on public.event_signups
for each row execute function private.set_updated_at();

revoke all on table public.event_signups from anon, authenticated;
grant select on table public.event_signups to authenticated;

alter table public.event_signups enable row level security;

create policy "event_signups: read own behind the release gate"
on public.event_signups
for select
to authenticated
using (
  profile_id = (select auth.uid())
  and (select private.can_see_events())
);

-- THE definition of a counted sign-up: the profile is active or ön alım (probation). Inactive, pending and deleting
-- people's rows stay in the table but count nowhere. Every limit check, count, roster, "has sign-ups" and change-log
-- trigger reads sign-ups through this view, never the table, so the rule lives in one place. Used only inside
-- security-definer functions; no grants (security_invoker keeps RLS in force should one ever be added).
create or replace view private.counted_event_signups
with (security_invoker = true)
as
select s.event_id, s.profile_id, s.role, s.guests, p.status as profile_status, s.created_at, s.updated_at
from public.event_signups s
join public.profiles p on p.id = s.profile_id
where p.status in ('active', 'probation');

revoke all on table private.counted_event_signups from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- join_event / leave_event. Errors (the action maps hint → reason, never the message):
--   42501  the gate refuses, or the caller is not active / ön alım
--   22023  malformed input (role null, guests null or outside 0-3); an unknown role fails the enum cast (22P02)
--   P0002  unknown event
--   P0001  hint started | cancelled | full_members_only | min_cc | people_limit | bike_limit
-- "Don't make it worse": full_members_only, min_cc and the limits refuse a change only when it raises the caller's
-- own footprint on that rule, so someone signed up before the organiser tightened it can still lower guests, switch
-- to passenger and leave.
-- The event row is locked (for update) before anything is counted: two people can't take the last place at once
-- (delete_event / save_event take the same lock).
-- ---------------------------------------------------------------------------

-- Joins, or changes one's role / guests (an upsert). people = 1 + guests per sign-up; bikes = 1 per rider.
create or replace function public.join_event(p_event uuid, p_role public.event_role, p_guests integer default 0)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  v_member public.member_status;
  v_status public.event_status;
  v_starts timestamptz;
  v_limit_people integer;
  v_limit_bikes integer;
  v_min_cc integer;
  v_full_only boolean;
  v_old_role public.event_role;
  v_old_guests smallint;
  v_signed_up boolean;
  v_old_people integer := 0;
  v_old_bikes integer := 0;
  v_new_people integer;
  v_new_bikes integer;
  v_others integer;
begin
  -- 1. gate
  if not (select private.can_see_events()) then
    raise exception 'events are not open to you' using errcode = '42501';
  end if;

  -- 2. caller status
  select p.status into v_member from public.profiles p where p.id = uid;
  if v_member is null or v_member not in ('active', 'probation') then
    raise exception 'only active and ön alım members join events' using errcode = '42501';
  end if;

  -- 3. input
  if p_role is null or p_guests is null or p_guests not between 0 and 3 then
    raise exception 'role is required; guests must be 0-3' using errcode = '22023';
  end if;

  -- 4. the event, locked before anything is counted
  select e.status, e.starts_at, e.limit_people, e.limit_bikes, e.min_cc, e.full_members_only
  into v_status, v_starts, v_limit_people, v_limit_bikes, v_min_cc, v_full_only
  from public.events e
  where e.id = p_event
  for update;
  if not found then
    raise exception 'event not found' using errcode = 'P0002';
  end if;

  -- 5. cancelled, 6. started
  if v_status = 'cancelled' then
    raise exception 'event is cancelled' using errcode = 'P0001', hint = 'cancelled';
  end if;
  if now() >= v_starts then
    raise exception 'event has started' using errcode = 'P0001', hint = 'started';
  end if;

  select s.role, s.guests into v_old_role, v_old_guests
  from public.event_signups s
  where s.event_id = p_event and s.profile_id = uid;
  v_signed_up := found;
  if v_signed_up then
    v_old_people := 1 + v_old_guests;
    v_old_bikes := (v_old_role = 'rider')::integer;
  end if;
  v_new_people := 1 + p_guests;
  v_new_bikes := (p_role = 'rider')::integer;

  -- 7. full members only: a new sign-up by an ön alım member
  if v_full_only and not v_signed_up and v_member = 'probation' then
    raise exception 'full members only' using errcode = 'P0001', hint = 'full_members_only';
  end if;

  -- 8. min_cc: becoming a rider needs an own bike of at least min_cc (a bike without cc doesn't count)
  if v_min_cc is not null and v_new_bikes > v_old_bikes and not exists (
    select 1 from public.member_motorcycles m where m.profile_id = uid and m.cc >= v_min_cc
  ) then
    raise exception 'no bike of at least % cc', v_min_cc using errcode = 'P0001', hint = 'min_cc';
  end if;

  -- 9. people limit, then bike limit: others' counted sign-ups + the new own footprint, only when it rises
  if v_limit_people is not null and v_new_people > v_old_people then
    select coalesce(sum(1 + c.guests), 0) into v_others
    from private.counted_event_signups c
    where c.event_id = p_event and c.profile_id <> uid;
    if v_others + v_new_people > v_limit_people then
      raise exception 'no room for % more', v_new_people - v_old_people using errcode = 'P0001', hint = 'people_limit';
    end if;
  end if;
  if v_limit_bikes is not null and v_new_bikes > v_old_bikes then
    select count(*) into v_others
    from private.counted_event_signups c
    where c.event_id = p_event and c.profile_id <> uid and c.role = 'rider';
    if v_others + v_new_bikes > v_limit_bikes then
      raise exception 'no room for another bike' using errcode = 'P0001', hint = 'bike_limit';
    end if;
  end if;

  insert into public.event_signups (event_id, profile_id, role, guests)
  values (p_event, uid, p_role, p_guests)
  on conflict (event_id, profile_id) do update
  set role = excluded.role, guests = excluded.guests
  where (event_signups.role, event_signups.guests) is distinct from (excluded.role, excluded.guests);
end;
$$;

revoke all on function public.join_event(uuid, public.event_role, integer) from public, anon;
grant execute on function public.join_event(uuid, public.event_role, integer) to authenticated;

-- Leaves an event (a no-op when not signed up). Allowed on a cancelled event, refused once it has started.
create or replace function public.leave_event(p_event uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  v_starts timestamptz;
begin
  if not (select private.can_see_events()) then
    raise exception 'events are not open to you' using errcode = '42501';
  end if;
  if not (select private.is_club_member()) then
    raise exception 'only active and ön alım members leave events' using errcode = '42501';
  end if;

  select e.starts_at into v_starts from public.events e where e.id = p_event for update;
  if not found then
    raise exception 'event not found' using errcode = 'P0002';
  end if;
  if now() >= v_starts then
    raise exception 'event has started' using errcode = 'P0001', hint = 'started';
  end if;

  delete from public.event_signups where event_id = p_event and profile_id = uid;
end;
$$;

revoke all on function public.leave_event(uuid) from public, anon;
grant execute on function public.leave_event(uuid) to authenticated;
