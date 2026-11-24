SET local check_function_bodies = off;


CREATE OR REPLACE FUNCTION private.can_see_events()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select private.is_club_member()
$function$;

CREATE OR REPLACE FUNCTION public.event_preview (
  p_id uuid
)
  RETURNS TABLE (
    kind      public.event_kind,
    title     text,
    day       date,
    area      text,
    cancelled boolean
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select e.kind, e.title, (e.starts_at at time zone 'Europe/Istanbul')::date, e.area, e.status = 'cancelled'
  from public.events e
  where e.id = p_id
$function$;

CREATE OR REPLACE FUNCTION public.event_teasers()
  RETURNS TABLE (
    day   date,
    title text,
    area  text,
    side  public.istanbul_side
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select (e.starts_at at time zone 'Europe/Istanbul')::date, e.title, e.area, e.side
  from public.events e
  where e.kind = 'ride'
    and e.status = 'scheduled'
    and (e.starts_at at time zone 'Europe/Istanbul')::date >= (now() at time zone 'Europe/Istanbul')::date
  order by e.starts_at, e.id
$function$;

REVOKE ALL ON FUNCTION "public"."event_preview"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."event_preview"(uuid) TO "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."event_preview"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."event_preview"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."event_preview"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."event_teasers"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."event_teasers"() TO "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."event_teasers"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."event_teasers"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."event_teasers"() TO "service_role";

CREATE OR REPLACE FUNCTION public.join_event (
  p_event  uuid,
  p_role   public.event_role,
  p_guests integer           DEFAULT 0
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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

  -- 2. caller status. Defence in depth: the gate (club members: active and ön alım) already refuses every other
  -- status, so no test can fail without it. Keep it: it states the join rule here.
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
$function$;

-- The read policies no longer speak of a "release gate" (the gate is open).
alter policy "events: read behind the release gate" on public.events rename to "events: read by club members";
alter policy "event_places: read behind the release gate" on public.event_places rename to "event_places: read by club members";
alter policy "event_signups: read own behind the release gate" on public.event_signups rename to "event_signups: read own sign-ups of visible events";
