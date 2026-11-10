SET local check_function_bodies = off;

CREATE TABLE "public"."member_motorcycles" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "profile_id" uuid                     NOT NULL,
  "brand"      text                     NOT NULL,
  "model"      text                     NOT NULL,
  "cc"         smallint,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "member_motorcycles_brand_check" CHECK (((char_length(btrim(brand)) >= 1) AND (char_length(btrim(brand)) <= 60))),
  CONSTRAINT "member_motorcycles_cc_check" CHECK (((cc >= 50) AND (cc <= 3000))),
  CONSTRAINT "member_motorcycles_model_check" CHECK (((char_length(btrim(model)) >= 1) AND (char_length(btrim(model)) <= 60))),
  CONSTRAINT "member_motorcycles_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."member_motorcycles"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."member_motorcycles" FROM "anon";

CREATE OR REPLACE FUNCTION private.member_motorcycles_limit()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  perform 1 from public.profiles where id = new.profile_id for update;
  if (select count(*) from public.member_motorcycles where profile_id = new.profile_id) >= 10 then
    raise exception 'member_motorcycles_limit: at most 10 motorcycles per member'
      using errcode = '23514', constraint = 'member_motorcycles_limit';
  end if;
  return new;
end;
$function$;

ALTER TABLE "public"."member_motorcycles"
  ADD CONSTRAINT "member_motorcycles_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE INDEX member_motorcycles_profile_idx ON public.member_motorcycles USING btree (profile_id, created_at, id);

CREATE TRIGGER member_motorcycles_limit
  BEFORE INSERT ON public.member_motorcycles
  FOR EACH ROW
  EXECUTE FUNCTION private.member_motorcycles_limit();

CREATE TRIGGER member_motorcycles_set_updated_at
  BEFORE UPDATE ON public.member_motorcycles
  FOR EACH ROW
  EXECUTE FUNCTION private.set_updated_at();

CREATE POLICY "member_motorcycles: delete own while active" ON "public"."member_motorcycles"
  FOR DELETE
  TO "authenticated"
  USING (((profile_id = ( SELECT auth.uid() AS uid)) AND ( SELECT private.is_active_member() AS is_active_member)));

CREATE POLICY "member_motorcycles: insert own while active" ON "public"."member_motorcycles"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((profile_id = ( SELECT auth.uid() AS uid)) AND ( SELECT private.is_active_member() AS is_active_member)));

CREATE POLICY "member_motorcycles: read own or with members.manage" ON "public"."member_motorcycles"
  FOR SELECT
  TO "authenticated"
  USING (((profile_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.has_permission('members.manage'::public.permission) AS has_permission)));

CREATE POLICY "member_motorcycles: update own while active" ON "public"."member_motorcycles"
  FOR UPDATE
  TO "authenticated"
  USING (((profile_id = ( SELECT auth.uid() AS uid)) AND ( SELECT private.is_active_member() AS is_active_member)))
  WITH CHECK (((profile_id = ( SELECT auth.uid() AS uid)) AND ( SELECT private.is_active_member() AS is_active_member)));

COMMENT ON TABLE "public"."member_motorcycles" IS 'Motorcycles a member lists on their profile (at most 10 per member).';

REVOKE ALL ON FUNCTION "private"."member_motorcycles_limit"() FROM PUBLIC;

REVOKE ALL ON TABLE "public"."member_motorcycles" FROM "authenticated";

REVOKE ALL ("brand") ON TABLE "public"."member_motorcycles" FROM "authenticated";

GRANT INSERT ("brand"), UPDATE ("brand") ON TABLE "public"."member_motorcycles" TO "authenticated";

REVOKE ALL ("cc") ON TABLE "public"."member_motorcycles" FROM "authenticated";

GRANT INSERT ("cc"), UPDATE ("cc") ON TABLE "public"."member_motorcycles" TO "authenticated";

REVOKE ALL ("model") ON TABLE "public"."member_motorcycles" FROM "authenticated";

GRANT INSERT ("model"), UPDATE ("model") ON TABLE "public"."member_motorcycles" TO "authenticated";

REVOKE ALL ("profile_id") ON TABLE "public"."member_motorcycles" FROM "authenticated";

GRANT INSERT ("profile_id") ON TABLE "public"."member_motorcycles" TO "authenticated";

GRANT DELETE, SELECT ON TABLE "public"."member_motorcycles" TO "authenticated";

REVOKE ALL ON TABLE "public"."member_motorcycles" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."member_motorcycles" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."member_motorcycles" TO "service_role";
