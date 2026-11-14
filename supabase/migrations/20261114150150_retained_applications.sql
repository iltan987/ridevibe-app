SET local check_function_bodies = off;

DROP FUNCTION "public"."pending_application_flags"(uuid[]);

CREATE OR REPLACE FUNCTION private.activate_from_approved_application (
  target_profile uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  app record;
begin
  select a.id, a.full_name, a.city, a.district, a.side, a.profile_id into app
  from public.applications a
  where a.status = 'approved'
    and a.retained_until is null
    and a.profile_id = target_profile
  order by a.reviewed_at desc nulls last, a.created_at desc
  limit 1;
  if not found then
    select a.id, a.full_name, a.city, a.district, a.side, a.profile_id into app
    from public.applications a
    join public.member_contacts c on c.profile_id = target_profile
    where a.status = 'approved'
      and a.retained_until is null
      and a.profile_id is null
      and private.normalize_email(a.email) = private.normalize_email(c.email)
    order by a.reviewed_at desc nulls last, a.created_at desc
    limit 1;
    if not found then
      return;
    end if;
  end if;

  update public.profiles p
  set status = 'active',
      full_name = app.full_name,
      city = case when p.district is null then app.city else p.city end,
      side = case when p.district is null then app.side else p.side end,
      district = coalesce(p.district, app.district)
  where p.id = target_profile and p.status = 'pending';
  if not found then
    return;
  end if;

  if app.profile_id is null then
    update public.applications set profile_id = target_profile where id = app.id;
  end if;

  perform private.fill_member_from_application(target_profile, app.id);
end;
$function$;

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
  target_status public.member_status;
begin
  if not private.has_permission('applications.decide') then
    raise exception 'missing permission applications.decide' using errcode = '42501';
  end if;

  select a.status into app_status
  from public.applications a
  where a.id = application_id and a.profile_id is null and a.status <> 'rejected'
    and a.retained_until is null
    and not private.application_hidden_for_deletion(a.profile_id, a.email, a.status)
  for update;
  if not found then
    raise exception 'application % not found or not linkable', application_id using errcode = 'P0002';
  end if;

  select p.status into target_status
  from public.profiles p
  where p.id = target_id
    and (p.status = 'pending' or (p.status = 'active' and app_status = 'approved'))
  for update;
  if not found
    or exists (
      select 1 from public.applications a
      where a.profile_id = target_id and a.status in ('new', 'contacted', 'approved')
        and a.retained_until is null
    )
    or exists (
      select 1
      from public.applications a
      join public.member_contacts c on c.profile_id = target_id
      where a.id <> application_id
        and a.profile_id is null
        and a.retained_until is null
        and a.status in ('new', 'contacted', 'approved')
        and private.normalize_email(a.email) = private.normalize_email(c.email)
    )
  then
    raise exception 'account % not found or not linkable', target_id using errcode = 'P0002';
  end if;

  update public.applications a set profile_id = target_id where a.id = application_id;

  if app_status = 'approved' and target_status = 'pending' then
    perform private.activate_from_approved_application(target_id);
  elsif app_status = 'approved' then
    perform private.fill_member_from_application(target_id, application_id);
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.linkable_accounts (
  search         text                     DEFAULT NULL::text,
  after_created  timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  after_id       uuid                     DEFAULT NULL::uuid,
  include_active boolean                  DEFAULT false
)
  RETURNS TABLE (
    id         uuid,
    full_name  text,
    avatar_url text,
    email      text,
    created_at timestamp with time zone,
    status     public.member_status
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

  if (after_created is null) <> (after_id is null) then
    raise exception 'after_created and after_id go together' using errcode = '22023';
  end if;

  if nullif(btrim(search), '') is not null then
    pattern := '%' || replace(replace(replace(btrim(search), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
  select p.id, p.full_name, p.avatar_url, c.email, p.created_at, p.status
  from public.profiles p
  left join public.member_contacts c on c.profile_id = p.id
  where (p.status = 'pending' or (include_active and p.status = 'active'))
    and not exists (
      select 1 from public.applications a
      where a.profile_id = p.id and a.status in ('new', 'contacted', 'approved')
        and a.retained_until is null
    )
    and not exists (
      select 1 from public.applications a
      where a.profile_id is null
        and a.retained_until is null
        and a.status in ('new', 'contacted', 'approved')
        and private.normalize_email(a.email) = private.normalize_email(c.email)
    )
    and (pattern is null or p.full_name ilike pattern or c.email ilike pattern)
    and (after_created is null or (p.created_at, p.id) < (after_created, after_id))
  order by p.created_at desc, p.id desc
  limit 26;
end;
$function$;

CREATE OR REPLACE FUNCTION public.my_application_status()
  RETURNS public.application_status
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select a.status
  from public.applications a
  where a.retained_until is null
    and (
      a.profile_id = (select auth.uid())
      or (
        a.profile_id is null
        and private.normalize_email(a.email) = (
          select private.normalize_email(c.email)
          from public.member_contacts c
          where c.profile_id = (select auth.uid())
        )
      )
    )
  order by a.created_at desc, a.id desc
  limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.pending_application_flags (
  profile_ids uuid[]
)
  RETURNS TABLE (
    profile_id      uuid,
    has_application boolean,
    former_member   boolean
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
  select ids.pid,
    exists (
      select 1 from public.applications a
      where a.status in ('new', 'contacted', 'approved')
        and a.retained_until is null
        and (
          a.profile_id = ids.pid
          or (a.profile_id is null and private.normalize_email(a.email) = private.normalize_email(c.email))
        )
    ),
    exists (
      select 1 from public.applications a
      where a.retained_until is not null
        and a.profile_id is null
        and private.normalize_email(a.email) = private.normalize_email(c.email)
    )
  from unnest(profile_ids) as ids (pid)
  left join public.member_contacts c on c.profile_id = ids.pid
  where not exists (select 1 from public.profiles p where p.id = ids.pid and p.status = 'deleting');
end;
$function$;

REVOKE ALL ON FUNCTION "public"."pending_application_flags"(uuid[]) FROM PUBLIC, "anon";

GRANT EXECUTE ON FUNCTION "public"."pending_application_flags"(uuid[]) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."pending_application_flags"(uuid[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."pending_application_flags"(uuid[]) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."pending_application_flags"(uuid[]) TO "service_role";
