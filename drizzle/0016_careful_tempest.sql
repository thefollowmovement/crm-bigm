ALTER TYPE "public"."attachment_entity" ADD VALUE 'STORE_PHOTO';--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "latitude" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "longitude" numeric(9, 6);