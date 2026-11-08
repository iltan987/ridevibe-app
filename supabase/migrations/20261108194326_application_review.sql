SET local check_function_bodies = off;

CREATE TABLE "public"."member_contacts" (
  "profile_id" uuid                     NOT NULL,
  "email"      text,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "member_contacts_email_check" CHECK ((char_length(email) <= 320)),
  CONSTRAINT "member_contacts_pkey" PRIMARY KEY (profile_id)
);

ALTER TABLE "public"."member_contacts"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."member_contacts" FROM "anon";

ALTER TABLE "public"."applications"
  ADD COLUMN "profile_id" uuid;

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
  select a.id, a.city, a.district, a.side into app
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

  update public.profiles p
  set status = 'active',
      city = case when p.district is null then app.city else p.city end,
      side = case when p.district is null then app.side else p.side end,
      district = coalesce(p.district, app.district)
  where p.id = target_profile and p.status = 'pending';
  if not found then
    return;
  end if;

  update public.applications set profile_id = target_profile where id = app.id;
end;
$function$;

CREATE OR REPLACE FUNCTION private.applications_after_approval()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  perform private.activate_from_approved_application(c.profile_id)
  from public.member_contacts c
  where private.normalize_email(c.email) = private.normalize_email(new.email);
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION private.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 120),
    -- Drop (don't truncate) an over-long picture URL: a failing CHECK here
    -- would abort the whole sign-up.
    case when char_length(new.raw_user_meta_data ->> 'avatar_url') <= 2048
      then new.raw_user_meta_data ->> 'avatar_url' end
  );
  insert into public.member_contacts (profile_id, email) values (new.id, new.email);
  perform private.activate_from_approved_application(new.id);
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.handle_user_email_change()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  update public.member_contacts set email = new.email, updated_at = now() where profile_id = new.id;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.normalize_email (
  email text
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select case
    when split_part(e, '@', 2) in ('gmail.com', 'googlemail.com')
      then replace(split_part(split_part(e, '@', 1), '+', 1), '.', '') || '@gmail.com'
    else e
  end
  from (select lower(trim(email)) as e) as t;
$function$;

ALTER TABLE "public"."applications"
  ADD CONSTRAINT "applications_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE "public"."member_contacts"
  ADD CONSTRAINT "member_contacts_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE INDEX applications_profile_id_idx ON public.applications USING btree (profile_id);

CREATE TRIGGER on_auth_user_email_changed
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (((old.email)::text IS DISTINCT FROM (new.email)::text))
  EXECUTE FUNCTION private.handle_user_email_change();

CREATE TRIGGER applications_after_approval
  AFTER UPDATE OF status ON public.applications
  FOR EACH ROW
  WHEN (((new.status = 'approved'::public.application_status) AND (old.status IS DISTINCT FROM new.status)))
  EXECUTE FUNCTION private.applications_after_approval();

CREATE POLICY "member_contacts: read own or with members.manage" ON "public"."member_contacts"
  FOR SELECT
  TO "authenticated"
  USING (((profile_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.has_permission('members.manage'::public.permission) AS has_permission)));

COMMENT ON TABLE "public"."member_contacts" IS 'Private contact data per member (sign-in email). Synced from auth.users.';

REVOKE ALL ON FUNCTION "private"."activate_from_approved_application"(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."applications_after_approval"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."handle_user_email_change"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."normalize_email"(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."normalize_email"(text) TO "authenticated";

REVOKE ALL ON TABLE "public"."member_contacts" FROM "authenticated";

GRANT SELECT ON TABLE "public"."member_contacts" TO "authenticated";

REVOKE ALL ON TABLE "public"."member_contacts" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."member_contacts" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."member_contacts" TO "service_role";


CREATE INDEX member_contacts_normalized_email_idx ON public.member_contacts USING btree (private.normalize_email(email));

-- ---------------------------------------------------------------------------
-- Data migration (hand-written; declarative schemas don't track data).
-- ---------------------------------------------------------------------------

-- Sign-in emails of accounts that existed before member_contacts.
INSERT INTO public.member_contacts (profile_id, email)
SELECT u.id, u.email FROM auth.users u JOIN public.profiles p ON p.id = u.id
ON CONFLICT (profile_id) DO NOTHING;

-- Default staff roles (docs/PLAN.md "Intended staff roles"); admins can rename
-- or change them at /admin/roles. Skipped if a role with the name exists.
INSERT INTO public.roles (name) VALUES ('Başvuru Sorumlusu'), ('Üye Sorumlusu')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission)
SELECT r.id, p.permission
FROM public.roles r
JOIN (VALUES
  ('Başvuru Sorumlusu', 'applications.view'::public.permission),
  ('Başvuru Sorumlusu', 'applications.review'::public.permission),
  ('Başvuru Sorumlusu', 'applications.decide'::public.permission),
  ('Üye Sorumlusu', 'members.manage'::public.permission)
) AS p(role_name, permission) ON p.role_name = r.name
ON CONFLICT DO NOTHING;
