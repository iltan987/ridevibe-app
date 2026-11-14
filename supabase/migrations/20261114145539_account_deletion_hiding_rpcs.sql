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
  where a.id = application_account.application_id
    and p.status <> 'deleting';
end;
$function$;

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
  left join public.member_contacts c on c.profile_id = ids.pid
  where not exists (select 1 from public.profiles p where p.id = ids.pid and p.status = 'deleting');
end;
$function$;
