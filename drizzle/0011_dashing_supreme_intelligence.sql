CREATE TYPE "public"."interest_level" AS ENUM('FAIBLE', 'MOYEN', 'FORT');--> statement-breakpoint
CREATE TYPE "public"."premises_status" AS ENUM('DISPONIBLE', 'EN_NEGOCIATION', 'RETENU', 'ECARTE');--> statement-breakpoint
CREATE TYPE "public"."prospect_event_type" AS ENUM('APPEL', 'EMAIL', 'RDV', 'COURRIER', 'STATUT', 'NOTE');--> statement-breakpoint
CREATE TYPE "public"."prospect_status" AS ENUM('NOUVEAU', 'CONTACTE', 'QUALIFIE', 'RDV', 'DIP', 'RECHERCHE_LOCAL', 'CONTRAT', 'OUVERTURE', 'ABANDONNE');--> statement-breakpoint
CREATE TYPE "public"."resale_status" AS ENUM('ACTIVE', 'SUSPENDUE', 'CONCLUE', 'ANNULEE');--> statement-breakpoint
CREATE TYPE "public"."resale_wish" AS ENUM('VENTE_TOTALE', 'VENTE_PARTIELLE', 'RECHERCHE_ASSOCIE');--> statement-breakpoint
ALTER TYPE "public"."attachment_entity" ADD VALUE 'PROSPECT';--> statement-breakpoint
ALTER TYPE "public"."attachment_entity" ADD VALUE 'PREMISES';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'DEVELOPPEMENT';--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"agency" text,
	"email" text,
	"phone" text,
	"zone" text,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "premises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"address" text NOT NULL,
	"city" text NOT NULL,
	"postal_code" text,
	"surface_m2" numeric(7, 1),
	"monthly_rent" numeric(12, 2),
	"lease_rights" numeric(12, 2),
	"status" "premises_status" DEFAULT 'DISPONIBLE' NOT NULL,
	"agent_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospect_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prospect_id" uuid NOT NULL,
	"type" "prospect_event_type" NOT NULL,
	"event_date" date NOT NULL,
	"notes" text,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"city" text,
	"target_zone" text,
	"budget" numeric(12, 2),
	"personal_contribution" numeric(12, 2),
	"lead_source" text,
	"interest_level" "interest_level",
	"status" "prospect_status" DEFAULT 'NOUVEAU' NOT NULL,
	"agent_id" uuid,
	"assignee_id" uuid,
	"next_follow_up_date" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resale_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"wish" "resale_wish" NOT NULL,
	"asking_price" numeric(12, 2),
	"urgency" "ticket_priority" DEFAULT 'NORMALE' NOT NULL,
	"status" "resale_status" DEFAULT 'ACTIVE' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "premises" ADD CONSTRAINT "premises_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_events" ADD CONSTRAINT "prospect_events_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_events" ADD CONSTRAINT "prospect_events_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resale_listings" ADD CONSTRAINT "resale_listings_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "premises_status_idx" ON "premises" USING btree ("status");--> statement-breakpoint
CREATE INDEX "prospect_events_prospect_idx" ON "prospect_events" USING btree ("prospect_id","event_date");--> statement-breakpoint
CREATE INDEX "prospects_status_idx" ON "prospects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "prospects_follow_up_idx" ON "prospects" USING btree ("next_follow_up_date");--> statement-breakpoint
CREATE INDEX "resale_listings_status_idx" ON "resale_listings" USING btree ("status");