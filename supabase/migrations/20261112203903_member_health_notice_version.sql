SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.set_my_blood_type (
  new_type       public.blood_type,
  notice_version text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  uid uuid := (select auth.uid());
begin
  if not private.is_active_member() then
    raise exception 'only active members can set a blood type' using errcode = '42501';
  end if;
  if new_type is null then
    raise exception 'blood type is required' using errcode = '23514';
  end if;
  if notice_version is null or btrim(notice_version) = '' or char_length(notice_version) > 40 then
    raise exception 'notice version is required (1-40 characters)' using errcode = '23514';
  end if;

  -- Locks an existing row; on a first call there is nothing to lock, and the `on conflict do update`
  -- below is what keeps concurrent first calls safe.
  perform 1 from public.member_health h where h.profile_id = uid for update;

  insert into public.member_health (profile_id, blood_type, consent_blood_type, consent_blood_type_at, consent_blood_type_version)
  values (uid, new_type, true, now(), notice_version)
  on conflict (profile_id) do update
    set blood_type = excluded.blood_type,
        consent_blood_type = true,
        consent_blood_type_at = excluded.consent_blood_type_at,
        consent_blood_type_version = excluded.consent_blood_type_version;

  perform private.log_safety_access('set_blood_type', uid);
end;
$function$;
