CREATE TYPE "public"."acct_import_kind" AS ENUM('STRUCTURES', 'FACTURES');--> statement-breakpoint
CREATE TYPE "public"."acct_import_mode" AS ENUM('IGNORER', 'METTRE_A_JOUR');--> statement-breakpoint
CREATE TYPE "public"."acct_import_status" AS ENUM('EN_COURS', 'TERMINE', 'ERREUR');--> statement-breakpoint
CREATE TYPE "public"."acct_structure_type" AS ENUM('BOUTIQUE', 'TAWILA', 'DPS', 'TFM', 'FOURNISSEUR', 'PARTENAIRE', 'AUTRE');--> statement-breakpoint
ALTER TYPE "public"."attachment_entity" ADD VALUE 'ACCT_IMPORT';--> statement-breakpoint
CREATE TABLE "acct_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "acct_import_kind" NOT NULL,
	"mode" "acct_import_mode" NOT NULL,
	"file_name" text NOT NULL,
	"format" text NOT NULL,
	"file_id" uuid,
	"status" "acct_import_status" DEFAULT 'EN_COURS' NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"processed_rows" integer DEFAULT 0 NOT NULL,
	"created_rows" integer DEFAULT 0 NOT NULL,
	"updated_rows" integer DEFAULT 0 NOT NULL,
	"skipped_rows" integer DEFAULT 0 NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "acct_structures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"company" text,
	"contact_name" text,
	"phone" text,
	"email" text,
	"credit_available" numeric(12, 2),
	"last_order_date" date,
	"address" text,
	"postal_code" text,
	"city" text,
	"vat_number" text,
	"siret" text,
	"type" "acct_structure_type" DEFAULT 'AUTRE' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"store_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "acct_imports" ADD CONSTRAINT "acct_imports_file_id_file_attachments_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file_attachments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acct_imports" ADD CONSTRAINT "acct_imports_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acct_structures" ADD CONSTRAINT "acct_structures_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "acct_imports_kind_idx" ON "acct_imports" USING btree ("kind","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "acct_structures_code_unique" ON "acct_structures" USING btree ("code");--> statement-breakpoint
CREATE INDEX "acct_structures_type_idx" ON "acct_structures" USING btree ("type");