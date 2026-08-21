CREATE TYPE "public"."action_plan_status" AS ENUM('A_FAIRE', 'EN_COURS', 'TERMINE', 'VALIDE', 'ANNULE');--> statement-breakpoint
CREATE TYPE "public"."visit_status" AS ENUM('BROUILLON', 'FINALISEE');--> statement-breakpoint
CREATE TYPE "public"."visit_type" AS ENUM('AUDIT', 'VISITE_COURTOISIE', 'OUVERTURE', 'FORMATION', 'NOUVEAU_PRODUIT', 'INTERVENTION');--> statement-breakpoint
ALTER TYPE "public"."attachment_entity" ADD VALUE 'STORE_VISIT';--> statement-breakpoint
ALTER TYPE "public"."attachment_entity" ADD VALUE 'ACTION_PLAN';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'VISITE';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'PLAN_ACTION';--> statement-breakpoint
CREATE TABLE "action_plan_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "action_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "action_plans_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"store_id" uuid NOT NULL,
	"visit_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"priority" "ticket_priority" DEFAULT 'NORMALE' NOT NULL,
	"assignee_id" uuid,
	"created_by_id" uuid NOT NULL,
	"due_date" date,
	"status" "action_plan_status" DEFAULT 'A_FAIRE' NOT NULL,
	"completed_at" timestamp with time zone,
	"validated_at" timestamp with time zone,
	"reminder_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_criteria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"category" text,
	"max_score" integer DEFAULT 10 NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visit_id" uuid NOT NULL,
	"criterion_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"is_compliant" boolean DEFAULT true NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"type" "visit_type" NOT NULL,
	"status" "visit_status" DEFAULT 'BROUILLON' NOT NULL,
	"visit_date" date NOT NULL,
	"visited_by_id" uuid NOT NULL,
	"report" text,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "action_plan_comments" ADD CONSTRAINT "action_plan_comments_plan_id_action_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."action_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_plan_comments" ADD CONSTRAINT "action_plan_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_plans" ADD CONSTRAINT "action_plans_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_plans" ADD CONSTRAINT "action_plans_visit_id_store_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."store_visits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_plans" ADD CONSTRAINT "action_plans_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_plans" ADD CONSTRAINT "action_plans_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_items" ADD CONSTRAINT "audit_items_visit_id_store_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."store_visits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_items" ADD CONSTRAINT "audit_items_criterion_id_audit_criteria_id_fk" FOREIGN KEY ("criterion_id") REFERENCES "public"."audit_criteria"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_visits" ADD CONSTRAINT "store_visits_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_visits" ADD CONSTRAINT "store_visits_visited_by_id_users_id_fk" FOREIGN KEY ("visited_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "action_plan_comments_plan_idx" ON "action_plan_comments" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "action_plans_number_unique" ON "action_plans" USING btree ("number");--> statement-breakpoint
CREATE INDEX "action_plans_store_status_idx" ON "action_plans" USING btree ("store_id","status");--> statement-breakpoint
CREATE INDEX "action_plans_assignee_status_idx" ON "action_plans" USING btree ("assignee_id","status");--> statement-breakpoint
CREATE INDEX "action_plans_due_status_idx" ON "action_plans" USING btree ("due_date","status");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_items_visit_criterion_unique" ON "audit_items" USING btree ("visit_id","criterion_id");--> statement-breakpoint
CREATE INDEX "store_visits_store_date_idx" ON "store_visits" USING btree ("store_id","visit_date");--> statement-breakpoint
CREATE INDEX "store_visits_visitor_idx" ON "store_visits" USING btree ("visited_by_id","visit_date");--> statement-breakpoint
CREATE INDEX "store_visits_type_date_idx" ON "store_visits" USING btree ("type","visit_date");