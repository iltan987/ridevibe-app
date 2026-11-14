SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.cancel_my_account_deletion()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  me uuid := (select auth.uid());
  previous public.member_status;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select p.status_before_deletion into previous
  from public.profiles p where p.id = me and p.status = 'deleting' for update;
  if not found then
    raise exception 'no account deletion to cancel' using errcode = '55000';
  end if;

  update public.profiles
  set status = previous, deletion_requested_at = null, status_before_deletion = null
  where id = me;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."cancel_my_account_deletion"() FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.request_my_account_deletion()
  RETURNS timestamp WITH time zone
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  me uuid := (select auth.uid());
  current_status public.member_status;
  requested timestamptz;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select p.status into current_status from public.profiles p where p.id = me for update;
  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;
  if current_status = 'deleting' then
    raise exception 'account deletion is already requested' using errcode = '55000';
  end if;

  if current_status = 'active' and exists (
    select 1 from public.profiles p join public.roles r on r.id = p.role_id
    where p.id = me and r.is_admin
  ) then
    -- Lock every active admin (same order for all callers: no deadlock), then require another one.
    perform 1 from public.profiles p join public.roles r on r.id = p.role_id
    where r.is_admin and p.status = 'active'
    order by p.id
    for update of p;
    if not exists (
      select 1 from public.profiles p join public.roles r on r.id = p.role_id
      where r.is_admin and p.status = 'active' and p.id <> me
    ) then
      raise exception 'you are the only active admin' using errcode = '42501', hint = 'last_admin';
    end if;
  end if;

  update public.profiles
  set status = 'deleting', deletion_requested_at = now(), status_before_deletion = current_status
  where id = me
  returning deletion_requested_at into requested;

  return requested + interval '14 days';
end;
$function$;

REVOKE ALL ON FUNCTION "public"."request_my_account_deletion"() FROM PUBLIC, "anon";

GRANT EXECUTE ON FUNCTION "public"."cancel_my_account_deletion"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."cancel_my_account_deletion"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."cancel_my_account_deletion"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."cancel_my_account_deletion"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."request_my_account_deletion"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."request_my_account_deletion"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."request_my_account_deletion"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."request_my_account_deletion"() TO "service_role";
