CREATE TYPE "public"."clock_entry_type" AS ENUM('TRAVAIL', 'PAUSE');--> statement-breakpoint
CREATE TYPE "public"."employee_contract_type" AS ENUM('CDI', 'CDD', 'APPRENTISSAGE', 'STAGE', 'EXTRA');--> statement-breakpoint
CREATE TYPE "public"."leave_status" AS ENUM('DEMANDEE', 'VALIDEE', 'REFUSEE', 'ANNULEE');--> statement-breakpoint
CREATE TYPE "public"."leave_type" AS ENUM('CONGES_PAYES', 'SANS_SOLDE', 'MALADIE', 'FAMILIAL', 'AUTRE');--> statement-breakpoint
ALTER TYPE "public"."attachment_entity" ADD VALUE 'EMPLOYEE';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'RH';--> statement-breakpoint
ALTER TYPE "public"."role" ADD VALUE 'SALARIE';--> statement-breakpoint
CREATE TABLE "clock_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"type" "clock_entry_type" NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"store_id" uuid,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"position" text NOT NULL,
	"email" text,
	"phone" text,
	"contract_type" "employee_contract_type" NOT NULL,
	"hire_date" date NOT NULL,
	"end_date" date,
	"salary_monthly" numeric(12, 2),
	"hr_notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"type" "leave_type" NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"comment" text,
	"status" "leave_status" DEFAULT 'DEMANDEE' NOT NULL,
	"decided_by_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clock_entries" ADD CONSTRAINT "clock_entries_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_decided_by_id_users_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clock_entries_one_open_unique" ON "clock_entries" USING btree ("employee_id") WHERE ended_at is null;--> statement-breakpoint
CREATE INDEX "clock_entries_employee_started_idx" ON "clock_entries" USING btree ("employee_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_user_unique" ON "employees" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "employees_store_idx" ON "employees" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "leave_requests_employee_start_idx" ON "leave_requests" USING btree ("employee_id","start_date");--> statement-breakpoint
CREATE INDEX "leave_requests_status_idx" ON "leave_requests" USING btree ("status");