SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.set_my_birth_date (
  new_date date
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if not private.is_active_member() then
    raise exception 'only active members can set a birth date' using errcode = '42501';
  end if;

  perform 1 from public.member_details d
  where d.profile_id = (select auth.uid()) and d.birth_date is null
  for update;
  if not found then
    raise exception 'birth date is already set' using errcode = '42501';
  end if;

  if new_date is null
     or new_date <= date '1920-01-01'
     or new_date > ((now() at time zone 'Europe/Istanbul')::date - interval '18 years') then
    raise exception 'birth date must be after 1920-01-01 and at least 18 years ago'
      using errcode = '23514';
  end if;

  update public.member_details set birth_date = new_date where profile_id = (select auth.uid());
end;
$function$;

REVOKE ALL ON FUNCTION "public"."set_my_birth_date"(date) FROM PUBLIC, "anon";

COMMENT ON COLUMN "public"."member_details"."birth_date" IS 'Copied from the approved application, or entered once by the member via set_my_birth_date.';

GRANT EXECUTE ON FUNCTION "public"."set_my_birth_date"(date) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."set_my_birth_date"(date) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_my_birth_date"(date) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_my_birth_date"(date) TO "service_role";
