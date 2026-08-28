CREATE TYPE "public"."expense_claim_status" AS ENUM('DEMANDE', 'VALIDEE', 'REFUSEE', 'REMBOURSEE');--> statement-breakpoint
ALTER TYPE "public"."attachment_entity" ADD VALUE 'EXPENSE_CLAIM';--> statement-breakpoint
CREATE TABLE "expense_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visit_id" uuid NOT NULL,
	"title" text NOT NULL,
	"amount_ttc" numeric(12, 2) NOT NULL,
	"note" text,
	"status" "expense_claim_status" DEFAULT 'DEMANDE' NOT NULL,
	"created_by_id" uuid NOT NULL,
	"decided_by_id" uuid,
	"decided_at" timestamp with time zone,
	"processed_by_id" uuid,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "file_attachments" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_visit_id_store_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."store_visits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_decided_by_id_users_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_processed_by_id_users_id_fk" FOREIGN KEY ("processed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expense_claims_visit_idx" ON "expense_claims" USING btree ("visit_id");--> statement-breakpoint
CREATE INDEX "expense_claims_status_idx" ON "expense_claims" USING btree ("status","created_at");