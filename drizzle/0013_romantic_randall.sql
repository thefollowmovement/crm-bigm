CREATE TYPE "public"."company_flow_category" AS ENUM('DROIT_ENTREE', 'REDEVANCE', 'REDEVANCE_COMMUNICATION', 'PRESTATION', 'AUTRE_ENTREE', 'PARTENAIRES', 'COMMUNICATION', 'SALAIRES', 'LOGICIELS', 'PRESTATAIRES', 'FRAIS_GENERAUX', 'AUTRE_SORTIE');--> statement-breakpoint
CREATE TABLE "company_budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"category" "company_flow_category" NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_flows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flow_date" date NOT NULL,
	"category" "company_flow_category" NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"label" text,
	"invoice_id" uuid,
	"partner_id" uuid,
	"entered_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_flows" ADD CONSTRAINT "company_flows_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_flows" ADD CONSTRAINT "company_flows_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_flows" ADD CONSTRAINT "company_flows_entered_by_id_users_id_fk" FOREIGN KEY ("entered_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_budgets_unique" ON "company_budgets" USING btree ("year","month","category");--> statement-breakpoint
CREATE INDEX "company_flows_date_idx" ON "company_flows" USING btree ("flow_date");--> statement-breakpoint
CREATE INDEX "company_flows_category_date_idx" ON "company_flows" USING btree ("category","flow_date");