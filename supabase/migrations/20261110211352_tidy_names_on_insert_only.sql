DROP TRIGGER "applications_tidy_name" ON "public"."applications";

DROP TRIGGER "profiles_tidy_name" ON "public"."profiles";

CREATE TRIGGER applications_tidy_name
  BEFORE INSERT ON public.applications
  FOR EACH ROW
  EXECUTE FUNCTION private.applications_tidy_name();

CREATE TRIGGER profiles_tidy_name
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION private.profiles_tidy_name();
