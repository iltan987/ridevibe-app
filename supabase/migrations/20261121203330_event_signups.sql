SET local check_function_bodies = off;

DROP POLICY "event_places: organisers read (release gate)" ON "public"."event_places";

DROP POLICY "events: organisers read (release gate)" ON "public"."events";

CREATE TABLE "public"."event_signups" (
  "event_id"   uuid NOT NULL,
  "profile_id" uuid NOT NULL,
  CONSTRAINT "event_signups_pkey" PRIMARY KEY (event_id, profile_id)
);

ALTER TABLE "public"."event_signups"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."event_signups" FROM "anon";

CREATE TYPE "public"."event_role" AS ENUM (
  'rider',
  'passenger'
);

ALTER TABLE "public"."event_signups"
  ADD COLUMN "role" public.event_role NOT NULL;

ALTER TABLE "public"."event_signups"
  ADD COLUMN "guests" smallint NOT NULL DEFAULT 0;

ALTER TABLE "public"."event_signups"
  ADD COLUMN "created_at" timestamp WITH time zone NOT NULL DEFAULT now();

ALTER TABLE "public"."event_signups"
  ADD COLUMN "updated_at" timestamp WITH time zone NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION private.can_see_events()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select private.has_permission('events.manage')
$function$;

CREATE OR REPLACE FUNCTION public.can_see_events()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select private.can_see_events()
$function$;

REVOKE ALL ON FUNCTION "public"."can_see_events"() FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.delete_event (
  p_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

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
$function$;

REVOKE ALL ON FUNCTION "public"."join_event"(uuid, public.event_role, integer) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.leave_event (
  p_event uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION "public"."leave_event"(uuid) FROM PUBLIC, "anon";

ALTER TABLE "public"."event_signups"
  ADD CONSTRAINT "event_signups_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;

ALTER TABLE "public"."event_signups"
  ADD CONSTRAINT "event_signups_guests_check" CHECK (((guests >= 0) AND (guests <= 3)));

ALTER TABLE "public"."event_signups"
  ADD CONSTRAINT "event_signups_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE VIEW "private"."counted_event_signups" WITH (security_invoker=true) AS  SELECT s.event_id,
    s.profile_id,
    s.role,
    s.guests,
    p.status AS profile_status,
    s.created_at,
    s.updated_at
   FROM (public.event_signups s
     JOIN public.profiles p ON ((p.id = s.profile_id)))
  WHERE (p.status = ANY (ARRAY['active'::public.member_status, 'probation'::public.member_status]));

CREATE INDEX event_signups_profile_idx ON public.event_signups USING btree (profile_id, event_id);

CREATE TRIGGER event_signups_set_updated_at
  BEFORE UPDATE ON public.event_signups
  FOR EACH ROW
  EXECUTE FUNCTION private.set_updated_at();

CREATE POLICY "event_places: read behind the release gate" ON "public"."event_places"
  FOR SELECT
  TO "authenticated"
  USING (( SELECT private.can_see_events() AS can_see_events));

CREATE POLICY "event_signups: read own behind the release gate" ON "public"."event_signups"
  FOR SELECT
  TO "authenticated"
  USING (((profile_id = ( SELECT auth.uid() AS uid)) AND ( SELECT private.can_see_events() AS can_see_events)));

CREATE POLICY "events: read behind the release gate" ON "public"."events"
  FOR SELECT
  TO "authenticated"
  USING (( SELECT private.can_see_events() AS can_see_events));

COMMENT ON COLUMN "public"."event_signups"."guests" IS 'Non-member passengers brought along (0-3); a count only, never names.';

COMMENT ON TABLE "public"."event_signups" IS 'Who joined which event, as rider or passenger, with guests. Written only via join_event / leave_event.';

REVOKE ALL ON FUNCTION "private"."can_see_events"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."can_see_events"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."can_see_events"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."can_see_events"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."can_see_events"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."can_see_events"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."join_event"(uuid, public.event_role, integer) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."join_event"(uuid, public.event_role, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."join_event"(uuid, public.event_role, integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."join_event"(uuid, public.event_role, integer) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."leave_event"(uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."leave_event"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."leave_event"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."leave_event"(uuid) TO "service_role";

REVOKE ALL ON TABLE "public"."event_signups" FROM "authenticated";

GRANT SELECT ON TABLE "public"."event_signups" TO "authenticated";

REVOKE ALL ON TABLE "public"."event_signups" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."event_signups" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."event_signups" TO "service_role";
