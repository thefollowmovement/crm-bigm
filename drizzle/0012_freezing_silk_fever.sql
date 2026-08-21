CREATE TYPE "public"."expense_category" AS ENUM('LOYER', 'SALAIRES', 'CHARGES_SOCIALES', 'FOURNISSEURS', 'ENERGIE', 'MAINTENANCE', 'BANQUE', 'IMPOTS', 'AUTRE');--> statement-breakpoint
CREATE TABLE "store_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"expense_date" date NOT NULL,
	"category" "expense_category" NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"label" text,
	"entered_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "store_expenses" ADD CONSTRAINT "store_expenses_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_expenses" ADD CONSTRAINT "store_expenses_entered_by_id_users_id_fk" FOREIGN KEY ("entered_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "store_expenses_store_date_idx" ON "store_expenses" USING btree ("store_id","expense_date");--> statement-breakpoint
CREATE INDEX "store_expenses_category_idx" ON "store_expenses" USING btree ("category");