SET local check_function_bodies = off;

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
    and a.profile_id = target_profile
  order by a.reviewed_at desc nulls last, a.created_at desc
  limit 1;
  if not found then
    select a.id, a.full_name, a.city, a.district, a.side, a.profile_id into app
    from public.applications a
    join public.member_contacts c on c.profile_id = target_profile
    where a.status = 'approved'
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

CREATE OR REPLACE FUNCTION private.fill_member_from_application (
  target_profile uuid,
  application_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  app record;
begin
  select a.birth_date, a.instagram, a.consent_photos, a.created_at, a.privacy_notice_version,
         a.owns_motorcycle, btrim(a.motorcycle_brand) as brand, btrim(a.motorcycle_model) as model,
         a.motorcycle_cc
    into app
  from public.applications a
  where a.id = application_id;
  if not found then
    return;
  end if;

  insert into public.member_details (profile_id) values (target_profile)
  on conflict (profile_id) do nothing;

  update public.member_details d
  set birth_date = coalesce(d.birth_date, app.birth_date),
      instagram = coalesce(d.instagram, app.instagram)
  where d.profile_id = target_profile;

  -- consent_photos_at is set explicitly so the stamp trigger keeps it.
  update public.member_details d
  set consent_photos = app.consent_photos,
      consent_photos_at = app.created_at,
      consent_photos_version = app.privacy_notice_version
  where d.profile_id = target_profile and d.consent_photos_at is null;

  if app.owns_motorcycle
    and coalesce(app.brand, '') <> ''
    and coalesce(app.model, '') <> ''
    and not exists (select 1 from public.member_motorcycles m where m.profile_id = target_profile)
  then
    insert into public.member_motorcycles (profile_id, brand, model, cc)
    values (target_profile, app.brand, app.model, app.motorcycle_cc);
  end if;
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
    )
    or exists (
      select 1
      from public.applications a
      join public.member_contacts c on c.profile_id = target_id
      where a.id <> application_id
        and a.profile_id is null
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

REVOKE ALL ON FUNCTION "private"."fill_member_from_application"(uuid, uuid) FROM PUBLIC;
