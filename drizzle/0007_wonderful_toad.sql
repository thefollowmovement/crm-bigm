CREATE TYPE "public"."training_doc_kind" AS ENUM('REMIS', 'SIGNE');--> statement-breakpoint
CREATE TYPE "public"."training_status" AS ENUM('PLANIFIEE', 'REALISEE', 'VALIDEE', 'ANNULEE');--> statement-breakpoint
CREATE TYPE "public"."training_type" AS ENUM('INITIALE', 'CONTINUE', 'OUVERTURE', 'NOUVEAU_PRODUIT', 'HYGIENE', 'AUTRE');--> statement-breakpoint
ALTER TYPE "public"."attachment_entity" ADD VALUE 'TRAINING';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'FORMATION';--> statement-breakpoint
CREATE TABLE "training_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"training_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"kind" "training_doc_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"training_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trainings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"franchisee_id" uuid,
	"trainer_id" uuid NOT NULL,
	"type" "training_type" NOT NULL,
	"status" "training_status" DEFAULT 'PLANIFIEE' NOT NULL,
	"training_date" date NOT NULL,
	"report" text,
	"notes" text,
	"validated_by_id" uuid,
	"validated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "training_documents" ADD CONSTRAINT "training_documents_training_id_trainings_id_fk" FOREIGN KEY ("training_id") REFERENCES "public"."trainings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_documents" ADD CONSTRAINT "training_documents_file_id_file_attachments_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file_attachments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_participants" ADD CONSTRAINT "training_participants_training_id_trainings_id_fk" FOREIGN KEY ("training_id") REFERENCES "public"."trainings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainings" ADD CONSTRAINT "trainings_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainings" ADD CONSTRAINT "trainings_franchisee_id_franchisees_id_fk" FOREIGN KEY ("franchisee_id") REFERENCES "public"."franchisees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainings" ADD CONSTRAINT "trainings_trainer_id_users_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainings" ADD CONSTRAINT "trainings_validated_by_id_users_id_fk" FOREIGN KEY ("validated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "training_documents_file_unique" ON "training_documents" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "training_documents_training_idx" ON "training_documents" USING btree ("training_id");--> statement-breakpoint
CREATE INDEX "training_participants_training_idx" ON "training_participants" USING btree ("training_id");--> statement-breakpoint
CREATE INDEX "trainings_store_date_idx" ON "trainings" USING btree ("store_id","training_date");--> statement-breakpoint
CREATE INDEX "trainings_trainer_idx" ON "trainings" USING btree ("trainer_id");--> statement-breakpoint
CREATE INDEX "trainings_franchisee_idx" ON "trainings" USING btree ("franchisee_id");