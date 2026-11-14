ALTER TABLE "public"."profiles"
  ADD COLUMN "status_before_deletion" public.member_status;

ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "profiles_deletion_state" CHECK ((((status = 'deleting'::public.member_status) = (deletion_requested_at IS
    NOT NULL)) AND ((status = 'deleting'::public.member_status) = (status_before_deletion IS
    NOT NULL)) AND (status_before_deletion IS DISTINCT FROM 'deleting'::public.member_status)));

COMMENT ON COLUMN "public"."applications"."retained_until" IS 'Set when the owner deletes their account: the application is kept (inactive members: 1 year from the deletion request) and purged after this time. Null = no deadline.';

COMMENT ON COLUMN "public"."profiles"."deletion_requested_at" IS 'When the member asked to delete the account; set only while status = deleting.';

COMMENT ON COLUMN "public"."profiles"."status" IS 'pending = signed in but not yet approved; active = club member; inactive = left or suspended; deleting = asked to delete the account (hidden, no rights, purged after 14 days).';

COMMENT ON COLUMN "public"."profiles"."status_before_deletion" IS 'The status to restore if the member cancels the deletion; set only while status = deleting.';

