SET local check_function_bodies = off;

CREATE TABLE "public"."event_changes" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "event_id"   uuid                     NOT NULL,
  "changed_by" uuid,
  "changed_at" timestamp with time zone NOT NULL DEFAULT now(),
  "changes"    jsonb                    NOT NULL,
  CONSTRAINT "event_changes_changes_list" CHECK (((jsonb_typeof(changes) = 'array'::text) AND (jsonb_array_length(changes) > 0))),
  CONSTRAINT "event_changes_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."event_changes"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."event_changes" FROM "anon", "authenticated";

CREATE OR REPLACE FUNCTION private.event_is_upcoming (
  starts_at timestamp with time zone,
  ends_at   timestamp with time zone
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select starts_at >= now() - interval '12 hours' or coalesce(ends_at >= now(), false)
$function$;

CREATE OR REPLACE FUNCTION private.event_place_list (
  target_event uuid
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select coalesce(
    jsonb_agg(jsonb_build_object('name', p.name, 'lat', p.lat, 'lng', p.lng, 'venue_url', p.venue_url) order by p.position),
    '[]'
  )
  from public.event_places p
  where p.event_id = target_event
$function$;

CREATE OR REPLACE FUNCTION public.event_authors (
  p_event uuid
)
  RETURNS TABLE (
    created_by_name text,
    updated_by_name text,
    edited_by_other boolean
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if not (select private.can_see_events()) then
    raise exception 'events are not open to you' using errcode = '42501';
  end if;

  return query
  select
    cp.full_name,
    up.full_name,
    e.updated_by is not null and e.updated_by is distinct from e.created_by
  from public.events e
  left join public.profiles cp on cp.id = e.created_by and cp.status <> 'deleting'
  left join public.profiles up on up.id = e.updated_by and up.status <> 'deleting'
  where e.id = p_event;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."event_authors"(uuid) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.event_change_log (
  p_event uuid
)
  RETURNS TABLE (
    id              uuid,
    changed_at      timestamp with time zone,
    changes         jsonb,
    changed_by_name text
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_organiser boolean;
begin
  if not (select private.can_see_events()) then
    raise exception 'events are not open to you' using errcode = '42501';
  end if;

  v_organiser := (select private.has_permission('events.manage'));
  return query
  select ch.id, ch.changed_at, ch.changes, case when v_organiser then p.full_name end
  from public.event_changes ch
  left join public.profiles p on p.id = ch.changed_by and p.status <> 'deleting'
  where ch.event_id = p_event
  order by ch.changed_at desc, ch.id desc;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."event_change_log"(uuid) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.event_counts (
  p_events uuid[]
)
  RETURNS TABLE (
    event_id  uuid,
    people    integer,
    bikes     integer,
    members   integer,
    guests    integer,
    probation integer
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if not (select private.can_see_events()) then
    raise exception 'events are not open to you' using errcode = '42501';
  end if;

  return query
  select
    e.id,
    coalesce(sum(1 + c.guests), 0)::integer,
    (count(c.profile_id) filter (where c.role = 'rider'))::integer,
    count(c.profile_id)::integer,
    coalesce(sum(c.guests), 0)::integer,
    (count(c.profile_id) filter (where c.profile_status = 'probation'))::integer
  from public.events e
  left join private.counted_event_signups c on c.event_id = e.id
  where e.id = any(p_events)
  group by e.id
  order by e.id;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."event_counts"(uuid[]) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.event_roster (
  p_event uuid
)
  RETURNS TABLE (
    profile_id            uuid,
    full_name             text,
    avatar_url            text,
    role                  public.event_role,
    guests                integer,
    probation             boolean,
    has_emergency_contact boolean
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_starts timestamptz;
  v_ends timestamptz;
  v_organiser boolean;
begin
  if not (select private.can_see_events()) then
    raise exception 'events are not open to you' using errcode = '42501';
  end if;

  select e.starts_at, e.ends_at into v_starts, v_ends from public.events e where e.id = p_event;
  if not found then
    raise exception 'event not found' using errcode = 'P0002';
  end if;

  v_organiser := (select private.has_permission('events.manage'));
  if not v_organiser and not ((select private.is_active_member()) and private.event_is_upcoming(v_starts, v_ends)) then
    return;
  end if;

  return query
  select
    c.profile_id,
    p.full_name,
    p.avatar_url,
    c.role,
    c.guests::integer,
    case when v_organiser then c.profile_status = 'probation' end,
    case when v_organiser then exists (
      select 1 from public.member_emergency_contacts ec where ec.profile_id = c.profile_id
    ) end
  from private.counted_event_signups c
  join public.profiles p on p.id = c.profile_id
  where c.event_id = p_event
    and (v_organiser or c.profile_status = 'active')
  order by p.full_name collate "tr-x-icu", c.profile_id;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."event_roster"(uuid) FROM PUBLIC, "anon";

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

  -- 2. caller status. Defence in depth: both gate bodies (events.manage needs active; the release's is_club_member)
  -- already refuse every other status, so no test can fail without it. Keep it: it states the join rule here.
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

CREATE OR REPLACE FUNCTION public.save_event (
  p_event  jsonb,
  p_places jsonb,
  p_id     uuid  DEFAULT NULL::uuid
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

ALTER TABLE "public"."event_changes"
  ADD CONSTRAINT "event_changes_changed_by_fkey" FOREIGN KEY (changed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE "public"."event_changes"
  ADD CONSTRAINT "event_changes_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;

CREATE INDEX event_changes_event_idx ON public.event_changes USING btree (event_id, changed_at DESC, id);

COMMENT ON TABLE "public"."event_changes" IS 'What an edit changed on an event people had joined. Written only by save_event.';

REVOKE ALL ON FUNCTION "private"."event_is_upcoming"(timestamp WITH time zone, timestamp WITH time zone) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."event_place_list"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."event_authors"(uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."event_authors"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."event_authors"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."event_authors"(uuid) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."event_change_log"(uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."event_change_log"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."event_change_log"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."event_change_log"(uuid) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."event_counts"(uuid[]) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."event_counts"(uuid[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."event_counts"(uuid[]) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."event_counts"(uuid[]) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."event_roster"(uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."event_roster"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."event_roster"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."event_roster"(uuid) TO "service_role";

REVOKE ALL ON TABLE "public"."event_changes" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."event_changes" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."event_changes" TO "service_role";
