CREATE TYPE "public"."acct_class" AS ENUM('CHARGE', 'PRODUIT');--> statement-breakpoint
CREATE TYPE "public"."acct_invoice_status" AS ENUM('EN_ATTENTE', 'PAYEE', 'EN_RETARD', 'IMPAYEE', 'ANNULEE');--> statement-breakpoint
CREATE TYPE "public"."acct_invoice_type" AS ENUM('STANDARD', 'RFA');--> statement-breakpoint
CREATE TYPE "public"."acct_piece_type" AS ENUM('FACTURE', 'AVOIR');--> statement-breakpoint
CREATE TYPE "public"."acct_source" AS ENUM('SAISIE', 'IMPORT_XLSX', 'IMPORT_XLS', 'IMPORT_XLSB', 'IMPORT_CSV', 'LOGICIEL', 'TRANSMISSION');--> statement-breakpoint
CREATE TABLE "acct_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"piece_number" text NOT NULL,
	"piece_type" "acct_piece_type" NOT NULL,
	"invoice_type" "acct_invoice_type" DEFAULT 'STANDARD' NOT NULL,
	"account_class" "acct_class" NOT NULL,
	"piece_date" date NOT NULL,
	"due_date" date,
	"structure_id" uuid NOT NULL,
	"amount_ht" numeric(12, 2) NOT NULL,
	"amount_vat" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"amount_ttc" numeric(12, 2) NOT NULL,
	"company" text,
	"source" "acct_source" DEFAULT 'SAISIE' NOT NULL,
	"status" "acct_invoice_status" DEFAULT 'EN_ATTENTE' NOT NULL,
	"label" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "acct_invoices" ADD CONSTRAINT "acct_invoices_structure_id_acct_structures_id_fk" FOREIGN KEY ("structure_id") REFERENCES "public"."acct_structures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "acct_invoices_piece_number_unique" ON "acct_invoices" USING btree ("piece_number");--> statement-breakpoint
CREATE INDEX "acct_invoices_structure_date_idx" ON "acct_invoices" USING btree ("structure_id","piece_date");--> statement-breakpoint
CREATE INDEX "acct_invoices_class_date_idx" ON "acct_invoices" USING btree ("account_class","piece_date");--> statement-breakpoint
CREATE INDEX "acct_invoices_status_idx" ON "acct_invoices" USING btree ("status");