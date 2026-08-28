ALTER TABLE "invoices" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payments" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reminders" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "revenue_entries" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "invoices" CASCADE;--> statement-breakpoint
DROP TABLE "payments" CASCADE;--> statement-breakpoint
DROP TABLE "reminders" CASCADE;--> statement-breakpoint
DROP TABLE "revenue_entries" CASCADE;--> statement-breakpoint
-- La contrainte est déjà tombée avec DROP TABLE "invoices" CASCADE.
ALTER TABLE "company_flows" DROP CONSTRAINT IF EXISTS "company_flows_invoice_id_invoices_id_fk";
--> statement-breakpoint
ALTER TABLE "acct_invoices" ADD COLUMN "last_reminder_level" integer;--> statement-breakpoint
ALTER TABLE "acct_invoices" ADD COLUMN "last_reminder_at" timestamp with time zone;--> statement-breakpoint
-- Les anciens rapprochements pointaient vers "invoices" (supprimée) :
-- on les vide avant de poser la FK vers le journal comptable.
UPDATE "company_flows" SET "invoice_id" = NULL;--> statement-breakpoint
ALTER TABLE "company_flows" ADD CONSTRAINT "company_flows_invoice_id_acct_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."acct_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
DROP TYPE "public"."invoice_status";--> statement-breakpoint
DROP TYPE "public"."invoice_type";--> statement-breakpoint
DROP TYPE "public"."payment_method";--> statement-breakpoint
DROP TYPE "public"."reminder_channel";--> statement-breakpoint
DROP TYPE "public"."revenue_channel";