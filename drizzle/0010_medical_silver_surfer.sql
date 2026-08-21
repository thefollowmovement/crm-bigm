CREATE TYPE "public"."checklist_status" AS ENUM('A_FAIRE', 'EN_ATTENTE', 'BLOQUE', 'TERMINE');--> statement-breakpoint
CREATE TYPE "public"."opening_project_status" AS ENUM('EN_COURS', 'TERMINE', 'ABANDONNE');--> statement-breakpoint
CREATE TYPE "public"."opening_step_status" AS ENUM('A_VENIR', 'EN_COURS', 'TERMINEE', 'BLOQUEE');--> statement-breakpoint
CREATE TYPE "public"."opening_step_type" AS ENUM('DIP', 'CONTRAT', 'TRAVAUX', 'FORMATION', 'COMMANDES', 'INSTALLATION', 'OUVERTURE', 'SUIVI_J30');--> statement-breakpoint
ALTER TYPE "public"."attachment_entity" ADD VALUE 'OPENING_STEP';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'OUVERTURE';--> statement-breakpoint
CREATE TABLE "opening_checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"label" text NOT NULL,
	"pole" "pole" NOT NULL,
	"assignee_id" uuid,
	"due_date" date,
	"status" "checklist_status" DEFAULT 'A_FAIRE' NOT NULL,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opening_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"status" "opening_project_status" DEFAULT 'EN_COURS' NOT NULL,
	"target_opening_date" date,
	"created_by_id" uuid NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opening_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"step" "opening_step_type" NOT NULL,
	"status" "opening_step_status" DEFAULT 'A_VENIR' NOT NULL,
	"planned_date" date,
	"done_date" date,
	"notes" text,
	"late_alert_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "opening_checklist_items" ADD CONSTRAINT "opening_checklist_items_project_id_opening_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."opening_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opening_checklist_items" ADD CONSTRAINT "opening_checklist_items_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opening_projects" ADD CONSTRAINT "opening_projects_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opening_projects" ADD CONSTRAINT "opening_projects_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opening_steps" ADD CONSTRAINT "opening_steps_project_id_opening_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."opening_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "opening_checklist_project_idx" ON "opening_checklist_items" USING btree ("project_id","pole");--> statement-breakpoint
CREATE UNIQUE INDEX "opening_projects_store_unique" ON "opening_projects" USING btree ("store_id");--> statement-breakpoint
CREATE UNIQUE INDEX "opening_steps_project_step_unique" ON "opening_steps" USING btree ("project_id","step");--> statement-breakpoint
CREATE INDEX "opening_steps_status_planned_idx" ON "opening_steps" USING btree ("status","planned_date");