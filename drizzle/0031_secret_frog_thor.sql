ALTER TYPE "public"."role" ADD VALUE 'PRESTATAIRE';--> statement-breakpoint
CREATE TABLE "acct_invoice_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "acct_structure_id" uuid;--> statement-breakpoint
ALTER TABLE "acct_invoice_messages" ADD CONSTRAINT "acct_invoice_messages_invoice_id_acct_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."acct_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acct_invoice_messages" ADD CONSTRAINT "acct_invoice_messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "acct_invoice_messages_invoice_idx" ON "acct_invoice_messages" USING btree ("invoice_id","created_at");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_acct_structure_id_acct_structures_id_fk" FOREIGN KEY ("acct_structure_id") REFERENCES "public"."acct_structures"("id") ON DELETE no action ON UPDATE no action;