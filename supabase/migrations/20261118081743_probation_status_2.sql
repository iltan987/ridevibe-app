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
  set status = 'probation',
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

CREATE OR REPLACE FUNCTION private.profiles_stamp_status_change()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if old.status is distinct from new.status and old.status <> 'deleting' and new.status <> 'deleting' then
    new.status_changed_at = now();
  end if;
  return new;
end;
$function$;

