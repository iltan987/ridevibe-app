SET local check_function_bodies = off;

DROP TRIGGER "applications_after_approval" ON "public"."applications";

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
end;
$function$;

CREATE OR REPLACE FUNCTION private.applications_after_approval()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if new.profile_id is not null then
    perform private.activate_from_approved_application(new.profile_id);
  else
    perform private.activate_from_approved_application(c.profile_id)
    from public.member_contacts c
    where private.normalize_email(c.email) = private.normalize_email(new.email);
  end if;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION private.applications_before_insert()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if new.birth_date > ((now() at time zone 'Europe/Istanbul')::date - interval '18 years') then
    raise exception 'applicant must be at least 18 years old'
      using errcode = '23514', constraint = 'applications_min_age';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.applications_check_decision()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if current_user = 'authenticated'
    and (
      (new.status is distinct from old.status
        and (new.status in ('approved', 'rejected') or old.status in ('approved', 'rejected')))
      or (old.status = 'approved' and lower(trim(new.email)) is distinct from old.email)
    )
    and not private.has_permission('applications.decide')
  then
    raise exception 'missing permission applications.decide' using errcode = '42501';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.applications_normalize_contact()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  new.email = lower(trim(new.email));
  if (TG_OP = 'INSERT' or new.phone is distinct from old.phone)
    and new.phone like '+90%'
    and new.phone !~ '^\+905[0-9]{9}$'
  then
    raise exception 'a Turkish phone number must be a mobile number (+905…)'
      using errcode = '23514', constraint = 'applications_tr_mobile';
  end if;
  return new;
end;
$function$;

CREATE UNIQUE INDEX applications_open_profile_key ON public.applications USING btree (profile_id)
  WHERE ((status = ANY (ARRAY['new'::public.application_status, 'contacted'::public.application_status])) AND (profile_id IS NOT NULL));

CREATE TRIGGER applications_after_approval
  AFTER UPDATE OF status, email ON public.applications
  FOR EACH ROW
  WHEN (((new.status = 'approved'::public.application_status) AND ((old.status IS DISTINCT FROM new.status) OR (old.email IS DISTINCT FROM new.email))))
  EXECUTE FUNCTION private.applications_after_approval();

CREATE TRIGGER applications_normalize_contact
  BEFORE INSERT OR UPDATE OF phone, email ON public.applications
  FOR EACH ROW
  EXECUTE FUNCTION private.applications_normalize_contact();

ALTER POLICY "applications: anyone can submit a new application" ON "public"."applications" TO "anon";

CREATE POLICY "applications: signed-in users can submit for their own account" ON "public"."applications"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((status = 'new'::public.application_status) AND ((profile_id IS NULL) OR (profile_id = ( SELECT auth.uid() AS uid)))));

COMMENT ON COLUMN "public"."applications"."profile_id" IS 'The account this application belongs to: set when submitted while signed in, when staff link it, or when an approved application is matched by email.';

REVOKE ALL ON FUNCTION "private"."applications_normalize_contact"() FROM PUBLIC;

REVOKE ALL ("email") ON TABLE "public"."applications" FROM "authenticated";

GRANT INSERT ("email"), UPDATE ("email") ON TABLE "public"."applications" TO "authenticated";

REVOKE ALL ("full_name") ON TABLE "public"."applications" FROM "authenticated";

GRANT INSERT ("full_name"), UPDATE ("full_name") ON TABLE "public"."applications" TO "authenticated";

REVOKE ALL ("phone") ON TABLE "public"."applications" FROM "authenticated";

GRANT INSERT ("phone"), UPDATE ("phone") ON TABLE "public"."applications" TO "authenticated";

REVOKE ALL ("profile_id") ON TABLE "public"."applications" FROM "authenticated";

GRANT INSERT ("profile_id") ON TABLE "public"."applications" TO "authenticated";
