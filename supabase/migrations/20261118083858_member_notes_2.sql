SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.can_access_member_notes (
  target uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select (select private.has_permission('members.notes'))
    and target is distinct from (select auth.uid())
    and exists (
      select 1
      from public.profiles p
      where p.id = target
        and p.status <> 'deleting'
        and (
          (select private.is_admin())
          or not exists (select 1 from public.roles r where r.id = p.role_id and r.is_admin)
        )
    );
$function$;

CREATE OR REPLACE FUNCTION private.member_notes_set_author()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  new.author_id := (select auth.uid());
  return new;
end;
$function$;

ALTER TABLE "public"."member_notes"
  ADD CONSTRAINT "member_notes_author_id_fkey" FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE "public"."member_notes"
  ADD CONSTRAINT "member_notes_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE INDEX member_notes_profile_idx ON public.member_notes USING btree (profile_id, created_at DESC, id DESC);

CREATE TRIGGER member_notes_set_author
  BEFORE INSERT ON public.member_notes
  FOR EACH ROW
  EXECUTE FUNCTION private.member_notes_set_author();

CREATE POLICY "member_notes: admins delete" ON "public"."member_notes"
  FOR DELETE
  TO "authenticated"
  USING ((( SELECT private.is_admin() AS is_admin) AND ( SELECT private.can_access_member_notes(member_notes.profile_id) AS can_access_member_notes)));

CREATE POLICY "member_notes: insert" ON "public"."member_notes"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (( SELECT private.can_access_member_notes(member_notes.profile_id) AS can_access_member_notes));

CREATE POLICY "member_notes: read" ON "public"."member_notes"
  FOR SELECT
  TO "authenticated"
  USING (( SELECT private.can_access_member_notes(member_notes.profile_id) AS can_access_member_notes));

COMMENT ON TABLE "public"."member_notes" IS 'Staff notes about a member (members.notes). Append-only; admins may delete.';

REVOKE ALL ON FUNCTION "private"."can_access_member_notes"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."can_access_member_notes"(uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."member_notes_set_author"() FROM PUBLIC;

REVOKE ALL ON TABLE "public"."member_notes" FROM "authenticated";

REVOKE ALL ("body") ON TABLE "public"."member_notes" FROM "authenticated";

GRANT INSERT ("body") ON TABLE "public"."member_notes" TO "authenticated";

REVOKE ALL ("profile_id") ON TABLE "public"."member_notes" FROM "authenticated";

GRANT INSERT ("profile_id") ON TABLE "public"."member_notes" TO "authenticated";

GRANT DELETE, SELECT ON TABLE "public"."member_notes" TO "authenticated";

REVOKE ALL ON TABLE "public"."member_notes" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."member_notes" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."member_notes" TO "service_role";

