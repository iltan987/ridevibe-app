SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.application_account (
  application_id uuid
)
  RETURNS TABLE (
    id        uuid,
    full_name text,
    email     text,
    status    public.member_status
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if not private.has_permission('applications.view') then
    raise exception 'missing permission applications.view' using errcode = '42501';
  end if;

  return query
  select p.id, p.full_name, c.email, p.status
  from public.applications a
  join public.profiles p on p.id = a.profile_id
  left join public.member_contacts c on c.profile_id = p.id
  where a.id = application_account.application_id;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."application_account"(uuid) FROM PUBLIC, "anon";

GRANT EXECUTE ON FUNCTION "public"."application_account"(uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."application_account"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."application_account"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."application_account"(uuid) TO "service_role";
