SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.cancel_event (
  p_id     uuid,
  p_reason text DEFAULT NULL::text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION "public"."cancel_event"(uuid, text) FROM "anon";

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

  delete from public.events where id = p_id;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."delete_event"(uuid) FROM "anon";

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
  v_status public.event_status;
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
    select e.status into v_status from public.events e where e.id = p_id for update;
    if not found then
      raise exception 'event not found' using errcode = 'P0002';
    end if;
    if v_status = 'cancelled' then
      raise exception 'a cancelled event can''t be edited' using errcode = '22023';
    end if;

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
    where id = p_id;

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

  return v_id;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."save_event"(jsonb, jsonb, uuid) FROM "anon";

ALTER TABLE "public"."events"
  ADD CONSTRAINT "events_area_check" CHECK (((area IS NULL) OR (((char_length(area) >= 1) AND (char_length(area) <= 80)) AND (area = btrim(area)))));

ALTER TABLE "public"."events"
  ADD CONSTRAINT "events_cancel_reason_check"
    CHECK (((cancel_reason IS NULL) OR (((char_length(cancel_reason) >= 1) AND (char_length(cancel_reason) <= 200)) AND (cancel_reason = btrim(cancel_reason)))));

ALTER TABLE "public"."events"
  ADD CONSTRAINT "events_cancelled_at" CHECK (((status = 'cancelled'::public.event_status) = (cancelled_at IS NOT NULL)));

ALTER TABLE "public"."events"
  ADD CONSTRAINT "events_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE "public"."events"
  ADD CONSTRAINT "events_description_check"
    CHECK (((description IS NULL) OR (((char_length(description) >= 1) AND (char_length(description) <= 2000)) AND (description = btrim(description)))));

ALTER TABLE "public"."events"
  ADD CONSTRAINT "events_ends_after_start" CHECK (((ends_at IS NULL) OR (ends_at > starts_at)));

ALTER TABLE "public"."events"
  ADD CONSTRAINT "events_limit_bikes_check" CHECK (((limit_bikes >= 1) AND (limit_bikes <= 500)));

ALTER TABLE "public"."events"
  ADD CONSTRAINT "events_limit_people_check" CHECK (((limit_people >= 1) AND (limit_people <= 500)));

ALTER TABLE "public"."events"
  ADD CONSTRAINT "events_min_cc_check" CHECK (((min_cc >= 50) AND (min_cc <= 3000)));

ALTER TABLE "public"."event_places"
  ADD CONSTRAINT "event_places_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;

ALTER TABLE "public"."events"
  ADD CONSTRAINT "events_reason_only_when_cancelled" CHECK (((cancel_reason IS NULL) OR (status = 'cancelled'::public.event_status)));

ALTER TABLE "public"."events"
  ADD CONSTRAINT "events_ride_area" CHECK (((kind = 'ride'::public.event_kind) = (area IS NOT NULL)));

ALTER TABLE "public"."events"
  ADD CONSTRAINT "events_title_check" CHECK ((((char_length(title) >= 1) AND (char_length(title) <= 80)) AND (title = btrim(title))));

ALTER TABLE "public"."events"
  ADD CONSTRAINT "events_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX events_starts_at_idx ON public.events USING btree (starts_at, id);

