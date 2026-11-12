ALTER TABLE "public"."member_details"
  ADD COLUMN "show_plates" boolean NOT NULL DEFAULT true;

ALTER TABLE "public"."member_motorcycles"
  ADD COLUMN "plate" text;

ALTER TABLE "public"."member_motorcycles"
  ADD COLUMN "plate_foreign" boolean NOT NULL DEFAULT false;

ALTER TABLE "public"."member_motorcycles"
  ADD CONSTRAINT "member_motorcycles_plate"
    CHECK
    (((plate IS NULL) OR ((NOT plate_foreign) AND (plate ~ '^(0[1-9]|[1-7][0-9]|8[01]) [A-Z]{1,3} [0-9]{2,4}$'::text)) OR (plate_foreign AND (plate ~
    '^[A-Z0-9][A-Z0-9 -]{0,13}[A-Z0-9]$'::text))));

COMMENT ON COLUMN "public"."member_motorcycles"."plate" IS 'Licence plate, optional; shown in the directory only when member_details.show_plates is on.';

REVOKE ALL ("show_plates") ON TABLE "public"."member_details" FROM "authenticated";

GRANT UPDATE ("show_plates") ON TABLE "public"."member_details" TO "authenticated";

REVOKE ALL ("plate_foreign") ON TABLE "public"."member_motorcycles" FROM "authenticated";

GRANT INSERT ("plate_foreign"), UPDATE ("plate_foreign") ON TABLE "public"."member_motorcycles" TO "authenticated";

REVOKE ALL ("plate") ON TABLE "public"."member_motorcycles" FROM "authenticated";

GRANT INSERT ("plate"), UPDATE ("plate") ON TABLE "public"."member_motorcycles" TO "authenticated";
