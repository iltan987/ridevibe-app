SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.keep_alive()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select true;
$function$;

REVOKE ALL ON FUNCTION "public"."keep_alive"() FROM PUBLIC, "authenticated";

GRANT EXECUTE ON FUNCTION "public"."keep_alive"() TO "anon";

REVOKE ALL ON FUNCTION "public"."keep_alive"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."keep_alive"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."keep_alive"() TO "service_role";
