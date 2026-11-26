SET local check_function_bodies = off;

DROP FUNCTION "public"."leave_event"(uuid);

CREATE TABLE "public"."event_declines" (
  "event_id"   uuid                     NOT NULL,
  "profile_id" uuid                     NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "event_declines_pkey" PRIMARY KEY (event_id, profile_id)
);

ALTER TABLE "public"."event_declines"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."event_declines" FROM "anon";

CREATE OR REPLACE FUNCTION public.decline_event (
  p_event uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  uid uuid := (select auth.uid());
  v_member public.member_status;
  v_starts timestamptz;
  v_full_only boolean;
begin
  if not (select private.can_see_events()) then
    raise exception 'events are not open to you' using errcode = '42501';
  end if;
  -- Defence in depth, as in join_event: the gate already refuses every other status.
  select p.status into v_member from public.profiles p where p.id = uid;
  if v_member is null or v_member not in ('active', 'probation') then
    raise exception 'only active and ön alım members answer events' using errcode = '42501';
  end if;

  select e.starts_at, e.full_members_only into v_starts, v_full_only
  from public.events e
  where e.id = p_event
  for update;
  if not found then
    raise exception 'event not found' using errcode = 'P0002';
  end if;
  if now() >= v_starts then
    raise exception 'event has started' using errcode = 'P0001', hint = 'started';
  end if;

  if v_full_only and v_member = 'probation' and not exists (
    select 1 from public.event_signups s where s.event_id = p_event and s.profile_id = uid
  ) then
    raise exception 'full members only' using errcode = 'P0001', hint = 'full_members_only';
  end if;

  delete from public.event_signups where event_id = p_event and profile_id = uid;
  insert into public.event_declines (event_id, profile_id)
  values (p_event, uid)
  on conflict (event_id, profile_id) do nothing;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."decline_event"(uuid) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.event_decliners (
  p_event uuid
)
  RETURNS TABLE (
    profile_id uuid,
    full_name  text,
    avatar_url text,
    probation  boolean
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

  perform 1 from public.events e where e.id = p_event;
  if not found then
    raise exception 'event not found' using errcode = 'P0002';
  end if;

  if not (select private.has_permission('events.manage')) then
    return;
  end if;

  return query
  select d.profile_id, p.full_name, p.avatar_url, p.status = 'probation'
  from public.event_declines d
  join public.profiles p on p.id = d.profile_id
  where d.event_id = p_event
    and p.status in ('active', 'probation')
  order by p.full_name collate "tr-x-icu", d.profile_id;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."event_decliners"(uuid) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.event_unanswered (
  p_event uuid
)
  RETURNS integer
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_full_only boolean;
begin
  if not (select private.can_see_events()) then
    raise exception 'events are not open to you' using errcode = '42501';
  end if;

  select e.full_members_only into v_full_only from public.events e where e.id = p_event;
  if not found then
    raise exception 'event not found' using errcode = 'P0002';
  end if;

  if not (select private.has_permission('events.manage')) then
    return null;
  end if;

  return (
    select count(*)::integer
    from public.profiles p
    where (p.status = 'active' or (p.status = 'probation' and not v_full_only))
      and not exists (
        select 1 from private.counted_event_signups c where c.event_id = p_event and c.profile_id = p.id
      )
      and not exists (
        select 1 from public.event_declines d where d.event_id = p_event and d.profile_id = p.id
      )
  );
end;
$function$;

REVOKE ALL ON FUNCTION "public"."event_unanswered"(uuid) FROM PUBLIC, "anon";

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

  -- 10. coming replaces a no (only once every rule above has passed: a refused join keeps the no)
  delete from public.event_declines where event_id = p_event and profile_id = uid;
end;
$function$;

ALTER TABLE "public"."event_declines"
  ADD CONSTRAINT "event_declines_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;

ALTER TABLE "public"."event_declines"
  ADD CONSTRAINT "event_declines_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE INDEX event_declines_profile_idx ON public.event_declines USING btree (profile_id, event_id);

CREATE POLICY "event_declines: read own declines of visible events" ON "public"."event_declines"
  FOR SELECT
  TO "authenticated"
  USING (((profile_id = ( SELECT auth.uid() AS uid)) AND ( SELECT private.can_see_events() AS can_see_events)));

COMMENT ON TABLE "public"."event_declines" IS 'Who said they won''t come to which event ("Gelmiyorum"). Written only via decline_event / join_event.';

COMMENT ON TABLE "public"."event_signups" IS 'Who joined which event, as rider or passenger, with guests. Written only via join_event / decline_event.';

GRANT EXECUTE ON FUNCTION "public"."decline_event"(uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."decline_event"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."decline_event"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."decline_event"(uuid) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."event_decliners"(uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."event_decliners"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."event_decliners"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."event_decliners"(uuid) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."event_unanswered"(uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."event_unanswered"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."event_unanswered"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."event_unanswered"(uuid) TO "service_role";

REVOKE ALL ON TABLE "public"."event_declines" FROM "authenticated";

GRANT SELECT ON TABLE "public"."event_declines" TO "authenticated";

REVOKE ALL ON TABLE "public"."event_declines" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."event_declines" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."event_declines" TO "service_role";
