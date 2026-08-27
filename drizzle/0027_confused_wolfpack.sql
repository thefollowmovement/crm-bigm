CREATE TYPE "public"."external_category" AS ENUM('CLIENT_EXTERNE', 'INFLUENCEUR', 'FRANCHISE', 'AUTRE');--> statement-breakpoint
CREATE TYPE "public"."transmission_case" AS ENUM('FACTURE_INFLUENCEUR', 'FACTURE_TICKET', 'ACHAT_SUCCURSALE', 'NOTE_DE_FRAIS', 'QUITTANCE', 'FACTURE_FOURNISSEUR', 'AUTRE');--> statement-breakpoint
CREATE TYPE "public"."transmission_origin" AS ENUM('INTERNE', 'EXTERNE');--> statement-breakpoint
CREATE TYPE "public"."transmission_status" AS ENUM('EN_ATTENTE', 'VALIDEE', 'REJETEE', 'TRAITEE');--> statement-breakpoint
CREATE TYPE "public"."transmission_type" AS ENUM('DEMANDE', 'FACTURE');--> statement-breakpoint
ALTER TYPE "public"."attachment_entity" ADD VALUE 'TRANSMISSION';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'COMPTABILITE';--> statement-breakpoint
CREATE TABLE "transmission_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transmission_id" uuid NOT NULL,
	"user_id" uuid,
	"old_status" "transmission_status",
	"new_status" "transmission_status" NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transmissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "transmissions_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"type" "transmission_type" NOT NULL,
	"origin" "transmission_origin" DEFAULT 'INTERNE' NOT NULL,
	"emitter_user_id" uuid,
	"external_name" text,
	"external_email" text,
	"external_category" "external_category",
	"target_pole" "pole" DEFAULT 'COMPTABILITE' NOT NULL,
	"structure_id" uuid,
	"store_id" uuid,
	"ticket_id" uuid,
	"case_type" "transmission_case" NOT NULL,
	"amount" numeric(12, 2),
	"subject" text NOT NULL,
	"message" text,
	"status" "transmission_status" DEFAULT 'EN_ATTENTE' NOT NULL,
	"submitted_ip" text,
	"invoice_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transmission_events" ADD CONSTRAINT "transmission_events_transmission_id_transmissions_id_fk" FOREIGN KEY ("transmission_id") REFERENCES "public"."transmissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transmission_events" ADD CONSTRAINT "transmission_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transmissions" ADD CONSTRAINT "transmissions_emitter_user_id_users_id_fk" FOREIGN KEY ("emitter_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transmissions" ADD CONSTRAINT "transmissions_structure_id_acct_structures_id_fk" FOREIGN KEY ("structure_id") REFERENCES "public"."acct_structures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transmissions" ADD CONSTRAINT "transmissions_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transmissions" ADD CONSTRAINT "transmissions_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transmissions" ADD CONSTRAINT "transmissions_invoice_id_acct_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."acct_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transmission_events_transmission_idx" ON "transmission_events" USING btree ("transmission_id");--> statement-breakpoint
CREATE INDEX "transmissions_status_idx" ON "transmissions" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "transmissions_emitter_idx" ON "transmissions" USING btree ("emitter_user_id");--> statement-breakpoint
CREATE INDEX "transmissions_structure_idx" ON "transmissions" USING btree ("structure_id");