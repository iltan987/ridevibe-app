SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.link_application (
  application_id uuid,
  target_id      uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  app_status public.application_status;
begin
  if not private.has_permission('applications.decide') then
    raise exception 'missing permission applications.decide' using errcode = '42501';
  end if;

  select a.status into app_status
  from public.applications a
  where a.id = application_id and a.profile_id is null and a.status <> 'rejected'
  for update;
  if not found then
    raise exception 'application % not found or not linkable', application_id using errcode = 'P0002';
  end if;

  perform 1 from public.profiles p where p.id = target_id and p.status = 'pending' for update;
  if not found or exists (select 1 from public.applications a where a.profile_id = target_id) then
    raise exception 'account % not found or not linkable', target_id using errcode = 'P0002';
  end if;

  update public.applications a set profile_id = target_id where a.id = application_id;

  if app_status = 'approved' then
    perform private.activate_from_approved_application(target_id);
  end if;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."link_application"(uuid, uuid) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.linkable_accounts (
  search        text                     DEFAULT NULL::text,
  after_created timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  after_id      uuid                     DEFAULT NULL::uuid
)
  RETURNS TABLE (
    id         uuid,
    full_name  text,
    avatar_url text,
    email      text,
    created_at timestamp with time zone
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  pattern text;
begin
  if not private.has_permission('applications.decide') then
    raise exception 'missing permission applications.decide' using errcode = '42501';
  end if;

  if nullif(btrim(search), '') is not null then
    pattern := '%' || replace(replace(replace(btrim(search), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
  select p.id, p.full_name, p.avatar_url, c.email, p.created_at
  from public.profiles p
  left join public.member_contacts c on c.profile_id = p.id
  where p.status = 'pending'
    and not exists (select 1 from public.applications a where a.profile_id = p.id)
    and not exists (
      select 1 from public.applications a
      where a.profile_id is null
        and a.status in ('new', 'contacted', 'approved')
        and private.normalize_email(a.email) = private.normalize_email(c.email)
    )
    and (pattern is null or p.full_name ilike pattern or c.email ilike pattern)
    and (after_created is null or (p.created_at, p.id) < (after_created, after_id))
  order by p.created_at desc, p.id desc
  limit 26;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."linkable_accounts"(text, timestamp WITH time zone, uuid) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.my_application_status()
  RETURNS public.application_status
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select coalesce(
    (
      select a.status from public.applications a
      where a.profile_id = (select auth.uid())
      order by a.created_at desc, a.id desc
      limit 1
    ),
    (
      select a.status
      from public.applications a
      join public.member_contacts c on c.profile_id = (select auth.uid())
      where a.profile_id is null
        and private.normalize_email(a.email) = private.normalize_email(c.email)
      order by a.created_at desc, a.id desc
      limit 1
    )
  );
$function$;

REVOKE ALL ON FUNCTION "public"."my_application_status"() FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.pending_application_flags (
  profile_ids uuid[]
)
  RETURNS TABLE (
    profile_id      uuid,
    has_application boolean
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if not private.has_permission('members.manage') then
    raise exception 'missing permission members.manage' using errcode = '42501';
  end if;

  return query
  select ids.pid, exists (
    select 1 from public.applications a
    where a.status in ('new', 'contacted', 'approved')
      and (
        a.profile_id = ids.pid
        or (a.profile_id is null and private.normalize_email(a.email) = private.normalize_email(c.email))
      )
  )
  from unnest(profile_ids) as ids (pid)
  left join public.member_contacts c on c.profile_id = ids.pid;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."pending_application_flags"(uuid[]) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.set_member_name (
  target_id uuid,
  new_name  text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  clean_name text := btrim(new_name);
  target_is_admin boolean;
begin
  if not private.has_permission('members.manage') then
    raise exception 'missing permission members.manage' using errcode = '42501';
  end if;

  if clean_name is null or char_length(clean_name) not between 2 and 120 then
    raise exception 'a name must be 2 to 120 characters' using errcode = '23514';
  end if;

  select coalesce(r.is_admin, false) into target_is_admin
  from public.profiles p
  left join public.roles r on r.id = p.role_id
  where p.id = target_id;

  if not found then
    raise exception 'profile % not found', target_id using errcode = 'P0002';
  end if;

  if target_is_admin and not private.is_admin() then
    raise exception 'only admins can rename an admin' using errcode = '42501';
  end if;

  update public.profiles set full_name = clean_name where id = target_id;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."set_member_name"(uuid, text) FROM PUBLIC, "anon";

GRANT EXECUTE ON FUNCTION "public"."link_application"(uuid, uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."link_application"(uuid, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."link_application"(uuid, uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."link_application"(uuid, uuid) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."linkable_accounts"(text, timestamp WITH time zone, uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."linkable_accounts"(text, timestamp WITH time zone, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."linkable_accounts"(text, timestamp WITH time zone, uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."linkable_accounts"(text, timestamp WITH time zone, uuid) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."my_application_status"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."my_application_status"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."my_application_status"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."my_application_status"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."pending_application_flags"(uuid[]) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."pending_application_flags"(uuid[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."pending_application_flags"(uuid[]) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."pending_application_flags"(uuid[]) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."set_member_name"(uuid, text) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."set_member_name"(uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_member_name"(uuid, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_member_name"(uuid, text) TO "service_role";
