CREATE TYPE "public"."backup_kind" AS ENUM('MANUEL', 'PLANIFIE');--> statement-breakpoint
CREATE TYPE "public"."backup_remote_status" AS ENUM('ENVOYE', 'ERREUR');--> statement-breakpoint
CREATE TYPE "public"."backup_status" AS ENUM('EN_COURS', 'OK', 'ERREUR');--> statement-breakpoint
CREATE TABLE "backups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filename" text NOT NULL,
	"kind" "backup_kind" NOT NULL,
	"status" "backup_status" DEFAULT 'EN_COURS' NOT NULL,
	"size_bytes" bigint,
	"error" text,
	"remote_status" "backup_remote_status",
	"remote_error" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "backups" ADD CONSTRAINT "backups_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "backups_filename_unique" ON "backups" USING btree ("filename");