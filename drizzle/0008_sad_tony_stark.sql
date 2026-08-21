CREATE TYPE "public"."comm_task_type" AS ENUM('DEMANDE', 'CREATION', 'CAMPAGNE', 'VIDEO', 'RESEAUX_SOCIAUX', 'ADS', 'AUTRE');--> statement-breakpoint
ALTER TYPE "public"."attachment_entity" ADD VALUE 'COMM_TASK';--> statement-breakpoint
ALTER TYPE "public"."attachment_entity" ADD VALUE 'PARTNER';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'COMMUNICATION';--> statement-breakpoint
CREATE TABLE "comm_task_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comm_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "comm_tasks_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"type" "comm_task_type" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"store_id" uuid,
	"partner_id" uuid,
	"requester_id" uuid NOT NULL,
	"assignee_id" uuid,
	"priority" "ticket_priority" DEFAULT 'NORMALE' NOT NULL,
	"status" "ticket_status" DEFAULT 'NOUVEAU' NOT NULL,
	"due_date" date,
	"publication_date" date,
	"completed_at" timestamp with time zone,
	"validated_at" timestamp with time zone,
	"reminder_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"store_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_name" text NOT NULL,
	"contact_name" text,
	"phone" text,
	"email" text,
	"domain" text,
	"tariff_notes" text,
	"scope_notes" text,
	"internal_notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comm_task_comments" ADD CONSTRAINT "comm_task_comments_task_id_comm_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."comm_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_task_comments" ADD CONSTRAINT "comm_task_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_tasks" ADD CONSTRAINT "comm_tasks_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_tasks" ADD CONSTRAINT "comm_tasks_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_tasks" ADD CONSTRAINT "comm_tasks_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_tasks" ADD CONSTRAINT "comm_tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_stores" ADD CONSTRAINT "partner_stores_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_stores" ADD CONSTRAINT "partner_stores_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comm_task_comments_task_idx" ON "comm_task_comments" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "comm_tasks_number_unique" ON "comm_tasks" USING btree ("number");--> statement-breakpoint
CREATE INDEX "comm_tasks_assignee_status_idx" ON "comm_tasks" USING btree ("assignee_id","status");--> statement-breakpoint
CREATE INDEX "comm_tasks_status_due_idx" ON "comm_tasks" USING btree ("status","due_date");--> statement-breakpoint
CREATE INDEX "comm_tasks_publication_idx" ON "comm_tasks" USING btree ("publication_date");--> statement-breakpoint
CREATE INDEX "comm_tasks_requester_idx" ON "comm_tasks" USING btree ("requester_id");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_stores_unique" ON "partner_stores" USING btree ("partner_id","store_id");