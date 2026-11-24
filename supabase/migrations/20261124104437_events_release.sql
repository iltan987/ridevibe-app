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
